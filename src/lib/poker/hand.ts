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

export function getRankValue(rank: Rank): number {
	const val = RANK_VALUES[String(rank) as Rank];
	if (val === undefined) {
		console.error(`Invalid rank encountered: ${rank}`);
		return 0; // Prevent grouping undefineds into a pair
	}
	return val;
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
		const highCard = cards.find(c => getRankValue(c.rank) === values[0]) || cards[0];
		return { rank: 'high-card', rankValue: 0, highCards: values, description: 'High Card', cards, coreCards: [highCard] };
	}

	const flush = isFlush(cards);
	const { straight, highCard: straightHigh } = isStraight(cards);
	const values = cards.map((c) => getRankValue(c.rank)).sort((a, b) => b - a);
	const counts = getCounts(cards);

	const countEntries = Array.from(counts.entries()).sort((a, b) => {
		if (b[1] !== a[1]) return b[1] - a[1]; // sort by count desc
		return b[0] - a[0]; // then by value desc
	});

	const highCards = countEntries.map(([val]) => val);

	// Royal Flush
	if (flush && straight && straightHigh === 14) {
		return { rank: 'royal-flush', rankValue: 9, highCards: [14], description: 'Royal Flush', cards, coreCards: cards };
	}

	// Straight Flush
	if (flush && straight) {
		return { rank: 'straight-flush', rankValue: 8, highCards: [straightHigh], description: `Straight Flush (${straightHigh} high)`, cards, coreCards: cards };
	}

	// Four of a Kind
	if (countEntries[0][1] === 4) {
		const fourRank = countEntries[0][0];
		const kickers = values.filter(v => v !== fourRank);
		const core = cards.filter(c => getRankValue(c.rank) === fourRank);
		return { rank: 'four-of-a-kind', rankValue: 7, highCards: [fourRank, ...kickers], description: `Four of a Kind (${countEntries[0][0]}s)`, cards, coreCards: core };
	}

	// Full House
	if (countEntries[0][1] === 3 && countEntries[1][1] === 2) {
		const threeRank = countEntries[0][0];
		const twoRank = countEntries[1][0];
		// No kickers needed for full house comparisons (3+2=5 cards)
		return { rank: 'full-house', rankValue: 6, highCards: [threeRank, twoRank], description: `Full House (${countEntries[0][0]}s over ${countEntries[1][0]}s)`, cards, coreCards: cards };
	}

	// Flush
	if (flush) {
		// All 5 cards matter for flush comparison
		return { rank: 'flush', rankValue: 5, highCards: values, description: 'Flush', cards, coreCards: cards };
	}

	// Straight
	if (straight) {
		return { rank: 'straight', rankValue: 4, highCards: [straightHigh], description: `Straight (${straightHigh} high)`, cards, coreCards: cards };
	}

	// Three of a Kind
	if (countEntries[0][1] === 3) {
		const tripRank = countEntries[0][0];
		const kickers = values.filter(v => v !== tripRank);
		const core = cards.filter(c => getRankValue(c.rank) === tripRank);
		return { rank: 'three-of-a-kind', rankValue: 3, highCards: [tripRank, ...kickers], description: `Three of a Kind (${countEntries[0][0]}s)`, cards, coreCards: core };
	}

	// Two Pair
	if (countEntries[0][1] === 2 && countEntries[1][1] === 2) {
		const rank1 = countEntries[0][0];
		const rank2 = countEntries[1][0];
		const kickers = values.filter(v => v !== rank1 && v !== rank2);
		const core = cards.filter(c => getRankValue(c.rank) === rank1 || getRankValue(c.rank) === rank2);
		return { rank: 'two-pair', rankValue: 2, highCards: [rank1, rank2, ...kickers], description: `Two Pair (${countEntries[0][0]}s and ${countEntries[1][0]}s)`, cards, coreCards: core };
	}

	// Pair
	if (countEntries[0][1] === 2) {
		const pairRank = countEntries[0][0];
		const kickers = values.filter(v => v !== pairRank);
		const core = cards.filter(c => getRankValue(c.rank) === pairRank);
		return { rank: 'pair', rankValue: 1, highCards: [pairRank, ...kickers], description: `Pair of ${countEntries[0][0]}s`, cards, coreCards: core };
	}

	// High Card
	// highCards already contains sorted values
	const highRank = highCards[0];
	const core = cards.filter(c => getRankValue(c.rank) === highRank).slice(0,1);
	return { rank: 'high-card', rankValue: 0, highCards: values, description: `High Card (${highCards[0]})`, cards, coreCards: core };
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
