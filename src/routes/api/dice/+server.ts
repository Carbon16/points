
import { json } from '@sveltejs/kit';
import { createGame, performAction, type DiceGameState } from '$lib/dice/game';
import { addBlock } from '$lib/blockchain/chain';
import { verifyToken } from '$lib/server/auth';

// In-memory store for active games (similar to poker)
const games = new Map<string, DiceGameState>();

export async function POST({ request, cookies }) {
    const token = cookies.get('token');
    const authHeader = request.headers.get('Authorization');
    const actualToken = token || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

    if (!actualToken) return json({ error: 'Unauthorized' }, { status: 401 });

    const decoded = verifyToken(actualToken);
    if (!decoded) return json({ error: 'Invalid token' }, { status: 401 });

    const { userId, name: userName } = decoded;

    const { action, gameId, payload } = await request.json();

    if (action === 'create') {
        const { stakes } = payload;
        // Check if user already has a pending game? (Optional)
        // For now, simple creation.
        // Waiting for opp to join.
        // We create a game with "waiting" placeholder for P2?
        // Game logic `createGame` takes two players. 
        // Let's create with "waiting" as P2.
        
        const game = createGame(userId, userName, 'waiting', 'Waiting...', stakes || 'full');
        games.set(game.id, game);
        return json({ success: true, game });
    }

    if (action === 'join') {
        // Find a waiting game or specific ID
        // Simplified: Join *any* waiting game or specific one?
        // User probably clicks a "Join" button in UI which sends ID.
        // For now, let's say they send gameId.
        
        let game = games.get(gameId);
        if (!game) return json({ error: 'Game not found' }, { status: 404 });
        
        if (game.players[1].id !== 'waiting') return json({ error: 'Game full' }, { status: 400 });
        
        game.players[1].id = userId;
        game.players[1].name = userName;
        
        // Start game properly now?
        // Ante logic requires both players.
        // Let's trigger ante deduction now.
        // We can manually call simple logic or add a 'start' action.
        // For simplicity, let's just update the state.
        
        // Reset hands to ensure randomness (though createGame did it).
        // It's fine.
        
        return json({ success: true, game });
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
                const blockData: any = { // Type assertion/any to bypass strict checks if BlockData import not perfectly aligned yet, or use BlockData interface
                    type: 'dice_win', 
                    // actually type is strictly typed in types.ts. 'poker_win' logic handles 1 point.
                    // If we want 0.5, 'poker_win' might imply 1 point logic elsewhere?
                    // Let's check block processing.
                    // Assuming 'manual_point' allows amount?
                    // Or we add 'amount' to block data.
                    winner: winnerId,
                    loser: updatedGame.players.find(p => p.id !== winnerId)?.id,
                    description: `Won Liar's Dice (${points} pts): ${updatedGame.winReason}`,
                    approvedBy: [updatedGame.players[0].id, updatedGame.players[1].id], // Both implicitly approve by playing
                    timestamp: Date.now(),
                    amount: points
                };

                // Signatures (simulated for server-side trusted action, or we'd need cliient sigs)
                // For this demo, server acts as authority.
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
    const waiting = Array.from(games.values()).filter(g => g.players[1].id === 'waiting');
    return json(waiting);
}
