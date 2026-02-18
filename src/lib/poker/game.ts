import type { Card, GameState, PlayerAction, Suit, Rank } from '$lib/types';
import { STARTING_TOTAL } from './chips';
import { bestHand, compareHands } from './hand';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck(): Card[] {
	const deck: Card[] = [];
	for (const suit of SUITS) {
		for (const rank of RANKS) {
			deck.push({ suit, rank });
		}
	}
	return shuffle(deck);
}

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

export function __createGame(player1Id: string, player1Name: string, player2Id: string, player2Name: string, playForPoints: boolean = true): GameState {
	// Initialize in waiting state with empty hands
	return {
		id: crypto.randomUUID(),
		phase: 'waiting',
		players: [
			{
				id: player1Id,
				name: player1Name,
				chips: STARTING_TOTAL,
				hand: [],
				currentBet: 0,
				folded: false,
				isDealer: true
			},
			{
				id: player2Id,
				name: player2Name,
				chips: STARTING_TOTAL,
				hand: [],
				currentBet: 0,
				folded: false,
				isDealer: false
			}
		],
		pot: 0,
		communityCards: [],
		currentPlayerIndex: 0,
		deck: [],
		round: 0,
		handNumber: 1,
		playForPoints
	};
}

export { __createGame as createGame };

export function joinGame(game: GameState, playerId: string, playerName: string): GameState {
	if (game.phase !== 'waiting') throw new Error('Game already started');
	
	const emptySlotIndex = game.players.findIndex(p => p.id === 'waiting');
	if (emptySlotIndex === -1) throw new Error('Game is full');

	game.players[emptySlotIndex].id = playerId;
	game.players[emptySlotIndex].name = playerName;
	
	return game;
}

export function performAction(game: GameState, playerId: string, action: PlayerAction | 'start', amount?: number): GameState {
	const playerIndex = game.players.findIndex((p) => p.id === playerId);
	if (playerIndex === -1) throw new Error('Player not in game');
	
	if (action === 'start') {
		if (game.phase !== 'waiting') throw new Error('Game already started');
		
		// Ensure game is full
		if (game.players.some(p => p.id === 'waiting')) {
			throw new Error('Waiting for opponent to join');
		}

		// Determine who starts? Anyone can start the game from lobby
		return startNextHand(game);
	}

	if (playerIndex !== game.currentPlayerIndex) throw new Error('Not your turn');
	if (game.phase === 'complete' || game.phase === 'waiting') throw new Error('Game not in play');

	const player = game.players[playerIndex];
	const opponent = game.players[1 - playerIndex];

	switch (action) {
		case 'check': {
			if (player.currentBet < opponent.currentBet) throw new Error('Cannot check — must call or raise');
			break;
		}
		case 'bet': {
			const betAmount = amount || 5;
			if (betAmount > player.chips) throw new Error('Not enough chips');
			if (betAmount < 5) throw new Error('Minimum bet is 5');
			player.chips -= betAmount;
			player.currentBet += betAmount;
			game.pot += betAmount;
			break;
		}
		case 'call': {
			const callAmount = opponent.currentBet - player.currentBet;
			if (callAmount <= 0) throw new Error('Nothing to call');
			const actualCall = Math.min(callAmount, player.chips);
			player.chips -= actualCall;
			player.currentBet += actualCall;
			game.pot += actualCall;
			break;
		}
		case 'raise': {
			const raiseAmount = amount || 10;
			const toCall = opponent.currentBet - player.currentBet;
			const totalNeeded = toCall + raiseAmount;
			
			if (totalNeeded >= player.chips) {
				// Not enough to raise fully, or exactly all-in => Treat as All-In
				const allInAmount = player.chips;
				player.currentBet += allInAmount;
				game.pot += allInAmount;
				player.chips = 0;
				// Effectively an all-in
			} else {
				player.chips -= totalNeeded;
				player.currentBet += totalNeeded;
				game.pot += totalNeeded;
			}
			break;
		}
		case 'fold': {
			player.folded = true;
			// Opponent wins the pot
			opponent.chips += game.pot;
			game.pot = 0;
			return finishHand(game, opponent.id);
		}
		case 'all-in': {
			const allInAmount = player.chips;
			player.currentBet += allInAmount;
			game.pot += allInAmount;
			player.chips = 0;
			break;
		}
	}

	// Handle uncalled bet refund (Heads-up specific simplification)
	if (player.chips === 0 || opponent.chips === 0) {
		if (player.currentBet > opponent.currentBet) {
			// I bet more than opponent. Refund me ONLY if opponent is all-in (cannot call)
			if (opponent.chips === 0) {
				const refund = player.currentBet - opponent.currentBet;
				player.currentBet -= refund;
				player.chips += refund;
				game.pot -= refund;
			}
		} else if (opponent.currentBet > player.currentBet) {
			// Opponent bet more than I could call. Refund opponent because I am all-in
			if (player.chips === 0) {
				const refund = opponent.currentBet - player.currentBet;
				opponent.currentBet -= refund;
				opponent.chips += refund;
				game.pot -= refund;
			}
		}
	}

	const isPreFlop = game.round === 0;
	if (player.currentBet === opponent.currentBet) {
		const isDealer = player.isDealer;
		const isLastToAct = isPreFlop ? !isDealer : isDealer;

		// If bets are non-zero and equal, the pot is right => advance
		// (In heads-up, if I call a bet, we are done. If I raise, they aren't equal.)
		if (player.currentBet > 0) {
			advanceRound(game);
			return game;
		}

		// If bets are zero (check-check), only advance if I am last to act
		if (player.currentBet === 0 && isLastToAct) {
			advanceRound(game);
			return game;
		}

		// Otherwise (e.g. Dealer checked pre-flop? No, dealer is SB. 
		// If Dealer checks pre-flop (limp), bets are equal (5=5). Dealer acted. Last to act is BB. 
		// wait, if Dealer calls (5), bets are equal. Dealer is NOT last to act preflop. Round continues. Correct.
		// If BB checks. Bets equal. BB IS last to act preflop. Round advances. Correct.
		
		// What about Post-Flop?
		// BB (First) Checks (0). Bets equal. BB !LastToAct. Round continues.
		// Dealer (Last) Checks (0). Bets equal. Dealer IsLastToAct. Round advances. Correct.
		
		// The previous bug was:
		// Post-Flop: BB Checks. Dealer Bets. BB Calls.
		// Player is BB. Bets Equal (>0). 
		// Logic was: BB !LastToAct => Round Continues. (WRONG)
		// New Logic: Bets > 0 => Round Advances. (CORRECT)
	}

	game.currentPlayerIndex = 1 - game.currentPlayerIndex;
	game.phase = 'betting';
	return game;

}

function advanceRound(game: GameState): void {
	// Reset bets
	game.players[0].currentBet = 0;
	game.players[1].currentBet = 0;
	game.currentPlayerIndex = game.players[0].isDealer ? 1 : 0; // non-dealer acts first

	game.round++;

	switch (game.round) {
		case 1: // Flop
			game.communityCards.push(game.deck.pop()!, game.deck.pop()!, game.deck.pop()!);
			game.phase = 'betting';
			break;
		case 2: // Turn
			game.communityCards.push(game.deck.pop()!);
			game.phase = 'betting';
			break;
		case 3: // River
			game.communityCards.push(game.deck.pop()!);
			game.phase = 'betting';
			break;
		case 4: // Showdown
			showdown(game);
			break;
	}
}

function showdown(game: GameState): void {
	game.phase = 'showdown';

	const p1Cards = [...game.players[0].hand, ...game.communityCards];
	const p2Cards = [...game.players[1].hand, ...game.communityCards];

	const p1Hand = bestHand(p1Cards);
	const p2Hand = bestHand(p2Cards);

	const result = compareHands(p1Hand, p2Hand);

	// Helper to format hand rank
	const formatHandRank = (rank: string) => {
		return rank.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
	};

	if (result > 0) {
		game.players[0].chips += game.pot;
		game.winner = game.players[0].id;
		game.winReason = `with ${formatHandRank(p1Hand.rank)}`;
		game.winningCards = p1Hand.cards;
	} else if (result < 0) {
		game.players[1].chips += game.pot;
		game.winner = game.players[1].id;
		game.winReason = `with ${formatHandRank(p2Hand.rank)}`;
		game.winningCards = p2Hand.cards;
	} else {
		// Split pot
		const half = Math.floor(game.pot / 2);
		game.players[0].chips += half;
		game.players[1].chips += game.pot - half;
		game.winReason = `both had ${formatHandRank(p1Hand.rank)}`;
		// In a split pot, highlight one of the hands (or both if same cards? but they are different objects)
		// Usually showing one is enough or we could merge but that's complex
		game.winningCards = p1Hand.cards; 
	}
	game.pot = 0;
}

function finishHand(game: GameState, winnerId: string): GameState {
	game.winner = winnerId;
	game.winReason = 'opponent folded';
	game.phase = 'showdown';
	return game;
}

export function isGameOver(game: GameState): { over: boolean; winner?: string; loser?: string } {
	// Don't end game during a hand (even if someone is all-in with 0 chips)
	if (game.phase === 'betting' || game.phase === 'dealing' || game.round > 0) {
		return { over: false };
	}

	for (const player of game.players) {
		if (player.chips <= 0) {
			const winner = game.players.find((p) => p.id !== player.id)!;
			return { over: true, winner: winner.id, loser: player.id };
		}
	}
	return { over: false };
}

export function startNextHand(game: GameState): GameState {
	const deck = createDeck();
	// Swap dealer
	game.players[0].isDealer = !game.players[0].isDealer;
	game.players[1].isDealer = !game.players[1].isDealer;

	// Reset hand state
	for (const player of game.players) {
		player.hand = [deck.pop()!, deck.pop()!];
		player.currentBet = 0;
		player.folded = false;
	}

	game.deck = deck;
	game.communityCards = [];
	game.pot = 0;
	game.round = 0;
	game.phase = 'betting';
	game.phase = 'betting';
	game.winner = undefined;
	game.winReason = undefined; 
	game.winningCards = undefined;
	
	// Ante: Each player buys in with 5 chips minimum
	const anteAmount = 5;
	for (const player of game.players) {
		const actualAnte = Math.min(anteAmount, player.chips);
		player.chips -= actualAnte;
		game.pot += actualAnte;
	}
	
	// Determine dealer (already swapped)
	const sbPlayerIndex = game.players[0].isDealer ? 0 : 1; 
	game.currentPlayerIndex = sbPlayerIndex; // Dealer (SB) acts first pre-flop

	return game;
}

export function getPlayerView(game: GameState, playerId: string): GameState {
	// Return a view where opponent's hand is hidden unless showdown
	const clone: GameState = JSON.parse(JSON.stringify(game));
	if (clone.phase !== 'showdown' && clone.phase !== 'complete') {
		const opponentIndex = clone.players.findIndex((p) => p.id !== playerId);
		if (opponentIndex !== -1) {
			clone.players[opponentIndex].hand = [];
		}
	}
	// Don't send deck to client
	clone.deck = [];
	return clone;
}
