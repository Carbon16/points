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

export function createGame(player1Id: string, player1Name: string, player2Id: string, player2Name: string): GameState {
	const deck = createDeck();
	return {
		id: crypto.randomUUID(),
		phase: 'dealing',
		players: [
			{
				id: player1Id,
				name: player1Name,
				chips: STARTING_TOTAL,
				hand: [deck.pop()!, deck.pop()!],
				currentBet: 0,
				folded: false,
				isDealer: true
			},
			{
				id: player2Id,
				name: player2Name,
				chips: STARTING_TOTAL,
				hand: [deck.pop()!, deck.pop()!],
				currentBet: 0,
				folded: false,
				isDealer: false
			}
		],
		pot: 0,
		communityCards: [],
		currentPlayerIndex: 0,
		deck,
		round: 0,
		handNumber: 1
	};
}

export function performAction(game: GameState, playerId: string, action: PlayerAction, amount?: number): GameState {
	const playerIndex = game.players.findIndex((p) => p.id === playerId);
	if (playerIndex === -1) throw new Error('Player not in game');
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

	// Determine if round advances
	if (action === 'check' || action === 'call') {
		// Both players have acted and bets match — advance round
		if (player.currentBet === opponent.currentBet) {
			advanceRound(game);
			return game;
		}
	}

	// Switch turn
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
	game.currentPlayerIndex = game.players[0].isDealer ? 0 : 1; // dealer acts first pre-flop in heads-up
	game.handNumber++;

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
