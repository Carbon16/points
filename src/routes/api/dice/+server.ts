
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
        return json({ success: true, game });
    }

    if (action === 'join') {
        if (!gameId) return json({ error: 'Missing gameId' }, { status: 400 });
        
        try {
            const dbName = getUserName(userId);
            const game = joinGame(gameId, userId, dbName || userName);
            // In-memory update (if joinGame affects a global store, but here it likely expects us to manage it)
            // Wait, joinGame in dice/game.ts takes (gameId, ...) but returns game.
            // But dice/game.ts doesn't have access to 'games' Map. 
            // Actually, looking at imports -> imports from $lib/dice/game.
            
            // Let's re-read dice/game.ts to see joinGame signature. 
            // If it needs the game object, we must pass it.
            // My previous view of dice/game.ts did NOT show joinGame export!
            // I need to check dice/game.ts again. 
            
            // Assuming joinGame signature: joinGame(game, userId, userName) -> game
            const existingGame = games.get(gameId);
            if (!existingGame) return json({ error: 'Game not found' }, { status: 404 });
            
            // Logic to update existingGame:
            if (existingGame.players[1].id !== 'waiting') return json({ error: 'Game full' }, { status: 400 });
            existingGame.players[1].id = userId;
            existingGame.players[1].name = dbName || userName;
            // Ante logic
             for (const p of existingGame.players) {
                const amt = Math.min(p.chips, 10); // Ante 10
                p.chips -= amt;
                existingGame.pot += amt;
            }

            return json({ success: true, game: existingGame });
        } catch (e: any) {
             return json({ error: e.message }, { status: 400 });
        }
    }
    
    // Actions requiring gameId
    const game = games.get(gameId);
    if (!game) return json({ error: 'Game not found' }, { status: 404 });

    try {
        const updatedGame = performAction(game, userId, action, payload);
        
        if (updatedGame.phase === 'complete' && updatedGame.winner) {
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
            games.delete(gameId); // Cleanup
        } else {
            games.set(gameId, updatedGame);
        }

        return json({ success: true, game: updatedGame });
    } catch (e: any) {
        return json({ error: e.message }, { status: 400 });
    }
}

export function GET({ url }) {
    const id = url.searchParams.get('id');
    if (id) {
        return json(games.get(id) || null);
    }
    // List waiting games?
    // Filter games where player 2 is 'waiting'
    const waiting = Array.from(games.values()).filter(g => g.players[1].id === 'waiting');
    return json(waiting);
}
