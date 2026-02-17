import type { ChipStack } from '$lib/types';

// Chip configuration: 3×25 + 3×10 + 5×5 = 130 per player
export const STARTING_CHIPS: ChipStack[] = [
	{ value: 25, count: 3 },
	{ value: 10, count: 3 },
	{ value: 5, count: 5 }
];

export const STARTING_TOTAL = STARTING_CHIPS.reduce((sum, c) => sum + c.value * c.count, 0); // 130
