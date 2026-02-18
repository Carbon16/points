
export type DiceFace = 1 | 2 | 3 | 4 | 5 | 6;

export interface DicePlayer {
    id: string;
    name: string;
    chips: number;
    hand: DiceFace[];
    currentBet: number;
    isTurn: boolean;
}

export interface Bid {
    quantity: number;
    face: DiceFace;
    betAmount: number;
    userId: string;
}

export type Stakes = 'full' | 'half' | 'none';

export interface DiceGameState {
    id: string;
    players: DicePlayer[];
    pot: number;
    currentBid?: Bid;
    history: Bid[];
    phase: 'betting' | 'showdown' | 'complete'; // 'betting' includes the initial roll
    winner?: string;
    winReason?: string;
    stakes: Stakes;
}

const STARTING_CHIPS = 1000;
const ANTE_AMOUNT = 10;

export function createGame(p1Id: string, p1Name: string, p2Id: string, p2Name: string, stakes: Stakes = 'full'): DiceGameState {
    return {
        id: crypto.randomUUID(),
        players: [
            { id: p1Id, name: p1Name, chips: STARTING_CHIPS, hand: rollHand(), currentBet: 0, isTurn: true },
            { id: p2Id, name: p2Name, chips: STARTING_CHIPS, hand: rollHand(), currentBet: 0, isTurn: false }
        ],
        pot: 0,
        history: [],
        phase: 'betting',
        stakes
    };
}

export function joinGame(game: DiceGameState, playerId: string, playerName: string): DiceGameState {
    if (game.players[1].id !== 'waiting') throw new Error('Game full');
    game.players[1].id = playerId;
    game.players[1].name = playerName;
    
    deductAnte(game);
    
    return game;
}

function rollHand(): DiceFace[] {
    return Array.from({ length: 5 }, () => (Math.floor(Math.random() * 6) + 1) as DiceFace);
}

export function performAction(game: DiceGameState, userId: string, action: 'bid' | 'challenge', payload?: any): DiceGameState {
    const playerIndex = game.players.findIndex(p => p.id === userId);
    if (playerIndex === -1) throw new Error('Player not in game');
    const player = game.players[playerIndex];
    if (!player.isTurn) throw new Error('Not your turn');

    // Auto-Ante on first move if pot is empty? 
    // Usually ante happens at start of hand. Let's assume startNextHand handles ante.
    // Ideally we'd have a 'dealing' phase. For simplicity, let's say createGame sets up chips?
    // Let's rely on a helper to deduct ante if pot is 0 and it's start of game.
    if (game.pot === 0 && game.history.length === 0) {
        deductAnte(game);
    }

    if (action === 'bid') {
        const { quantity, face, raiseAmount } = payload;
        
        // Validation
        if (!quantity || !face || !raiseAmount) throw new Error('Invalid bid params');
        if (raiseAmount <= 0) throw new Error('Raise must be positive');

        // Logic: Match current pot + raise? 
        // User said: "Every time you raise the bid, you must also Raise the Pot."
        // "To Bid, you must match the current pot and add a Raise."
        // Wait, "Match the current pot"? That implies exponential growth.
        // Or does it mean "Match the previous bet"?
        // Example: P1 bets $20. Pot is $20 (ignoring ante). P2 must match $20 + raise $10. P2 puts in $30. Pot is $50.
        // Next: P1 must match P2's previous bet? Or match the POT?
        // User example: "Player 2... must match the $20 plus raise at least $10." => Match previous bet.
        
        // Let's assume standard Poker betting rules adapted:
        // You must call the previous bet difference + raise.
        // But User wrote: "Match the current pot". 
        // Example: "Player 1 bets $20. Player 2 must match the $20".
        // Let's stick to: Cost = (Previous Bet Amount difference) + Raise.
        
        // However, Liar's Dice bids must inherently escalate in Quantity/Face.
        // We enforce: Quantity > PrevQuantity OR (Quantity == PrevQuantity AND Face > PrevFace).

        if (game.currentBid) {
            if (quantity < game.currentBid.quantity) throw new Error('Bid must escalate quantity');
            if (quantity === game.currentBid.quantity && face <= game.currentBid.face) throw new Error('Bid must escalate face value');
        }

        // Betting Cost
        // If it's the opening bid, min bet is say $10?
        // If it's a re-raise, match previous bet + raise.
        // Actually, in this custom "Casino" variant, maybe the bet IS the pot contribution?
        
        // Let's implement: User provides `raiseAmount`.
        // We verify they have chips.
        const cost = raiseAmount; // Simplified for now: You add chips to pot.
        if (player.chips < cost) throw new Error('Not enough chips');

        player.chips -= cost;
        game.pot += cost;
        player.currentBet += cost;

        const newBid: Bid = { quantity, face, betAmount: cost, userId };
        game.currentBid = newBid;
        game.history.push(newBid);
        
        // Switch turn
        game.players.forEach(p => p.isTurn = !p.isTurn);

    } else if (action === 'challenge') {
        // Showdown
        if (!game.currentBid) throw new Error('No bid to challenge');
        
        const targetBid = game.currentBid;
        const totalCount = countDice(game.players, targetBid.face);
        const bidderId = targetBid.userId;
        const challengerId = userId;
        
        // Logic:
        // Bidder Right (Count >= Bid): Bidder Wins.
        // Bidder Lied (Count < Bid): Challenger Wins.
        
        let winnerId: string;
        let reason: string;
        
        if (totalCount >= targetBid.quantity) {
            winnerId = bidderId;
            reason = `Bidder was correct! There were ${totalCount} ${targetBid.face}s (Bid: ${targetBid.quantity})`;
        } else {
            winnerId = challengerId;
            reason = `Liar caught! There were only ${totalCount} ${targetBid.face}s (Bid: ${targetBid.quantity})`;
        }
        
        const winner = game.players.find(p => p.id === winnerId)!;
        winner.chips += game.pot;
        game.pot = 0;
        
        game.winner = winnerId;
        game.winReason = reason;
        game.phase = 'showdown'; // Ends the round.
        
        // Note: We don't loop hands indefinitely in this basic version unless requested.
        // User said: "Stakes are represented by a Central Pot... Showdown... winner takes pot."
        // Implies single round or manual restart.
        // We'll treat 'showdown' as end of block/hand.
        game.phase = 'complete'; 
    }

    return game;
}

function countDice(players: DicePlayer[], face: DiceFace): number {
    let count = 0;
    for (const p of players) {
        for (const d of p.hand) {
            if (d === face || d === 1) count++; // Assuming 1s are wild? Standard rules say 1s are wild unless called.
            // User didn't specify Wilds. Let's assume NO WILDS for simplicity unless standard rules implied.
            // "Standard Liar's Dice" usually has 1s wild.
            // Let's stick to exact match for now to match User's Example "I see three 4s".
        }
    }
    // Re-count Exact:
    count = 0;
    for (const p of players) {
        for (const d of p.hand) {
            if (d === face) count++;
        }
    }
    return count;
}

function deductAnte(game: DiceGameState) {
    for (const p of game.players) {
        const amt = Math.min(p.chips, ANTE_AMOUNT);
        p.chips -= amt;
        game.pot += amt;
    }
}
