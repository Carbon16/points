import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyToken, getUserName } from '$lib/server/auth';
import { createGame, performAction, startNextHand, getPlayerView, isGameOver, joinGame } from '$lib/poker/game';
import { addBlock } from '$lib/blockchain/chain';
import { getDb, saveGameAction } from '$lib/server/db';
import crypto from 'node:crypto';
import { notifyOtherUser } from '$lib/server/push';
import type { GameState } from '$lib/types';

function getAuthUser(request: Request) {
	const auth = request.headers.get('authorization');
	// Allow 'waiting' placeholder to be viewed as "me" (hack for join logic?) No.
	// We should just return null if auth header is missing or invalid.
	if (!auth?.startsWith('Bearer ')) return null;
	return verifyToken(auth.slice(7));
}

function loadGame(): GameState | null {
	const db = getDb();
	const row = db.prepare("SELECT state FROM game_state WHERE id = 'current'").get() as { state: string } | undefined;
	if (!row) return null;
	return JSON.parse(row.state);
}

function saveGame(game: GameState): void {
	const db = getDb();
	db.prepare(
		"INSERT OR REPLACE INTO game_state (id, state, updated_at) VALUES ('current', ?, ?)"
	).run(JSON.stringify(game), Math.floor(Date.now() / 1000));
}

function clearGame(): void {
	const db = getDb();
	db.prepare("DELETE FROM game_state WHERE id = 'current'").run();
}

// GET /api/game — get current game state
export const GET: RequestHandler = async ({ request }) => {
	const user = getAuthUser(request);
	if (!user) return json({ success: false, error: 'Unauthorized' }, { status: 401 });

	const game = loadGame();
	if (!game) return json({ success: true, data: null });

	const { over, winner, loser } = isGameOver(game);
	// Don't report absolute game over during showdown - let them see the result
	const reportOver = over && game.phase !== 'showdown';

	const responseData:any = {
		...getPlayerView(game, user.userId),
		gameOver: reportOver
	};
	
	if (reportOver) {
		responseData.winner = winner;
		responseData.loser = loser;
	}

	return json({ 
		success: true, 
		data: responseData
	});
};

// POST /api/game — game actions
export const POST: RequestHandler = async ({ request }) => {
	const user = getAuthUser(request);
	if (!user) return json({ success: false, error: 'Unauthorized' }, { status: 401 });

	const body = await request.json();
	const { action, amount, security, playForPoints } = body;

	// Verify Non-Repudiation Signature if present
	if (security) {
		try {
			const packet = JSON.parse(security.payload);
			// Validate payload matches request
			if (packet.action !== action) throw new Error('Payload mismatch (action)');
			if (packet.userId !== user.userId) throw new Error('Payload mismatch (user)');

			// Get Public Key
			const db = getDb();
			const userRow = db.prepare('SELECT public_key FROM users WHERE id = ?').get(user.userId) as { public_key: string };
			
			if (userRow?.public_key) {
				const publicKey = crypto.createPublicKey({
					key: `-----BEGIN PUBLIC KEY-----\n${userRow.public_key}\n-----END PUBLIC KEY-----`,
					format: 'pem'
				});

				const signatureBuf = Buffer.from(security.signature, 'base64');
				const isVerified = crypto.verify(
					'sha256',
					Buffer.from(security.payload),
					{
						key: publicKey,
						dsaEncoding: 'ieee-p1363' // Web Crypto (P-256) uses raw P1363 format
					},
					signatureBuf
				);

				if (!isVerified) {
					console.warn('Invalid Signature');
					console.log('Payload:', security.payload);
					console.log('Sig:', security.signature);
				}

				// Log Action
				saveGameAction({
					id: crypto.randomUUID(),
					game_id: packet.gameId,
					hand_number: packet.handNumber,
					user_id: user.userId,
					action_type: action,
					amount: packet.amount,
					signature: security.signature,
					timestamp: packet.timestamp
				});
			} else {
				console.warn('User has no public key for verification', user.userId);
			}
		} catch (e) {
			console.error('Signature verification failed:', e);
			// Do not block for now, just log
			// return json({ success: false, error: 'Security verification failed' }, { status: 403 });
		}
	} else if (['bet', 'check', 'call', 'raise', 'all-in', 'fold', 'join'].includes(action)) {
		// Optional: Enforce specific actions to be signed
	}

	// Join game
	if (action === 'join') {
		const game = loadGame();
		if (!game) return json({ success: false, error: 'No game' }, { status: 400 });

		try {
			const dbName = getUserName(user.userId);
			joinGame(game, user.userId, dbName || user.name);
			saveGame(game);
			// @ts-ignore
			globalThis.io?.emit('game_update', { game: 'poker' });
			return json({ success: true, data: getPlayerView(game, user.userId) });
		} catch (err) {
			return json({ success: false, error: err instanceof Error ? err.message : 'Failed to join' }, { status: 400 });
		}
	}

	// Create new game
	if (action === 'create') {
		const existing = loadGame();
		// If game exists and is NOT complete/over, prevents creating new one.
		if (existing) {
			const { over } = isGameOver(existing);
			if (!over && existing.phase !== 'complete') {
				return json({ success: false, error: 'Game already in progress' }, { status: 400 });
			}
		}

		const dbName = getUserName(user.userId);
		const game = createGame(user.userId, dbName || user.name, 'waiting', 'Waiting...', playForPoints ?? true);
		saveGame(game);

		await notifyOtherUser(user.userId, {
			title: 'Poker??',
			body: `${user.name} wants to play poker!`,
			url: '/casino/poker'
		});

		// @ts-ignore
		globalThis.io?.emit('game_update', { game: 'poker' });

		return json({ success: true, data: getPlayerView(game, user.userId) });
	}

	// Next hand
	if (action === 'next-hand') {
		let game = loadGame();
		if (!game) return json({ success: false, error: 'No game' }, { status: 400 });

		// CRITICAL FIX: Race Condition Graceful Handling
		// If phase is betting or dealing, the hand is already active. 
		// Instead of erroring, just return the current state (User B catches up to User A).
		if (game.phase !== 'showdown' && game.phase !== 'complete' && game.phase !== 'waiting') {
			return json({ success: true, data: getPlayerView(game, user.userId) });
		}

		const { over, winner, loser } = isGameOver(game);
		if (over) {
			// Record point on blockchain IF playing for points
			if (game.playForPoints !== false) {
				// Prevent saving blocks with 'waiting' placeholder
				if (winner === 'waiting' || loser === 'waiting') {
					console.error('Cannot save block with placeholder user');
				} else {
					addBlock({
						type: 'poker_win',
						winner: winner!,
						loser: loser!,
						approvedBy: [winner!, loser!],
						timestamp: Date.now()
					});
				}
			}
			clearGame();
			return json({
				success: true,
				data: { gameOver: true, winner, loser }
			});
		}

		game = startNextHand(game);
		saveGame(game);

		// @ts-ignore
		globalThis.io?.emit('game_update', { game: 'poker' });
		
		return json({ success: true, data: getPlayerView(game, user.userId) });
	}

	// Player action
	if (['check', 'bet', 'call', 'raise', 'fold', 'all-in', 'start'].includes(action)) {
		let game = loadGame();
		if (!game) return json({ success: false, error: 'No game' }, { status: 400 });

		try {
			performAction(game, user.userId, action, amount, body.handId);
			
			// DEBUG: Log Winner State
			if (game.phase === 'showdown') {
				console.log('--- SHOWDOWN ---');
				console.log('Winner:', game.winner);
				console.log('Reason:', game.winReason);
				console.log('Pot:', game.pot); // Should be 0 after distribution
			}

			saveGame(game);

			const { over, winner, loser } = isGameOver(game);
			const reportOver = over && game.phase !== 'showdown';
			const view = getPlayerView(game, user.userId);

			const responseData: any = { 
				game: view, 
				gameOver: reportOver 
			};
			
			if (reportOver) {
				responseData.winner = winner;
				responseData.loser = loser;
			}

			// @ts-ignore
			globalThis.io?.emit('game_update', { game: 'poker' });

			return json({
				success: true,
				data: responseData
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Invalid action';
			
			// 1. Hand Mismatch (Sync Error) -> Return current state to re-sync client
			if (msg.includes('Hand mismatch')) {
				return json({ 
					success: true, 
					data: { game: getPlayerView(game, user.userId) },
					info: 'Game state updated' 
				});
			}

			// 2. Input/Logic Errors (User fault) -> Return error
			if (msg.includes('Invalid amount') || msg.includes('chips') || msg.includes('turn')) {
				return json({ success: false, error: msg }, { status: 400 });
			}

			// 3. Unknown/System/Corruption Errors -> Restart Hand (Recovery)
			console.error(`Poker Game Error (${action}):`, err);
			
			// Attempt to restart hand to unblock
			try {
				game = startNextHand(game);
				saveGame(game);
				
				// Notify failure but recovery
				return json({
					success: true,
					data: { game: getPlayerView(game, user.userId) },
					error: 'Game error detected. Hand has been restarted.'
				});
			} catch (restartErr) {
				return json({ success: false, error: 'Critical Game Error' }, { status: 500 });
			}
		}
	}

	// End/abandon game
	if (action === 'end') {
		clearGame();

		// @ts-ignore
		globalThis.io?.emit('game_update', { game: 'poker' });
		
		return json({ success: true });
	}

	return json({ success: false, error: 'Unknown action' }, { status: 400 });
};
