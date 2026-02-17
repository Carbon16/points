import crypto from 'crypto';
import type { Block, BlockData } from '$lib/types';

const DIFFICULTY = 2; // hash must start with this many zeros
const DIFFICULTY_PREFIX = '0'.repeat(DIFFICULTY);

export function calculateHash(index: number, timestamp: number, data: BlockData, previousHash: string, nonce: number): string {
	const content = `${index}${timestamp}${JSON.stringify(data)}${previousHash}${nonce}`;
	return crypto.createHash('sha256').update(content).digest('hex');
}

export function createGenesisBlock(): Block {
	const data: BlockData = {
		type: 'genesis',
		approvedBy: [],
		timestamp: Date.now()
	};
	const index = 0;
	const timestamp = Date.now();
	const previousHash = '0';

	let nonce = 0;
	let hash = calculateHash(index, timestamp, data, previousHash, nonce);
	while (!hash.startsWith(DIFFICULTY_PREFIX)) {
		nonce++;
		hash = calculateHash(index, timestamp, data, previousHash, nonce);
	}

	return { index, timestamp, data, previousHash, hash, nonce };
}

export function mineBlock(previousBlock: Block, data: BlockData): Block {
	const index = previousBlock.index + 1;
	const timestamp = Date.now();
	const previousHash = previousBlock.hash;

	let nonce = 0;
	let hash = calculateHash(index, timestamp, data, previousHash, nonce);
	while (!hash.startsWith(DIFFICULTY_PREFIX)) {
		nonce++;
		hash = calculateHash(index, timestamp, data, previousHash, nonce);
	}

	return { index, timestamp, data, previousHash, hash, nonce };
}
