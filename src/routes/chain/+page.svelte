<script lang="ts">
	import { onMount } from 'svelte';
	import { auth, getAuthHeaders } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { verifyChain } from '$lib/blockchain/verify';
	import type { Block, ChainVerification } from '$lib/types';

	let chain = $state<Block[]>([]);
	let verification = $state<ChainVerification | null>(null);
	let verifying = $state(false);
	let loading = $state(true);
	let users = $state<{id: string, name: string}[]>([]);

	onMount(async () => {
		if (!$auth.token) { goto('/login'); return; }
		const authUsers = await fetch('/api/auth', { headers: getAuthHeaders($auth.token!) }).then(r => r.json());
		if (authUsers.success) users = authUsers.data;
		await loadChain();
	});

	async function loadChain() {
		loading = true;
		try {
			const res = await fetch('/api/chain', { headers: getAuthHeaders($auth.token!) });
			const data = await res.json();
			if (data.success) chain = data.data;
		} catch { /* */ }
		loading = false;
	}

	async function doVerify() {
		verifying = true;
		verification = null;
		
		// Use the already fetched users for verification mapping
		let usersMap: Record<string, string> = {};
		users.forEach((u: any) => {
			if (u.publicKey) usersMap[u.id] = u.publicKey;
		});

		// Simulate a brief verification process for effect
		await new Promise(r => setTimeout(r, 800));
		verification = await verifyChain(chain, usersMap);
		verifying = false;
	}

	function getName(id?: string) {
		const user = users.find(u => u.id === id);
		if (user) return user.name;
		if (id === 'player1') return 'Player 1';
		if (id === 'player2') return 'Player 2';
		return id || 'System';
	}

	function formatTime(ts: number) {
		return new Date(ts).toLocaleDateString('en-GB', {
			day: 'numeric', month: 'short', year: 'numeric',
			hour: '2-digit', minute: '2-digit'
		});
	}

	function shortHash(hash: string) {
		return hash.slice(0, 12) + '…' + hash.slice(-6);
	}
</script>

<div class="chain-page animate-in">
	<div class="page-header">
		<h1><ion-icon name="server-outline"></ion-icon> Blockchain</h1>
		<button class="btn btn-primary" onclick={doVerify} disabled={verifying}>
			{verifying ? 'Verifying...' : 'Verify Chain'}
		</button>
	</div>

	{#if verification}
		<div class="card verification-card" class:valid={verification.valid} class:invalid={!verification.valid}>
			<div class="verify-status">
				<span class="verify-icon">
					{#if verification.valid}
						<ion-icon name="checkmark-circle" style="color: var(--success)"></ion-icon>
					{:else}
						<ion-icon name="alert-circle" style="color: var(--danger)"></ion-icon>
					{/if}
				</span>
				<div>
					<span class="verify-title">
						{verification.valid ? 'Chain Valid' : 'Chain Invalid!'}
					</span>
					<span class="verify-sub">
						{verification.blockCount} blocks verified
					</span>
				</div>
			</div>
			{#if verification.issues.length > 0}
				<ul class="issues">
					{#each verification.issues as issue}
						<li>{issue}</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<div class="chain-stats">
		<div class="stat">
			<span class="stat-value">{chain.length}</span>
			<span class="stat-label">Blocks</span>
		</div>
		<div class="stat">
			<span class="stat-value">{chain.filter(b => b.data.type === 'poker_win').length}</span>
			<span class="stat-label">Poker Wins</span>
		</div>
		<div class="stat">
			<span class="stat-value">{chain.filter(b => b.data.type === 'manual_point').length}</span>
			<span class="stat-label">Manual Pts</span>
		</div>
	</div>

	{#if loading}
		<p class="loading-text loading">Loading chain...</p>
	{:else}
		<div class="blocks-list">
			{#each [...chain].reverse() as block, i}
				<div class="block-item card">
					<div class="block-header">
						<span class="block-index">#{block.index}</span>
						<span class="block-type badge" class:badge-accent={block.data.type === 'genesis'} class:badge-success={block.data.type === 'poker_win'} class:badge-warning={block.data.type === 'manual_point'}>
							{block.data.type.replace('_', ' ')}
						</span>
					</div>

					{#if block.data.type !== 'genesis'}
						<div class="block-content">
							<span style="display: flex; align-items: center; gap: 6px;">
								<ion-icon name="trophy-outline" style="color: var(--gold)"></ion-icon>
								{getName(block.data.winner)}
							</span>
							{#if block.data.description}
								<span class="block-desc">{block.data.description}</span>
							{/if}
						</div>
					{/if}

					<div class="block-hashes">
						<div class="hash-row">
							<span class="hash-label">Hash</span>
							<code class="hash-value">{shortHash(block.hash)}</code>
						</div>
						<div class="hash-row">
							<span class="hash-label">Prev</span>
							<code class="hash-value">{block.previousHash === '0' ? 'Genesis' : shortHash(block.previousHash)}</code>
						</div>
						<div class="hash-row">
							<span class="hash-label">Nonce</span>
							<code class="hash-value">{block.nonce}</code>
						</div>
					</div>

					<span class="block-time">{formatTime(block.timestamp)}</span>

					{#if i < chain.length - 1}
						<div class="chain-link"><ion-icon name="arrow-down-outline"></ion-icon></div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.chain-page {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	h1 { font-size: 1.3rem; font-weight: 800; }

	.verification-card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		border-width: 2px;
	}
	.verification-card.valid {
		border-color: var(--success);
		background: rgba(16, 185, 129, 0.08);
	}
	.verification-card.invalid {
		border-color: var(--danger);
		background: rgba(239, 68, 68, 0.08);
	}

	.verify-status { display: flex; align-items: center; gap: 12px; }
	.verify-icon { font-size: 1.5rem; }
	.verify-title { font-weight: 700; font-size: 1rem; display: block; }
	.verify-sub { font-size: 0.8rem; color: var(--text-muted); }

	.issues {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.issues li {
		font-size: 0.8rem;
		color: var(--danger);
		padding-left: 16px;
		position: relative;
	}
	.issues li::before { content: '⚠'; position: absolute; left: 0; }

	.chain-stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.stat {
		background: var(--bg-card);
		border-radius: var(--radius-sm);
		border: 1px solid rgba(255,255,255,0.06);
		padding: 14px;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.stat-value {
		font-size: 1.4rem;
		font-weight: 800;
		font-family: var(--font-mono);
		color: var(--accent-light);
	}
	.stat-label {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.blocks-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.block-item {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		position: relative;
	}

	.block-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.block-index {
		font-family: var(--font-mono);
		font-weight: 700;
		font-size: 0.9rem;
	}
	.block-type { text-transform: capitalize; }

	.block-content {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 0.85rem;
	}
	.block-desc { color: var(--text-secondary); font-size: 0.8rem; }

	.block-hashes {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.hash-row { display: flex; align-items: center; gap: 8px; }
	.hash-label {
		font-size: 0.65rem;
		font-weight: 700;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		min-width: 36px;
	}
	.hash-value {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-secondary);
		background: var(--bg-secondary);
		padding: 2px 6px;
		border-radius: 4px;
	}

	.block-time {
		font-size: 0.7rem;
		color: var(--text-muted);
	}

	.chain-link {
		text-align: center;
		font-size: 0.8rem;
		opacity: 0.4;
		margin: -2px 0;
	}

	.loading-text {
		text-align: center;
		color: var(--text-muted);
		padding: 40px;
	}
</style>
