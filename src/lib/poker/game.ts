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

export function performAction(game: GameState, playerId: string, action: PlayerAction | 'start', amount?: number): GameState {
	const playerIndex = game.players.findIndex((p) => p.id === playerId);
	if (playerIndex === -1) throw new Error('Player not in game');
	
	if (action === 'start') {
		if (game.phase !== 'waiting') throw new Error('Game already started');
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
			if (totalNeeded > player.chips) throw new Error('Not enough chips');
			player.chips -= totalNeeded;
			player.currentBet += totalNeeded;
			game.pot += totalNeeded;
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
	// If one player is all-in, and bets are unequal, the difference is uncalled.
	// We refund the larger bettor and equalize bets for the pot.
	if (player.chips === 0 || opponent.chips === 0) {
		if (player.currentBet > opponent.currentBet) {
			const refund = player.currentBet - opponent.currentBet;
			player.currentBet -= refund;
			player.chips += refund; // Refund to stack (though if all-in, might be tricky? No, if I bet 1000 and opp has 100, I get 900 back and am no longer all-in effectively? No, I am still all-in on the 100?)
			// Correct poker logic: 
			// If I have 1000, opp has 100.
			// I bet 1000 (all-in). My chips=0. My bet=1000.
			// Opp calls 100 (all-in). His chips=0. His bet=100.
			// Difference = 900.
			// Refund 900 to me. My chips becomes 900. My bet becomes 100.
			// Pot reduces by 900.
			game.pot -= refund;
		} else if (opponent.currentBet > player.currentBet) {
			// Opponent bet more than I could call
			const refund = opponent.currentBet - player.currentBet;
			opponent.currentBet -= refund;
			opponent.chips += refund;
			game.pot -= refund;
		}
	}

	// Determine if round advances
	// If bets are equal (which they should be now after refund logic), advance.
	// OR if both are all-in?
	if (player.currentBet === opponent.currentBet) {
		// Both players have acted?
		// If action was 'bet', opponent needs to act.
		// If action was 'call', opponent has acted.
		// If action was 'check', opponent acted? No.
		// If action was 'all-in' (raising), opponent handles next.
		
		// Logic:
		// If I 'call', bets match -> advance.
		// If I 'check', bets match (0=0) -> advance? No, check is only allowed if opponent checked or new round?
		// If P1 checks, P2 needs to act. P2 checks -> advance.
		// Current logic: `if (player.currentBet === opponent.currentBet)`.
		// If P1 checks (0), P2 checks (0). Match -> Advance. Correct.
		// If P1 bets 10, P2 calls 10. Match -> Advance. Correct.
		// If P1 bets 10, P2 raises 20. Match? No. P1 needs to act.
		
		// If P1 All-In 1000. P2 Call 100 (All-In).
		// Refund logic makes P1 bet 100. P2 bet 100.
		// Match -> Advance. Correct.
		
		// Wait, if P1 bets 10. P2 has 5. P2 calls 5 (All-In).
		// P1 bet 10. P2 bet 5.
		// Refund 5 to P1. P1 bet 5. P2 bet 5.
		// Match -> Advance. Correct.
		
		// BUT: valid check?
		// If I 'check', and opp has 'check', we advance.
		// If I 'bet', opp has not acted yet for this bet. Bets might be equal if I bet 0? No, bet > 0.
		// So `bet` action never triggers advance immediately.
		// `call` action triggers advance.
		// `check` action triggers advance IF opponent already checked?
		// My `check` logic:
		// `if (action === 'check' || action === 'call')`
		// If P1 checks, P2 needs to act. P1 checks. currentBet 0 vs 0. Matches.
		// It advances immediately? 
		// NO. `game.currentPlayerIndex` manages turn.
		// P1 check -> switch turn.
		// P2 check -> switch turn -> wait, match?
		
		// The logic `if (player.currentBet === opponent.currentBet)` is flawed if it runs after P1 check.
		// If P1 checks 0, P2 is 0. Matches.
		// It would advance after P1 check!
		// Result: P2 never gets to act.
		// I must fix this too.
		
		// Fix: Only advance if the *second* player has acted in this round?
		// Or track `acted` status?
		// Simplified:
		// If `action` was 'call' -> Advance.
		// If `action` was 'check' -> Advance ONLY if P2 acts?
		// If P1 is dealer? Dealer acts last post-flop?
		// Pre-flop: BB acts last. 
		// My logic: `currentPlayerIndex` starts at 0 or 1.
		// I need a better way to track "round complete".
		
		// Let's stick to the minimal bug fix for All-In for now, but `check` acting early is a bug too?
		// Actually, `check` is only valid if bets equal.
		// If P1 checks, bets are 0=0.
		// If I return `game`, turn switches.
		// But `if (player.currentBet === opponent.currentBet)` executes.
		// So P1 check -> advances round!
		// P2 never acts.
		// This explains why game feels "fast" or skipped turns.
		
		// FIX: `advanceRound` should only happen if `numActions >= 2` ?
		// Or explicit `if (action === 'call')` or `(action === 'check' && !isFirstAction)`.
		
		// For All-In refund fix:
		// I'll keep the `if (action === 'check' || action === 'call')` block but refine it.
		// If 'all-in' results in a call (because chips exhausted), it handles it?
		// If P1 All-In. P2 Call.
		// Refund happens. Bets match.
		// Loop enters.
		// But `action` was 'call'. So it advances. Correct.
		
		// If P1 All-In. P2 Folds.
		// Handle Fold returns.
		
		// If P1 Bets. P2 All-In (Raise).
		// Bets do NOT match (unless P1 covers exactly).
		// P1 needs to call.
		// Loop does NOT enter. Correct.
		
		// So only issue is `check`.
		// If P1 Checks. P2 needs to check.
		// Current logic: `check` -> bets match -> advance.
		// I'll fix this by checking if `game.players` both checked?
		// Or simpler: Dealer is last to act (post-flop).
		// If acting player is Dealer, and bets match -> Advance.
		// If acting player is Non-Dealer, and bets match -> Switch Turn.
		// Pre-flop: BB is last.
		
		// Check if we should advance the round
		const isPreFlop = game.round === 0;
		// Heads-up:
		// Pre-flop: Dealer is SB (acts first), Opponent is BB (acts last).
		// Post-flop: Opponent (BB) acts first, Dealer acts last.
		
		const isDealer = player.isDealer;
		const isLastToAct = isPreFlop ? !isDealer : isDealer;

		if (player.currentBet === opponent.currentBet) {
			if (isLastToAct) {
				advanceRound(game);
				return game;
			}
			// Special case: All-In matches always advance? 
			// No, standard rules apply. If P1 All-in, P2 Call. P2 is last to act?
			// If P1 (Dealer) All-In. P2 (BB) Call. P2 is last to act. Advance.
			// If P2 (BB) All-In. P1 (Dealer) Call. P1 is NOT last to act pre-flop.
			// But since P2 is all-in, betting is closed? 
			// Unless P1 has chips? No, P1 called. Bets match.
			// If bets match and someone is all-in, no further betting is possible (unless side pot, but this is heads up).
			if (player.chips === 0 || opponent.chips === 0) {
				advanceRound(game);
				return game;
			}
		}
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

	if (result > 0) {
		game.players[0].chips += game.pot;
		game.winner = game.players[0].id;
	} else if (result < 0) {
		game.players[1].chips += game.pot;
		game.winner = game.players[1].id;
	} else {
		// Split pot
		const half = Math.floor(game.pot / 2);
		game.players[0].chips += half;
		game.players[1].chips += game.pot - half;
	}
	game.pot = 0;
}

function finishHand(game: GameState, winnerId: string): GameState {
	game.winner = winnerId;
	game.phase = 'showdown';
	return game;
}

export function isGameOver(game: GameState): { over: boolean; winner?: string; loser?: string } {
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
	game.winner = undefined;
	
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
