import type { Card, HandEvaluation, HandRank, Rank } from '$lib/types';

const RANK_VALUES: Record<Rank, number> = {
	'2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
	'9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

const HAND_RANK_VALUES: Record<HandRank, number> = {
	'high-card': 0,
	'pair': 1,
	'two-pair': 2,
	'three-of-a-kind': 3,
	'straight': 4,
	'flush': 5,
	'full-house': 6,
	'four-of-a-kind': 7,
	'straight-flush': 8,
	'royal-flush': 9
};

function getRankValue(rank: Rank): number {
	return RANK_VALUES[rank];
}

function getCounts(cards: Card[]): Map<number, number> {
	const counts = new Map<number, number>();
	for (const card of cards) {
		const val = getRankValue(card.rank);
		counts.set(val, (counts.get(val) || 0) + 1);
	}
	return counts;
}

function isFlush(cards: Card[]): boolean {
	return cards.every((c) => c.suit === cards[0].suit);
}

function isStraight(cards: Card[]): { straight: boolean; highCard: number } {
	const values = cards.map((c) => getRankValue(c.rank)).sort((a, b) => a - b);

	// Check for ace-low straight (A-2-3-4-5)
	if (values[4] === 14 && values[0] === 2 && values[1] === 3 && values[2] === 4 && values[3] === 5) {
		return { straight: true, highCard: 5 };
	}

	for (let i = 1; i < values.length; i++) {
		if (values[i] !== values[i - 1] + 1) return { straight: false, highCard: 0 };
	}
	return { straight: true, highCard: values[4] };
}

export function evaluateHand(cards: Card[]): HandEvaluation {
	if (cards.length < 5) {
		// For partial hands, just evaluate what we have
		const values = cards.map((c) => getRankValue(c.rank)).sort((a, b) => b - a);
		return { rank: 'high-card', rankValue: 0, highCards: values, description: 'High Card' };
	}

	const flush = isFlush(cards);
	const { straight, highCard: straightHigh } = isStraight(cards);
	const counts = getCounts(cards);

	const countEntries = Array.from(counts.entries()).sort((a, b) => {
		if (b[1] !== a[1]) return b[1] - a[1]; // sort by count desc
		return b[0] - a[0]; // then by value desc
	});

	const highCards = countEntries.map(([val]) => val);

	// Royal Flush
	if (flush && straight && straightHigh === 14) {
		return { rank: 'royal-flush', rankValue: 9, highCards: [14], description: 'Royal Flush' };
	}

	// Straight Flush
	if (flush && straight) {
		return { rank: 'straight-flush', rankValue: 8, highCards: [straightHigh], description: `Straight Flush (${straightHigh} high)` };
	}

	// Four of a Kind
	if (countEntries[0][1] === 4) {
		return { rank: 'four-of-a-kind', rankValue: 7, highCards, description: `Four of a Kind (${countEntries[0][0]}s)` };
	}

	// Full House
	if (countEntries[0][1] === 3 && countEntries[1][1] === 2) {
		return { rank: 'full-house', rankValue: 6, highCards, description: `Full House (${countEntries[0][0]}s over ${countEntries[1][0]}s)` };
	}

	// Flush
	if (flush) {
		return { rank: 'flush', rankValue: 5, highCards, description: 'Flush' };
	}

	// Straight
	if (straight) {
		return { rank: 'straight', rankValue: 4, highCards: [straightHigh], description: `Straight (${straightHigh} high)` };
	}

	// Three of a Kind
	if (countEntries[0][1] === 3) {
		return { rank: 'three-of-a-kind', rankValue: 3, highCards, description: `Three of a Kind (${countEntries[0][0]}s)` };
	}

	// Two Pair
	if (countEntries[0][1] === 2 && countEntries[1][1] === 2) {
		return { rank: 'two-pair', rankValue: 2, highCards, description: `Two Pair (${countEntries[0][0]}s and ${countEntries[1][0]}s)` };
	}

	// Pair
	if (countEntries[0][1] === 2) {
		return { rank: 'pair', rankValue: 1, highCards, description: `Pair of ${countEntries[0][0]}s` };
	}

	// High Card
	return { rank: 'high-card', rankValue: 0, highCards, description: `High Card (${highCards[0]})` };
}

export function compareHands(hand1: HandEvaluation, hand2: HandEvaluation): number {
	// Returns: positive if hand1 wins, negative if hand2 wins, 0 for tie
	if (hand1.rankValue !== hand2.rankValue) {
		return hand1.rankValue - hand2.rankValue;
	}
	// Compare high cards
	for (let i = 0; i < Math.min(hand1.highCards.length, hand2.highCards.length); i++) {
		if (hand1.highCards[i] !== hand2.highCards[i]) {
			return hand1.highCards[i] - hand2.highCards[i];
		}
	}
	return 0;
}

/**
 * Find the best 5-card hand from 7 cards (2 hole + 5 community)
 */
export function bestHand(cards: Card[]): HandEvaluation {
	if (cards.length <= 5) return evaluateHand(cards);

	let best: HandEvaluation | null = null;

	// Generate all C(n, 5) combinations
	const combos = combinations(cards, 5);
	for (const combo of combos) {
		const hand = evaluateHand(combo);
		if (!best || compareHands(hand, best) > 0) {
			best = hand;
		}
	}

	return best!;
}

function combinations<T>(arr: T[], k: number): T[][] {
	if (k === 0) return [[]];
	if (arr.length === 0) return [];
	const [first, ...rest] = arr;
	const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
	const withoutFirst = combinations(rest, k);
	return [...withFirst, ...withoutFirst];
}
