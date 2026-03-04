import { json } from '@sveltejs/kit';
import { createGame, performAction, joinGame, getPlayerView, startNextHand, isGameOver } from '$lib/blackjack/game';
import type { BlackjackGameState } from '$lib/types';
import { verifyToken, getUserName } from '$lib/server/auth';
import crypto from 'node:crypto'; // Assuming standard crypto import, change if needed
import { getDb } from '$lib/server/db'; // Import this if needed or adapt the map
import { addBlock } from '$lib/blockchain/chain';

// Simple in-memory store for now, like Dice
// Or match Poker's single game_state DB table?
// The prompt said "structued similarly to poker", which uses `game_state` table for a single global game.
// Blackjack might be better as a map if multiple players, but let's stick to the Poker global 'current_bj' state for simplicity 
// and to match the 'robust state management' request if that implies DB persistence.
// Let's use the DB to match poker exactly.

function loadGame(): BlackjackGameState | null {
	const db = getDb();
	const row = db.prepare("SELECT state FROM game_state WHERE id = 'current_bj'").get() as { state: string } | undefined;
	if (!row) return null;
	return JSON.parse(row.state);
}

function saveGame(game: BlackjackGameState): void {
	const db = getDb();
	db.prepare(
		"INSERT OR REPLACE INTO game_state (id, state, updated_at) VALUES ('current_bj', ?, ?)"
	).run(JSON.stringify(game), Math.floor(Date.now() / 1000));
}

function clearGame(): void {
	const db = getDb();
	db.prepare("DELETE FROM game_state WHERE id = 'current_bj'").run();
}


export async function POST({ request, cookies }) {
    const token = cookies.get('token');
    const authHeader = request.headers.get('Authorization');
    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const actualToken = headerToken || token; 

    if (!actualToken) return json({ error: 'Unauthorized' }, { status: 401 });

    const decoded = verifyToken(actualToken);
    
    if (!decoded) return json({ error: 'Invalid token' }, { status: 401 });

    const { userId, name: userName } = decoded;

    const { action, amount, payload } = await request.json();

    if (action === 'create') {
        const existing = loadGame();
		if (existing) {
			const { over } = isGameOver(existing);
			if (!over && existing.phase !== 'complete') {
				return json({ success: false, error: 'Game already in progress' }, { status: 400 });
			}
		}

        const { stakes } = payload || {};
        const dbName = getUserName(userId);
        const game = createGame(userId, dbName || userName, 'waiting', 'Waiting User', stakes || 'full');
        saveGame(game);

        // @ts-ignore
        globalThis.io?.emit('game_update', { game: 'blackjack' });

        return json({ success: true, game: getPlayerView(game, userId) });
    }

    if (action === 'join') {
        const game = loadGame();
        if (!game) return json({ error: 'Game not found' }, { status: 404 });
        
        try {
            const dbName = getUserName(userId);
            joinGame(game, userId, dbName || userName);
            saveGame(game);

            // @ts-ignore
            globalThis.io?.emit('game_update', { game: 'blackjack' });

            return json({ success: true, game: getPlayerView(game, userId) });
        } catch (e: any) {
             return json({ error: e.message }, { status: 400 });
        }
    }
    
    if (action === 'leave') {
        clearGame();

        // @ts-ignore
        globalThis.io?.emit('game_update', { game: 'blackjack' });

        return json({ success: true });
    }
    
    // Actions requiring active game
    let game = loadGame();
    if (!game) return json({ error: 'Game not found' }, { status: 404 });

    try {
        if (action === 'next-hand') {
            const { over } = isGameOver(game);
            if (over) {
                // Handle end of game chips transfer if needed? Or just clear.
                clearGame();

                // @ts-ignore
                globalThis.io?.emit('game_update', { game: 'blackjack' });

                return json({ success: true, game: { gameOver: true }});
            }

            game = startNextHand(game);
            saveGame(game);

            // @ts-ignore
            globalThis.io?.emit('game_update', { game: 'blackjack' });

            return json({ success: true, game: getPlayerView(game, userId) });
        }

        game = performAction(game, userId, action, amount);
        
        const { over, winner, loser } = isGameOver(game);
        if (over && winner && loser && game.stakes !== 'none' && !(game as any).resultsRecorded) {
            const points = game.stakes === 'full' ? 1 : 0.5;
            const blockData: any = { 
                type: 'blackjack_win', 
                winner: winner,
                loser: loser,
                description: `Won Blackjack (${points} pts)`,
                approvedBy: [game.players[0].id, game.players[1].id].filter(id => id !== 'waiting'), 
                timestamp: Date.now(),
                amount: points
            };
            await addBlock(blockData);
            (game as any).resultsRecorded = true;
        }

        saveGame(game);

        // @ts-ignore
        globalThis.io?.emit('game_update', { game: 'blackjack' });

        return json({ success: true, game: getPlayerView(game, userId) });

    } catch (e: any) {
        return json({ error: e.message }, { status: 400 });
    }
}

export async function GET({ request, cookies }) {
    // Auth Check
    const token = cookies.get('token');
    const authHeader = request.headers.get('Authorization');
    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const actualToken = headerToken || token;

    let userId: string | null = null;
    if (actualToken) {
        const decoded = verifyToken(actualToken);
        if (decoded) userId = decoded.userId;
    }

    if (!userId) return json({ error: 'Unauthorized' }, { status: 401 });

    const game = loadGame();
    
    if (game) {
        return json({ type: 'game', game: getPlayerView(game, userId) });
    }

    return json({ type: 'lobby', game: null });
}
