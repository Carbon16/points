import type { Card, BlackjackGameState, BlackjackPlayerState, BlackjackAction, Suit, Rank, BlackjackPhase } from '$lib/types';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function createDeck(numDecks: number = 2): Card[] {
	const deck: Card[] = [];
    for (let d = 0; d < numDecks; d++) {
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                deck.push({ suit, rank });
            }
        }
    }
	return shuffle(deck);
}

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const max = i + 1;
		const range = 0xFFFFFFFF;
		const limit = range - (range % max);
		const buffer = new Uint32Array(1);
		
		let rand;
		do {
			crypto.getRandomValues(buffer);
			rand = buffer[0];
		} while (rand >= limit);
		
		const j = rand % max;
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

export function calculateScore(hand: Card[]): number {
    let score = 0;
    let aces = 0;

    for (const card of hand) {
        if (card.rank === 'A') {
            aces++;
            score += 11;
        } else if (['J', 'Q', 'K'].includes(card.rank)) {
            score += 10;
        } else {
            score += parseInt(card.rank, 10);
        }
    }

    while (score > 21 && aces > 0) {
        score -= 10;
        aces--;
    }

    return score;
}

export function createGame(playerId: string, playerName: string, stakes: 'full' | 'half' | 'none' = 'full'): BlackjackGameState {
	return {
		id: crypto.randomUUID(),
		phase: 'waiting',
		players: [
			{
				id: playerId,
				name: playerName,
				chips: 250,
				hand: [],
				currentBet: 0,
				status: 'waiting',
                score: 0
			},
            {
				id: 'waiting',
				name: 'Waiting User',
				chips: 250,
				hand: [],
				currentBet: 0,
				status: 'waiting',
                score: 0
			}
		],
		deck: createDeck(),
		handNumber: 1,
        currentPlayerIndex: 0,
        pot: 0,
		winnerIds: [],
        pushIds: [],
        loserIds: [],
        stakes
	};
}

export function joinGame(game: BlackjackGameState, playerId: string, playerName: string): BlackjackGameState {
	if (game.phase !== 'waiting') throw new Error('Game already started');
	
	const emptySlotIndex = game.players.findIndex(p => p.id === 'waiting');
	if (emptySlotIndex === -1) {
        if (game.players.some(p => p.id === playerId)) return game;
        throw new Error('Game is full');
    }

	game.players[emptySlotIndex].id = playerId;
	game.players[emptySlotIndex].name = playerName;
	
    // Start the first hand
    startNewHand(game);

	return game;
}

function startNewHand(game: BlackjackGameState) {
    if (game.deck.length < 15) {
        game.deck = createDeck();
    }

    for (const player of game.players) {
        player.hand = [game.deck.pop()!, game.deck.pop()!];
        player.score = calculateScore(player.hand);
        player.status = 'betting';
        player.currentBet = 0;
    }

    game.phase = 'betting';
    game.currentPlayerIndex = 0;
    game.pot = 0;
    game.winnerIds = [];
    game.pushIds = [];
    game.loserIds = [];
    game.winReason = undefined;
}

function nextTurnBetting(game: BlackjackGameState) {
    const p1 = game.players[0];
    const p2 = game.players[1];

    if (p1.status === 'folded' || p2.status === 'folded') {
        endHand(game);
        return;
    }

    const betsMatch = p1.currentBet === p2.currentBet;
    const bothActed = p1.status !== 'betting' && p2.status !== 'betting'; // If they took an action this round

    if (bothActed && betsMatch) {
        // Move to playing phase
        if (p1.score === 21) p1.status = 'blackjack';
        else p1.status = 'playing';

        if (p2.score === 21) p2.status = 'blackjack';
        else p2.status = 'playing';

        game.phase = 'playing';
        game.currentPlayerIndex = 0;
        checkNextTurnPlaying(game);
    } else {
        game.currentPlayerIndex = (game.currentPlayerIndex + 1) % 2;
    }
}

function checkNextTurnPlaying(game: BlackjackGameState) {
    // If current player is done, move to next
    const p1 = game.players[0];
    const p2 = game.players[1];

    const isDone = (p: BlackjackPlayerState) => p.status === 'stood' || p.status === 'busted' || p.status === 'blackjack' || p.status === 'folded';

    if (game.currentPlayerIndex === 0 && isDone(p1)) {
        game.currentPlayerIndex = 1;
    }

    if (game.currentPlayerIndex === 1 && isDone(p2)) {
        // Both done, go to complete
        endHand(game);
    }
}

function endHand(game: BlackjackGameState) {
    game.phase = 'complete';
    const p1 = game.players[0];
    const p2 = game.players[1];

    // Pot is sum of bets
    game.pot = p1.currentBet + p2.currentBet;
    p1.chips -= p1.currentBet;
    p2.chips -= p2.currentBet;

    // Folding logic
    if (p1.status === 'folded') {
        game.winnerIds.push(p2.id);
        game.loserIds.push(p1.id);
        p2.chips += game.pot;
        game.winReason = `${p2.name} wins by default (opponent folded)`;
        return;
    }
    if (p2.status === 'folded') {
        game.winnerIds.push(p1.id);
        game.loserIds.push(p2.id);
        p1.chips += game.pot;
        game.winReason = `${p1.name} wins by default (opponent folded)`;
        return;
    }

    const getHandValue = (p: BlackjackPlayerState) => {
        if (p.status === 'busted') return -1;
        if (p.status === 'blackjack') return 22; // Treat BJ as higher than 21
        return p.score;
    };

    const val1 = getHandValue(p1);
    const val2 = getHandValue(p2);

    if (val1 > val2) {
        game.winnerIds.push(p1.id);
        game.loserIds.push(p2.id);
        p1.chips += game.pot;
        game.winReason = val1 === 22 ? "Blackjack!" : "High hand wins";
    } else if (val2 > val1) {
        game.winnerIds.push(p2.id);
        game.loserIds.push(p1.id);
        p2.chips += game.pot;
        game.winReason = val2 === 22 ? "Blackjack!" : "High hand wins";
    } else {
        // Tie
        game.pushIds.push(p1.id, p2.id);
        p1.chips += Math.floor(game.pot / 2);
        p2.chips += Math.ceil(game.pot / 2); // Split
        game.winReason = "Push (Tie)";
    }
}

export function performAction(game: BlackjackGameState, playerId: string, action: BlackjackAction, amount?: number): BlackjackGameState {
	const player = game.players.find((p) => p.id === playerId);
	if (!player) throw new Error('Player not in game');

    const pIndex = game.players.findIndex(p => p.id === playerId);
    if (game.currentPlayerIndex !== pIndex && game.phase !== 'waiting') {
        throw new Error('Not your turn');
    }

    const opponent = game.players[1 - pIndex];

	if (game.phase === 'betting') {
        if (action === 'fold') {
            player.status = 'folded';
            game.pot += player.currentBet;
            nextTurnBetting(game);
        } else if (action === 'check') {
            if (player.currentBet < opponent.currentBet) throw new Error('Cannot check, must call or fold');
            player.status = 'stood'; // Temporary status to mark action taken
            nextTurnBetting(game);
        } else if (action === 'call') {
            const diff = opponent.currentBet - player.currentBet;
            if (diff <= 0) throw new Error('Nothing to call');
            if (player.chips < diff) throw new Error('Not enough chips');
            player.currentBet += diff;
            player.status = 'stood';
            nextTurnBetting(game);
        } else if (action === 'bet') {
            const betAmount = amount || 0;
            if (betAmount <= 0) throw new Error('Invalid bet amount');
            if (betAmount > player.chips) throw new Error('Not enough chips');
            if (player.currentBet + betAmount < opponent.currentBet) {
                throw new Error('Bet amount must be at least enough to call');
            }
            player.currentBet += betAmount;
            player.status = 'stood';
            if (player.currentBet > opponent.currentBet && opponent.status !== 'folded') {
                opponent.status = 'betting';
            }
            nextTurnBetting(game);
        } else {
            throw new Error('Invalid action for betting phase');
        }

    } else if (game.phase === 'playing') {
        if (action === 'hit') {
            if (game.deck.length < 5) game.deck = createDeck();
            player.hand.push(game.deck.pop()!);
            player.score = calculateScore(player.hand);

            if (player.score > 21) {
                player.status = 'busted';
            }
            checkNextTurnPlaying(game);

        } else if (action === 'stand') {
            player.status = 'stood';
            checkNextTurnPlaying(game);

        } else if (action === 'double') {
             if (player.hand.length !== 2) throw new Error('Cannot double down now');
             if (player.chips < player.currentBet) throw new Error('Not enough chips');

             player.currentBet *= 2;
             if (game.deck.length < 5) game.deck = createDeck();
             player.hand.push(game.deck.pop()!);
             player.score = calculateScore(player.hand);

             if (player.score > 21) player.status = 'busted';
             else player.status = 'stood';

             checkNextTurnPlaying(game);
        } else {
            throw new Error('Invalid action for playing phase');
        }
    } else {
        throw new Error('Game not in an actionable phase');
    }

	return game;
}

export function isGameOver(game: BlackjackGameState): { over: boolean; winner?: string; loser?: string } {
	if (game.phase !== 'complete') {
		return { over: false };
	}

    let over = false;
	for (const player of game.players) {
		if (player.chips <= 0) {
            over = true;
		}
	}
    
    if (over) {
        const activePlayers = game.players.filter(p => p.id !== 'waiting');
        const sorted = [...activePlayers].sort((a,b) => b.chips - a.chips);
        if (sorted.length > 1) {
            return { over: true, winner: sorted[0].id, loser: sorted[1].id };
        } else if (sorted.length === 1) {
            return { over: true, loser: sorted[0].id };
        }
    }

	return { over: false };
}

export function startNextHand(game: BlackjackGameState): BlackjackGameState {
    if (game.phase !== 'complete') throw new Error('Current hand not complete');

	for (const player of game.players) {
		player.currentBet = 0;
        player.score = 0;
	}
    game.handNumber++;
    startNewHand(game);

	return game;
}

export function getPlayerView(game: BlackjackGameState, playerId: string): BlackjackGameState {
	const clone: BlackjackGameState = JSON.parse(JSON.stringify(game));
    
	if (clone.phase === 'betting' || clone.phase === 'playing') {
        // HIDDEN OPPONENT CARDS logic (User Request)
        // Players can only see the first card of the other's hand before the end of the game
        for (const player of clone.players) {
            if (player.id !== playerId && player.id !== 'waiting' && player.hand.length > 0) {
                // Keep the first card, hide the rest
                const visibleCard = player.hand[0];
                const hiddenCardsCount = player.hand.length - 1;
                
                const hiddenHand = [visibleCard];
                for (let i = 0; i < hiddenCardsCount; i++) {
                     hiddenHand.push({ suit: 'hearts', rank: '2', hidden: true } as any);
                }
                player.hand = hiddenHand;
                player.score = calculateScore([visibleCard]); // Only show score of visible card
            }
        }
	}
    
	clone.deck = [];
	return clone;
}
