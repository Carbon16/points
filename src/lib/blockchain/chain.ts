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
	return chain.filter(
		(b) => (b.data.type === 'poker_win' || b.data.type === 'manual_point') && b.data.winner === userId
	).length;
}

export function getScoreboard(): { userId: string; points: number }[] {
	const chain = getChain();
	const scores: Record<string, number> = {};
	for (const block of chain) {
		if ((block.data.type === 'poker_win' || block.data.type === 'manual_point') && block.data.winner) {
			scores[block.data.winner] = (scores[block.data.winner] || 0) + 1;
		}
	}
	return Object.entries(scores).map(([userId, points]) => ({ userId, points }));
}
