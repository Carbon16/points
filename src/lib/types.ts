// ─── Users ────────────────────────────────────────────────────────────
export interface User {
	id: string;
	name: string;
	publicKey?: string;
}

// ─── Blockchain ───────────────────────────────────────────────────────
export type BlockType = 'genesis' | 'poker_win' | 'dice_win' | 'manual_point' | 'spend';

export interface BlockData {
	type: BlockType;
	winner?: string;
	loser?: string;
	description?: string;
	approvedBy: string[];
	timestamp: number;
	signatures?: Record<string, string>; // userId -> signature
	amount?: number;
}

export interface Block {
	index: number;
	timestamp: number;
	data: BlockData;
	previousHash: string;
	hash: string;
	nonce: number;
}

export interface ChainVerification {
	valid: boolean;
	blockCount: number;
	issues: string[];
}

// ─── Poker ────────────────────────────────────────────────────────────
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
	suit: Suit;
	rank: Rank;
}

export interface ChipStack {
	value: number;
	count: number;
}

export type GamePhase = 'waiting' | 'dealing' | 'betting' | 'showdown' | 'complete';
export type PlayerAction = 'check' | 'bet' | 'call' | 'raise' | 'fold' | 'all-in';

export interface PlayerState {
	id: string;
	name: string;
	chips: number;
	hand: Card[];
	currentBet: number;
	folded: boolean;
	isDealer: boolean;
}

export interface GameState {
	id: string;
	phase: GamePhase;
	players: [PlayerState, PlayerState];
	pot: number;
	communityCards: Card[];
	currentPlayerIndex: number;
	deck: Card[];
	round: number; // betting round (0=pre-flop, 1=flop, 2=turn, 3=river)
	winner?: string;
	winReason?: string; // e.g., "with a Flush" or "opponent folded"
	winningCards?: Card[];
	handNumber: number;
	currentHandId?: string; // Unique ID for the current specific deal/hand
	playForPoints: boolean;
}

export type HandRank =
	| 'high-card'
	| 'pair'
	| 'two-pair'
	| 'three-of-a-kind'
	| 'straight'
	| 'flush'
	| 'full-house'
	| 'four-of-a-kind'
	| 'straight-flush'
	| 'royal-flush';

export interface HandEvaluation {
	rank: HandRank;
	rankValue: number;
	highCards: number[];
	description: string;
	cards: Card[]; // The full 5-card hand
	coreCards: Card[]; // The cards that define the rank (e.g. the pair, the flush, etc)
}

// ─── Approvals ────────────────────────────────────────────────────────
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface PointRequest {
	id: string;
	requestedBy: string;
	awardTo: string;
	description: string;
	status: ApprovalStatus;
	approvedBy: string[];
	createdAt: number;
	amount?: number;
	type?: string;
}

// ─── API ──────────────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

// ─── Blackjack ────────────────────────────────────────────────────────
export type BlackjackPhase = 'waiting' | 'betting' | 'playing' | 'complete';
export type BlackjackAction = 'bet' | 'call' | 'check' | 'fold' | 'hit' | 'stand' | 'double';

export interface BlackjackPlayerState {
	id: string;
	name: string;
	chips: number;
	hand: Card[];
	currentBet: number;
	status: 'waiting' | 'betting' | 'playing' | 'stood' | 'busted' | 'blackjack' | 'folded';
	score: number;
}

export interface BlackjackGameState {
	id: string;
	phase: BlackjackPhase;
	players: BlackjackPlayerState[];
	deck: Card[];
	handNumber: number;
    currentPlayerIndex: number;
    pot: number;
	winnerIds: string[]; // Players who beat the dealer and other players
	pushIds: string[];   // Tie
	loserIds: string[];  // Lost to dealer or other players
	winReason?: string;
    stakes: 'full' | 'half' | 'none';
}

// ─── Knucklebones ────────────────────────────────────────────────────────
export type KnucklebonesPhase = 'waiting' | 'playing' | 'complete';
export type KnucklebonesAction = 'roll' | 'place';

export interface KnucklebonesPlayerState {
    id: string;
    name: string;
    board: (number | null)[][]; // 3 columns, 3 rows. Null means empty.
    score: number;
    columnScores: number[];
}

export interface KnucklebonesGameState {
    id: string;
    phase: KnucklebonesPhase;
    players: KnucklebonesPlayerState[];
    currentPlayerIndex: number;
    currentRoll: number | null; // The die value currently rolled and waiting to be placed
    winnerId?: string;
    stakes: 'full' | 'half' | 'none';
}
