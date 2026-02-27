import { json } from '@sveltejs/kit';
import { createGame, joinGame, performAction, isGameOver } from '$lib/knucklebones/game';
import type { KnucklebonesGameState } from '$lib/types';
import { verifyToken, getUserName } from '$lib/server/auth';
import { getDb } from '$lib/server/db';

function loadGame(): KnucklebonesGameState | null {
	const db = getDb();
	const row = db.prepare("SELECT state FROM game_state WHERE id = 'current_kb'").get() as { state: string } | undefined;
	if (!row) return null;
	return JSON.parse(row.state);
}

function saveGame(game: KnucklebonesGameState): void {
	const db = getDb();
	db.prepare(
		"INSERT OR REPLACE INTO game_state (id, state, updated_at) VALUES ('current_kb', ?, ?)"
	).run(JSON.stringify(game), Math.floor(Date.now() / 1000));
}

function clearGame(): void {
	const db = getDb();
	db.prepare("DELETE FROM game_state WHERE id = 'current_kb'").run();
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

    const { action, colIndex } = await request.json();

    if (action === 'create') {
        const existing = loadGame();
		if (existing) {
			const { over } = isGameOver(existing);
			if (!over && existing.phase !== 'complete') {
				return json({ success: false, error: 'Game already in progress' }, { status: 400 });
			}
		}

        const dbName = getUserName(userId);
        const game = createGame(userId, dbName || userName, 'waiting', 'Waiting User');
        saveGame(game);
        return json({ success: true, game });
    }

    if (action === 'join') {
        const game = loadGame();
        if (!game) return json({ error: 'Game not found' }, { status: 404 });
        
        try {
            const dbName = getUserName(userId);
            joinGame(game, userId, dbName || userName);
            saveGame(game);
            return json({ success: true, game });
        } catch (e: any) {
             return json({ error: e.message }, { status: 400 });
        }
    }
    
    if (action === 'leave') {
        clearGame();
        return json({ success: true });
    }
    
    // Actions requiring active game
    let game = loadGame();
    if (!game) return json({ error: 'Game not found' }, { status: 404 });

    try {
        game = performAction(game, userId, action, colIndex);
        saveGame(game);
        return json({ success: true, game });
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
        return json({ type: 'game', game });
    }

    return json({ type: 'lobby', game: null });
}
