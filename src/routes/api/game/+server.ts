import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyToken } from '$lib/server/auth';
import { createGame, performAction, startNextHand, getPlayerView, isGameOver } from '$lib/poker/game';
import { addBlock } from '$lib/blockchain/chain';
import { getDb } from '$lib/server/db';
import { notifyOtherUser } from '$lib/server/push';
import type { GameState } from '$lib/types';

function getAuthUser(request: Request) {
	const auth = request.headers.get('authorization');
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

	const { action, amount } = await request.json();

	// Create new game
	if (action === 'create') {
		const existing = loadGame();
		if (existing && existing.phase !== 'complete') {
			return json({ success: false, error: 'Game already in progress' }, { status: 400 });
		}

		const game = createGame('player1', 'Player 1', 'player2', 'Player 2');
		game.phase = 'betting';
		saveGame(game);

		await notifyOtherUser(user.userId, {
			title: 'Poker Time! 🃏',
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
			// Record point on blockchain
			addBlock({
				type: 'poker_win',
				winner: winner!,
				loser: loser!,
				approvedBy: [winner!, loser!],
				timestamp: Date.now()
			});
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
	if (['check', 'bet', 'call', 'raise', 'fold', 'all-in'].includes(action)) {
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
