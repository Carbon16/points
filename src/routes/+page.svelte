<script lang="ts">
	import { onMount } from 'svelte';
	import { auth, getAuthHeaders } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import type { Block } from '$lib/types';

	let scores = $state<{userId: string, points: number}[]>([]);
	let recentBlocks = $state<Block[]>([]);
	let loading = $state(true);

	let users = $state<{id: string, name: string}[]>([]);

	onMount(async () => {
		if (!$auth.token) { goto('/login'); return; }
		const authUsers = await fetch('/api/auth', { headers: getAuthHeaders($auth.token!) }).then(r => r.json());
		if (authUsers.success) users = authUsers.data;
		await loadData();
	});

	async function loadData() {
		loading = true;
		try {
			const [scoresRes, chainRes] = await Promise.all([
				fetch('/api/points', { headers: getAuthHeaders($auth.token!) }),
				fetch('/api/chain', { headers: getAuthHeaders($auth.token!) })
			]);
			const scoresData = await scoresRes.json();
			const chainData = await chainRes.json();

			scores = scoresData.data || [];
			const chain: Block[] = chainData.data || [];
			recentBlocks = chain.filter(b => b.data.type !== 'genesis').slice(-5).reverse();
		} catch (err) {
			console.error('Failed to load data', err);
		}
		loading = false;
	}

	function getPlayerName(id: string) {
		const user = users.find(u => u.id === id);
		if (user) return user.name;
		if (id === 'player1') return 'Player 1';
		if (id === 'player2') return 'Player 2';
		return id;
	}

	function getScore(id: string) {
		return scores.find(s => s.userId === id)?.points || 0;
	}

	function formatTime(ts: number) {
		return new Date(ts).toLocaleDateString('en-GB', {
			day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
		});
	}
</script>

<div class="dashboard animate-in">
	<header class="dash-header">
		<h1>Points</h1>
		<button class="btn btn-ghost btn-sm" onclick={() => { auth.logout(); goto('/login'); }} aria-label="Logout">
			<ion-icon name="log-out-outline"></ion-icon>
		</button>
	</header>

	<!-- Scoreboard -->
	<div class="scoreboard card card-glow">
		<div class="score-player">
			<span class="score-name">{getPlayerName('player1')}</span>
			<span class="score-value" class:leading={getScore('player1') > getScore('player2')}>{getScore('player1')}</span>
		</div>
		<div class="score-vs">VS</div>
		<div class="score-player">
			<span class="score-name">{getPlayerName('player2')}</span>
			<span class="score-value" class:leading={getScore('player2') > getScore('player1')}>{getScore('player2')}</span>
		</div>
	</div>

	<!-- Quick Actions -->
	<div class="actions">
		<button class="action-card card" onclick={() => goto('/poker')}>
			<span class="action-icon"><ion-icon name="card-outline"></ion-icon></span>
			<span class="action-label">Play Poker</span>
		</button>
		<button class="action-card card" onclick={() => goto('/approve')}>
			<span class="action-icon"><ion-icon name="add-circle-outline"></ion-icon></span>
			<span class="action-label">Add Point</span>
		</button>
		<button class="action-card card" onclick={() => goto('/chain')}>
			<span class="action-icon"><ion-icon name="link-outline"></ion-icon></span>
			<span class="action-label">Verify Chain</span>
		</button>
	</div>

	<!-- Recent Activity -->
	<section class="recent">
		<h2>Recent Activity</h2>
		{#if loading}
			<p class="loading-text loading">Loading...</p>
		{:else if recentBlocks.length === 0}
			<p class="empty-text">No points recorded yet. Play some poker!</p>
		{:else}
			<div class="activity-list">
				{#each recentBlocks as block}
					<div class="activity-item card">
						<div class="activity-icon">
							{#if block.data.type === 'poker_win'}
								<ion-icon name="trophy-outline" style="color: var(--gold)"></ion-icon>
							{:else}
								<ion-icon name="create-outline" style="color: var(--accent-light)"></ion-icon>
							{/if}
						</div>
						<div class="activity-info">
							<span class="activity-title">
								{getPlayerName(block.data.winner || '')} earned a point
							</span>
							<span class="activity-meta">
								{block.data.type === 'poker_win' ? 'Poker Win' : block.data.description}
								· {formatTime(block.data.timestamp)}
							</span>
						</div>
						<span class="badge badge-accent">#{block.index}</span>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>

<style>
	.dashboard {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.dash-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.dash-header h1 {
		font-size: 1.5rem;
		font-weight: 800;
		background: linear-gradient(135deg, var(--text-primary), var(--accent-light));
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}
	.btn-sm { padding: 6px 14px; font-size: 0.8rem; }

	.scoreboard {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 24px;
		padding: 28px 20px;
		text-align: center;
	}

	.score-player {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 1;
	}
	.score-name {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.score-value {
		font-size: 3rem;
		font-weight: 800;
		font-family: var(--font-mono);
		color: var(--text-muted);
		transition: all var(--transition-slow);
	}
	.score-value.leading {
		color: var(--gold);
		text-shadow: 0 0 20px rgba(251, 191, 36, 0.3);
	}

	.score-vs {
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--text-muted);
		letter-spacing: 0.1em;
	}

	.actions {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
	}

	.action-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 18px 12px;
		cursor: pointer;
		text-align: center;
		border: 1px solid rgba(255,255,255,0.06);
	}
	.action-card:hover {
		background: var(--bg-card-hover);
		transform: translateY(-2px);
		border-color: rgba(255,255,255,0.12);
	}

	.action-icon { font-size: 1.5rem; }
	.action-label {
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--text-secondary);
		letter-spacing: 0.02em;
	}

	.recent h2 {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--text-secondary);
		margin-bottom: 12px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.activity-list { display: flex; flex-direction: column; gap: 8px; }

	.activity-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
	}
	.activity-icon { font-size: 1.2rem; }
	.activity-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.activity-title { font-size: 0.85rem; font-weight: 500; }
	.activity-meta { font-size: 0.72rem; color: var(--text-muted); }

	.loading-text, .empty-text {
		text-align: center;
		color: var(--text-muted);
		font-size: 0.85rem;
		padding: 24px;
	}
</style>
