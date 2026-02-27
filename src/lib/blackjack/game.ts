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

export function createGame(player1Id: string, player1Name: string, player2Id: string, player2Name: string): BlackjackGameState {
	return {
		id: crypto.randomUUID(),
		phase: 'betting',
		players: [
			{
				id: player1Id,
				name: player1Name,
				chips: 1000,
				hand: [],
				currentBet: 0,
				status: 'betting',
                score: 0
			},
			{
				id: player2Id,
				name: player2Name,
				chips: 1000,
				hand: [],
				currentBet: 0,
				status: 'betting',
                score: 0
			}
		],
		dealerHand: [],
        dealerScore: 0,
		deck: createDeck(),
		handNumber: 1,
		winnerIds: [],
        pushIds: [],
        loserIds: []
	};
}

export function joinGame(game: BlackjackGameState, playerId: string, playerName: string): BlackjackGameState {
	if (game.phase !== 'betting' && game.handNumber === 1) throw new Error('Game already started');
	
	const emptySlotIndex = game.players.findIndex(p => p.id === 'waiting');
	if (emptySlotIndex === -1) throw new Error('Game is full');

	game.players[emptySlotIndex].id = playerId;
	game.players[emptySlotIndex].name = playerName;
	
	return game;
}

function dealInitialCards(game: BlackjackGameState) {
    if (game.deck.length < 15) {
        game.deck = createDeck();
    }

    for (const player of game.players) {
        if (player.currentBet > 0) {
            player.hand = [game.deck.pop()!, game.deck.pop()!];
            player.score = calculateScore(player.hand);
            if (player.score === 21) {
                player.status = 'blackjack';
            } else {
                player.status = 'playing';
            }
        } else {
             // If a player didn't bet, they sit out this hand
            player.status = 'stood';
        }
    }

    game.dealerHand = [game.deck.pop()!, game.deck.pop()!];
    // We calculate dealer score later to keep hole card hidden if needed,
    // but typically we can calculate it server-side.
    game.dealerScore = calculateScore(game.dealerHand);

    game.phase = 'playing';

    checkPhaseTransition(game);
}

function checkPhaseTransition(game: BlackjackGameState) {
    if (game.phase === 'betting') {
        const allBet = game.players.every(p => p.status !== 'betting');
        // Only deal if someone actually placed a bet
        const someoneBet = game.players.some(p => p.currentBet > 0);
        
        if (allBet && someoneBet) {
            dealInitialCards(game);
        } else if (allBet && !someoneBet) {
             // Everyone skipped? Just end hand.
             endHand(game);
        }
    } else if (game.phase === 'playing') {
        const allDonePlaying = game.players.every(p => 
            p.status === 'stood' || p.status === 'busted' || p.status === 'blackjack' || p.currentBet === 0
        );

        if (allDonePlaying) {
            game.phase = 'dealer-turn';
            playDealer(game);
        }
    }
}

function playDealer(game: BlackjackGameState) {
    // Dealer must hit on 16 or lower, stand on 17+
    while (game.dealerScore < 17) {
        if (game.deck.length < 5) game.deck = createDeck();
        game.dealerHand.push(game.deck.pop()!);
        game.dealerScore = calculateScore(game.dealerHand);
    }

    endHand(game);
}

function endHand(game: BlackjackGameState) {
    game.phase = 'complete';

    const dealerBust = game.dealerScore > 21;
    const dealerBlackjack = game.dealerHand.length === 2 && game.dealerScore === 21;

    for (const player of game.players) {
        if (player.currentBet === 0) continue;

        if (player.status === 'busted') {
            game.loserIds.push(player.id);
        } else if (player.status === 'blackjack') {
             if (dealerBlackjack) {
                 // Push on double blackjack
                 player.chips += player.currentBet;
                 game.pushIds.push(player.id);
             } else {
                 // Blackjack pays 3:2 normally, we'll do 2:1 for simplicity or just 3:2
                 const winAmount = Math.floor(player.currentBet * 2.5);
                 player.chips += winAmount;
                 game.winnerIds.push(player.id);
             }
        } else {
             // Player stood
             if (dealerBust || player.score > game.dealerScore) {
                 player.chips += player.currentBet * 2;
                 game.winnerIds.push(player.id);
             } else if (player.score === game.dealerScore) {
                 player.chips += player.currentBet;
                 game.pushIds.push(player.id);
             } else {
                 game.loserIds.push(player.id);
             }
        }
    }
}

export function performAction(game: BlackjackGameState, playerId: string, action: BlackjackAction, amount?: number): BlackjackGameState {
	const playerOption = game.players.find((p) => p.id === playerId);
	if (!playerOption) throw new Error('Player not in game');
    const player = playerOption;

	if (action === 'bet') {
        if (game.phase !== 'betting') throw new Error('Not betting phase');
        if (player.status !== 'betting') throw new Error('Already bet');

        const betAmount = amount || 0;
        if (betAmount > player.chips) throw new Error('Not enough chips');
        
        player.chips -= betAmount;
        player.currentBet = betAmount;
        
        // If bet is 0, they skip the hand
        player.status = betAmount > 0 ? 'playing' : 'stood';
        
        checkPhaseTransition(game);

	} else if (action === 'hit') {
        if (game.phase !== 'playing') throw new Error('Not playing phase');
        if (player.status !== 'playing') throw new Error('Cannot hit now');

        if (game.deck.length < 5) game.deck = createDeck();
        player.hand.push(game.deck.pop()!);
        player.score = calculateScore(player.hand);

        if (player.score > 21) {
            player.status = 'busted';
        }

        checkPhaseTransition(game);

    } else if (action === 'stand') {
        if (game.phase !== 'playing') throw new Error('Not playing phase');
        if (player.status !== 'playing') throw new Error('Cannot stand now');

        player.status = 'stood';
        checkPhaseTransition(game);

    } else if (action === 'double') {
         if (game.phase !== 'playing') throw new Error('Not playing phase');
         if (player.status !== 'playing' || player.hand.length !== 2) throw new Error('Cannot double down now');
         if (player.chips < player.currentBet) throw new Error('Not enough chips to double');

         player.chips -= player.currentBet;
         player.currentBet *= 2;
         
         if (game.deck.length < 5) game.deck = createDeck();
         player.hand.push(game.deck.pop()!);
         player.score = calculateScore(player.hand);

         if (player.score > 21) {
             player.status = 'busted';
         } else {
             player.status = 'stood'; // Force stand after double
         }

         checkPhaseTransition(game);
    }

	return game;
}

export function isGameOver(game: BlackjackGameState): { over: boolean; winner?: string; loser?: string } {
	if (game.phase === 'betting' || game.phase === 'playing' || game.phase === 'dealer-turn') {
		return { over: false };
	}

    let over = false;
	for (const player of game.players) {
		if (player.chips <= 0) {
            over = true;
		}
	}
    
    if (over) {
        // Find whoever has the most chips
        const sorted = [...game.players].sort((a,b) => b.chips - a.chips);
        return { over: true, winner: sorted[0].id, loser: sorted[1].id };
    }

	return { over: false };
}

export function startNextHand(game: BlackjackGameState): BlackjackGameState {
    if (game.phase !== 'complete') throw new Error('Current hand not complete');

	for (const player of game.players) {
		player.hand = [];
		player.currentBet = 0;
        player.score = 0;
		player.status = 'betting';
	}

    game.dealerHand = [];
    game.dealerScore = 0;
	game.winnerIds = [];
    game.loserIds = [];
    game.pushIds = [];
	game.phase = 'betting';
    game.handNumber++;

	return game;
}

export function getPlayerView(game: BlackjackGameState, playerId: string): BlackjackGameState {
	const clone: BlackjackGameState = JSON.parse(JSON.stringify(game));
    
    // Hide dealer's hole card if playing
	if (clone.phase === 'playing') {
		if (clone.dealerHand.length > 0) {
            clone.dealerHand[0] = { suit: 'hearts', rank: '2' } as any; // Dummy hidden card
            (clone.dealerHand[0] as any).hidden = true;
            // Recalculate shown score for dealer
            clone.dealerScore = calculateScore([clone.dealerHand[1]]); 
        }
	}
    
	clone.deck = [];
	return clone;
}
