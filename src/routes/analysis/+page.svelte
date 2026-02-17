<script lang="ts">
	import { onMount } from 'svelte';
	import { auth, getAuthHeaders } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { verifySignature } from '$lib/crypto';
	
	interface Hand {
		id: string;
		game_id: string;
		data: string; // JSON
		signatures: string; // JSON { userId: sig }
		timestamp: number;
	}

	interface User {
		id: string;
		name: string;
		public_key?: string;
	}

	interface Block {
		index: number;
		timestamp: number;
		data: any;
		previousHash: string;
		hash: string;
		nonce: number;
	}

	let hands = $state<Hand[]>([]);
	let chain = $state<Block[]>([]);
	let users = $state<Record<string, User>>({});
	let keys = $state<Record<string, CryptoKey>>({});
	let loading = $state(true);
	let verifications = $state<Record<string, boolean | 'verified' | 'failed'>>({});
	let chainStatus = $state<'verified' | 'broken' | 'checking'>('checking');
	let brokenIndex = $state(-1);

	onMount(async () => {
		if (!$auth.token) { goto('/login'); return; }
		await loadData();
	});

	async function loadData() {
		try {
			// Load users first to get keys
			const uRes = await fetch('/api/users', { headers: getAuthHeaders($auth.token!) });
			const uData = await uRes.json();
			if (uData.success) {
				const userList: User[] = uData.data;
				for (const u of userList) {
					users[u.id] = u;
					if (u.public_key) {
						try {
							// Import public key
							const key = await window.crypto.subtle.importKey(
								'jwk',
								JSON.parse(u.public_key),
								{ name: 'ECDSA', namedCurve: 'P-256' },
								true,
								['verify']
							);
							keys[u.id] = key;
						} catch (e) {
							console.error(`Failed to import key for ${u.name}`, e);
						}
					}
				}
			}

			// Load Chain
			const cRes = await fetch('/api/chain', { headers: getAuthHeaders($auth.token!) });
			const cData = await cRes.json();
			if (cData.success) {
				chain = cData.data;
				await verifyChain(chain);
			}

			// Load history
			const hRes = await fetch('/api/hands', { headers: getAuthHeaders($auth.token!) });
			const hData = await hRes.json();
			if (hData.success) {
				hands = hData.data;
				verifyAll(hands);
			}
		} catch (e) {
			console.error(e);
		}
		loading = false;
	}

	async function verifyChain(blocks: Block[]) {
		chainStatus = 'checking';
		for (let i = 0; i < blocks.length; i++) {
			const block = blocks[i];
			const prevBlock = i > 0 ? blocks[i - 1] : null;

			// Verify Hash
			// Note: JSON.stringify must match server's EXACT string. 
			const calculated = await calculateBlockHash(block);
			if (calculated !== block.hash) {
				console.error(`Block ${i} hash mismatch`, calculated, block.hash);
				chainStatus = 'broken';
				brokenIndex = i;
				return;
			}

			// Verify Link
			if (i > 0 && block.previousHash !== prevBlock?.hash) {
				console.error(`Block ${i} broken link`, block.previousHash, prevBlock?.hash);
				chainStatus = 'broken';
				brokenIndex = i;
				return;
			}
		}
		chainStatus = 'verified';
	}

	async function calculateBlockHash(block: Block): Promise<string> {
		const content = `${block.index}${block.timestamp}${JSON.stringify(block.data)}${block.previousHash}${block.nonce}`;
		const encoder = new TextEncoder();
		const data = encoder.encode(content);
		const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
	}

	async function verifyAll(list: Hand[]) {
		for (const hand of list) {
			await verifyHand(hand);
		}
	}

	async function verifyHand(hand: Hand) {
		const sigs = JSON.parse(hand.signatures || '{}');
		const signerId = Object.keys(sigs)[0]; // Assume first signer is the creator/winner
		if (!signerId || !keys[signerId]) {
			verifications[hand.id] = 'failed';
			return;
		}

		try {
			const isValid = await verifySignature(keys[signerId], hand.data, sigs[signerId]);
			verifications[hand.id] = isValid ? 'verified' : 'failed';
		} catch (e) {
			console.error(e);
			verifications[hand.id] = 'failed';
		}
	}

	function parseHandData(jsonStr: string) {
		try {
			return JSON.parse(jsonStr);
		} catch { return {}; }
	}

	function formatTime(ts: number) {
		return new Date(ts).toLocaleDateString('en-GB', {
			day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit'
		});
	}
</script>

<div class="analysis-page animate-in">
	<div class="page-header">
		<h1><ion-icon name="shield-checkmark-outline"></ion-icon> Integrity Check</h1>
		<button class="btn btn-ghost" onclick={() => goto('/')}>Back</button>
	</div>

	<div class="card intro-card">
		<p>
			<strong>Absurd Integrity Mode:</strong> Your browser is independently verifying the entire blockchain history and every signed hand.
			Server tampering is practically impossible without detection.
		</p>
	</div>

	<section class="chain-status">
		<h2>Blockchain Status</h2>
		{#if chainStatus === 'verified'}
			<div class="status-box success">
				<ion-icon name="link-outline"></ion-icon>
				<div>
					<h3>Blockchain Intact</h3>
					<p>Verified {chain.length} blocks. All hashes and links are valid.</p>
				</div>
			</div>
		{:else if chainStatus === 'broken'}
			<div class="status-box danger">
				<ion-icon name="alert-circle-outline"></ion-icon>
				<div>
					<h3>Blockchain CORRUPTED</h3>
					<p>Validation failed at Block #{brokenIndex}. <strong>Possible Tampering Detected!</strong></p>
				</div>
			</div>
		{:else}
			<div class="status-box warning">
				<ion-icon name="sync-outline" class="spin"></ion-icon>
				<p>Verifying Blockchain...</p>
			</div>
		{/if}
	</section>

	<section class="history-list">
		<h2>Signed Hand History</h2>
		{#if loading}
			<p class="loading">Fetching decentralized ledger...</p>
		{:else if hands.length === 0}
			<p class="empty">No history found.</p>
		{:else}
			{#each hands as hand}
				{@const data = parseHandData(hand.data)}
				{@const status = verifications[hand.id]}
				<div class="card hand-card">
					<div class="hand-header">
						<span class="hand-id">#{hand.id.slice(0, 8)}...</span>
						<span class="hand-time">{formatTime(hand.timestamp)}</span>
						
						{#if status === 'verified'}
							<span class="badge badge-success">
								<ion-icon name="lock-closed"></ion-icon> VERIFIED
							</span>
						{:else if status === 'failed'}
							<span class="badge badge-danger">
								<ion-icon name="warning"></ion-icon> TEMPERED
							</span>
						{:else}
							<span class="badge badge-warning">Checking...</span>
						{/if}
					</div>

					<div class="hand-details">
						<div class="detail-row">
							<span class="label">Winner:</span>
							<span class="value">{users[data.winner]?.name || data.winner}</span>
						</div>
						<div class="detail-row">
							<span class="label">Pot:</span>
							<span class="value">{data.pot}</span>
						</div>
						<div class="detail-row">
							<span class="label">Hand:</span>
							<span class="cards">{data.myHand?.map((c: any) => `${c.rank}${c.suit}`).join(' ') || '?'}</span>
						</div>
						{#if data.community?.length}
							<div class="detail-row">
								<span class="label">Board:</span>
								<span class="cards">{data.community.map((c: any) => `${c.rank}${c.suit}`).join(' ')}</span>
							</div>
						{/if}
					</div>

					<details>
						<summary>Raw Signed Data</summary>
						<pre>{hand.data}</pre>
						<div class="signature-block">
							<strong>Signature:</strong>
							<code>{Object.values(JSON.parse(hand.signatures))[0]}</code>
						</div>
					</details>
				</div>
			{/each}
		{/if}
	</section>

	<footer class="db-info">
		<small><ion-icon name="server-outline"></ion-icon> Database location: ./points.db</small>
	</footer>
</div>

<style>
	.analysis-page {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding-bottom: 40px;
	}
	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	h1 { font-size: 1.3rem; font-weight: 800; }

	.intro-card {
		background: rgba(16, 185, 129, 0.1);
		border-color: var(--success);
		font-size: 0.85rem;
		line-height: 1.4;
	}

	h2 {
		font-size: 0.9rem;
		text-transform: uppercase;
		color: var(--text-secondary);
		margin-bottom: 10px;
	}

	.status-box {
		padding: 20px;
		border-radius: var(--radius-md);
		border: 1px solid transparent;
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.status-box ion-icon { font-size: 2rem; }
	.status-box.success {
		background: rgba(16, 185, 129, 0.2);
		border-color: var(--success);
		color: var(--success);
	}
	.status-box.danger {
		background: rgba(239, 68, 68, 0.2);
		border-color: var(--danger);
		color: var(--danger);
	}
	.status-box.warning {
		background: rgba(234, 179, 8, 0.2);
		border-color: var(--warning);
		color: var(--warning);
	}
	.spin { animation: spin 1s linear infinite; }
	@keyframes spin { 100% { transform: rotate(360deg); } }

	.hand-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
		border-left: 4px solid var(--border);
	}
	.hand-card:has(.badge-success) { border-left-color: var(--success); }
	.hand-card:has(.badge-danger) { border-left-color: var(--danger); }

	.hand-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}
	.hand-id { color: var(--text-muted); }

	.badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		border-radius: 4px;
		font-weight: 700;
		font-size: 0.7rem;
	}
	.badge-success { background: rgba(16, 185, 129, 0.2); color: var(--success); }
	.badge-danger { background: rgba(239, 68, 68, 0.2); color: var(--danger); }
	.badge-warning { background: rgba(234, 179, 8, 0.2); color: var(--warning); }

	.hand-details {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		font-size: 0.85rem;
	}
	.detail-row { display: flex; flex-direction: column; gap: 2px; }
	.label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; }
	.value { font-weight: 600; color: var(--text-primary); }
	.cards { font-family: var(--font-mono); letter-spacing: -1px; }

	details {
		margin-top: 8px;
		font-size: 0.75rem;
		color: var(--text-muted);
		background: var(--bg-secondary);
		padding: 8px;
		border-radius: 4px;
	}
	summary { cursor: pointer; font-weight: 600; margin-bottom: 4px; }
	pre {
		white-space: pre-wrap;
		word-break: break-all;
		background: rgba(0,0,0,0.2);
		padding: 6px;
		border-radius: 2px;
		margin-bottom: 6px;
	}
	.signature-block code {
		display: block;
		word-break: break-all;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		margin-top: 2px;
	}

	.history-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.empty { text-align: center; color: var(--text-muted); padding: 20px; }

	.db-info {
		text-align: center;
		color: var(--text-muted);
		font-size: 0.75rem;
		opacity: 0.5;
	}
</style>
