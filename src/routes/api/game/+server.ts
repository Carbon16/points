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

	return json({ success: true, data: getPlayerView(game, user.userId) });
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
				console.warn('User has no public key for verification');
			}
		} catch (e) {
			console.error('Signature verification failed:', e);
			return json({ success: false, error: 'Security verification failed' }, { status: 403 });
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
			return json({ success: true, data: getPlayerView(game, user.userId) });
		} catch (err) {
			return json({ success: false, error: err instanceof Error ? err.message : 'Failed to join' }, { status: 400 });
		}
	}

	// Create new game
	if (action === 'create') {
		const existing = loadGame();
		if (existing && existing.phase !== 'complete') {
			return json({ success: false, error: 'Game already in progress' }, { status: 400 });
		}



		const dbName = getUserName(user.userId);
		const game = createGame(user.userId, dbName || user.name, 'waiting', 'Waiting...', playForPoints ?? true);
		// Phase is 'waiting' by default now
		saveGame(game);

		await notifyOtherUser(user.userId, {
			title: 'Poker??',
			body: `${user.name} wants to play poker!`,
			url: '/poker'
		});

		return json({ success: true, data: getPlayerView(game, user.userId) });
	}

	// Next hand
	if (action === 'next-hand') {
		let game = loadGame();
		if (!game) return json({ success: false, error: 'No game' }, { status: 400 });

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
		return json({ success: true, data: getPlayerView(game, user.userId) });
	}

	// Player action
	if (['check', 'bet', 'call', 'raise', 'fold', 'all-in', 'start'].includes(action)) {
		const game = loadGame();
		if (!game) return json({ success: false, error: 'No game' }, { status: 400 });

		try {
			performAction(game, user.userId, action, amount);
			saveGame(game);

			const { over, winner, loser } = isGameOver(game);
			const view = getPlayerView(game, user.userId);

			return json({
				success: true,
				data: { game: view, gameOver: over, winner, loser }
			});
		} catch (err) {
			return json({
				success: false,
				error: err instanceof Error ? err.message : 'Invalid action'
			}, { status: 400 });
		}
	}

	// End/abandon game
	if (action === 'end') {
		clearGame();
		return json({ success: true });
	}

	return json({ success: false, error: 'Unknown action' }, { status: 400 });
};
