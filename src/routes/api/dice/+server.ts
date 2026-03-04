
import { json } from '@sveltejs/kit';
import { createGame, performAction, joinGame, type DiceGameState } from '$lib/dice/game';
import { addBlock } from '$lib/blockchain/chain';
import { verifyToken, getUserName } from '$lib/server/auth';

// In-memory store for active games (similar to poker)
const games = new Map<string, DiceGameState>();

export async function POST({ request, cookies }) {
    const token = cookies.get('token');
    const authHeader = request.headers.get('Authorization');
    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const actualToken = headerToken || token; 

    if (!actualToken) return json({ error: 'Unauthorized' }, { status: 401 });

    const decoded = verifyToken(actualToken);
    
    if (!decoded) return json({ error: 'Invalid token' }, { status: 401 });

    const { userId, name: userName } = decoded;

    const { action, gameId, payload } = await request.json();

    if (action === 'create') {
        const { stakes } = payload || {};
        // Check if user already has a pending game? (Optional)
        
        const dbName = getUserName(userId);
        const game = createGame(userId, dbName || userName, 'waiting', 'Waiting User', stakes || 'full');
        games.set(game.id, game);

        // @ts-ignore
        globalThis.io?.emit('game_update', { game: 'dice' });

        return json({ success: true, game });
    }

    if (action === 'join') {
        if (!gameId) return json({ error: 'Missing gameId' }, { status: 400 });
        
        try {
            const existingGame = games.get(gameId);
            if (!existingGame) return json({ error: 'Game not found' }, { status: 404 });

            const dbName = getUserName(userId);
            const game = joinGame(existingGame, userId, dbName || userName);

            // @ts-ignore
            globalThis.io?.emit('game_update', { game: 'dice' });

            return json({ success: true, game });
        } catch (e: any) {
             return json({ error: e.message }, { status: 400 });
        }
    }
    
    if (action === 'leave') {
        // Allow user to leave/clear the game
        if (gameId && games.has(gameId)) {
             // We could check if they are actually in it, but for now just clear it if they know the ID?
             // Better: Check if userId is a player.
             const g = games.get(gameId)!;
             if (g.players.some(p => p.id === userId)) {
                 games.delete(gameId);
             }
        }

        // @ts-ignore
        globalThis.io?.emit('game_update', { game: 'dice' });

        return json({ success: true });
    }
    
    // Actions requiring gameId
    const game = games.get(gameId);
    if (!game) return json({ error: 'Game not found' }, { status: 404 });

    try {
        // Prevent actions on completed games except leave (handled above)
        if (game.phase === 'complete') {
             return json({ success: true, game });
        }

        const updatedGame = performAction(game, userId, action, payload);
        
        if (updatedGame.phase === 'complete' && updatedGame.winner) {
            // Check if we already recorded this to avoid dupes
            if (!(updatedGame as any).resultsRecorded) {
                // Record result on blockchain if playing for stakes
                if (updatedGame.stakes !== 'none') {
                    const points = updatedGame.stakes === 'full' ? 1 : 0.5;
                    const winnerId = updatedGame.winner;
                    
                    // Construct block data
                    const blockData: any = { 
                        type: 'dice_win', 
                        winner: winnerId,
                        loser: updatedGame.players.find(p => p.id !== winnerId)?.id,
                        description: `Won Liar's Dice (${points} pts): ${updatedGame.winReason}`,
                        approvedBy: [updatedGame.players[0].id, updatedGame.players[1].id], 
                        timestamp: Date.now(),
                        amount: points
                    };

                    await addBlock(blockData);
                }
                (updatedGame as any).resultsRecorded = true;
            }
            // Do NOT delete game here. User must click 'leave'.
        }
        
        games.set(gameId, updatedGame);

        // @ts-ignore
        globalThis.io?.emit('game_update', { game: 'dice' });

        return json({ success: true, game: updatedGame });
    } catch (e: any) {
        return json({ error: e.message }, { status: 400 });
    }
}

export async function GET({ url, request, cookies }) {
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

    const id = url.searchParams.get('id');
    if (id) {
        return json(games.get(id) || null);
    }

    // Auto-join: Check if user is already in a game
    if (userId) {
        const activeGame = Array.from(games.values()).find(g => g.players.some(p => p.id === userId));
        if (activeGame) {
            return json({ type: 'game', game: activeGame });
        }
    }

    // List waiting games
    const waiting = Array.from(games.values()).filter(g => g.players[1].id === 'waiting');
    return json({ type: 'lobby', games: waiting });
}
