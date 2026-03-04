import { createGenesisBlock, mineBlock } from './block';
import { getDb } from '$lib/server/db';
import type { Block, BlockData } from '$lib/types';

function loadChain(): Block[] {
	const db = getDb();
	const rows = db.prepare('SELECT data FROM blocks ORDER BY idx ASC').all() as { data: string }[];
	return rows.map((r) => JSON.parse(r.data));
}

function saveBlock(block: Block): void {
	const db = getDb();
	db.prepare('INSERT INTO blocks (idx, data) VALUES (?, ?)').run(block.index, JSON.stringify(block));
}

export function getChain(): Block[] {
	const chain = loadChain();
	if (chain.length === 0) {
		const genesis = createGenesisBlock();
		saveBlock(genesis);
		return [genesis];
	}
	return chain;
}

export function getLatestBlock(): Block {
	const chain = getChain();
	return chain[chain.length - 1];
}

export function addBlock(data: BlockData): Block {
	const latest = getLatestBlock();
	const newBlock = mineBlock(latest, data);
	saveBlock(newBlock);
	return newBlock;
}

export function getPointsForUser(userId: string): number {
	const chain = getChain();
	let points = 0;
	const kbThreshold = new Date('2026-03-04T00:00:00Z').getTime();
	for (const block of chain) {
		const val = block.data.amount || 1;
		if (block.data.winner === userId) {
			if (['poker_win', 'manual_point', 'blackjack_win', 'dice_win'].includes(block.data.type) ||
			   (block.data.type === 'knucklebones_win' && block.data.timestamp >= kbThreshold)) {
				points += val;
			} else if (block.data.type === 'spend') {
				points -= val;
			}
		}
	}
	return points;
}

export function getScoreboard(): { userId: string; points: number }[] {
	const chain = getChain();
	const scores: Record<string, number> = {};
	const kbThreshold = new Date('2026-03-04T00:00:00Z').getTime();
	for (const block of chain) {
		const val = block.data.amount || 1;
		if (block.data.winner) {
			if (['poker_win', 'manual_point', 'blackjack_win', 'dice_win'].includes(block.data.type) ||
			   (block.data.type === 'knucklebones_win' && block.data.timestamp >= kbThreshold)) {
				scores[block.data.winner] = (scores[block.data.winner] || 0) + val;
			} else if (block.data.type === 'spend') {
				scores[block.data.winner] = (scores[block.data.winner] || 0) - val;
			}
		}
	}
	// Return normalized points (solve floating point issues for display if any)
	return Object.entries(scores).map(([userId, points]) => ({ 
		userId, 
		points: Math.round(points * 100) / 100 
	}));
}
