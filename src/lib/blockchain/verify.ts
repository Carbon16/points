import type { Block, ChainVerification, BlockData } from '$lib/types';
import { importPublicKey, verifySignature } from '$lib/crypto';

const DIFFICULTY = 2;
const DIFFICULTY_PREFIX = '0'.repeat(DIFFICULTY);

async function hashBlock(index: number, timestamp: number, data: object, previousHash: string, nonce: number): Promise<string> {
	const content = `${index}${timestamp}${JSON.stringify(data)}${previousHash}${nonce}`;
	const encoder = new TextEncoder();
	const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(content));
	const hashArray = Array.from(new Uint8Array(buffer));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyChain(chain: Block[], users: Record<string, string> = {}): Promise<ChainVerification> {
	const issues: string[] = [];

	if (chain.length === 0) {
		return { valid: false, blockCount: 0, issues: ['Chain is empty'] };
	}

	// Verify genesis block
	const genesis = chain[0];
	if (genesis.index !== 0 || genesis.previousHash !== '0') {
		issues.push('Invalid genesis block');
	}

	// Verify each subsequent block
	for (let i = 1; i < chain.length; i++) {
		const block = chain[i];
		const prevBlock = chain[i - 1];

		// Check index
		if (block.index !== i) {
			issues.push(`Block ${i}: incorrect index ${block.index}`);
		}

		// Check previous hash linkage
		if (block.previousHash !== prevBlock.hash) {
			issues.push(`Block ${i}: previousHash doesn't match block ${i - 1} hash`);
		}

		// Verify hash
		const computedHash = await hashBlock(block.index, block.timestamp, block.data, block.previousHash, block.nonce);
		if (computedHash !== block.hash) {
			issues.push(`Block ${i}: hash mismatch`);
		}

		// Verify proof of work
		if (!block.hash.startsWith(DIFFICULTY_PREFIX)) {
			issues.push(`Block ${i}: doesn't meet proof-of-work difficulty`);
		}

		// Verify Manual Point Signatures
		if (block.data.type === 'manual_point') {
			const data = block.data;
			if (!data.signatures || Object.keys(data.signatures).length < 2) {
				issues.push(`Block ${i}: missing signatures`);
			} else {
				// Verify each signature
				for (const [userId, sig] of Object.entries(data.signatures)) {
					const pubKeyStr = users[userId];
					if (!pubKeyStr) {
						issues.push(`Block ${i}: unknown signer ${userId}`);
						continue;
					}

					try {
						const pubKey = await importPublicKey(pubKeyStr);
						const payload = `manual_point:${data.winner}:${data.description}:${data.timestamp}`;
						const valid = await verifySignature(pubKey, payload, sig);
						if (!valid) {
							console.warn(`Block ${i}: invalid signature from ${userId}`);
						}
					} catch (e) {
						console.warn(`Block ${i}: crypto error for ${userId}`);
					}
				}
			}
		}
	}

	return {
		valid: issues.length === 0,
		blockCount: chain.length,
		issues
	};
}

export async function fetchAndVerifyChain(apiBase: string = ''): Promise<ChainVerification> {
	try {
		const res = await fetch(`${apiBase}/api/chain`);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const { data } = await res.json();
		return verifyChain(data, {});
	} catch (err) {
		return {
			valid: false,
			blockCount: 0,
			issues: [`Failed to fetch chain: ${err instanceof Error ? err.message : 'Unknown error'}`]
		};
	}
}
