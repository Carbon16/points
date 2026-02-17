<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { auth, getAuthHeaders } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import type { GameState } from '$lib/types';

	let game = $state<GameState | null>(null);
	let loading = $state(true);
	let error = $state('');
	let betAmount = $state(5);
	let gameOverInfo = $state<{ winner?: string; loser?: string } | null>(null);
	let pollInterval: ReturnType<typeof setInterval>;

	onMount(async () => {
		if (!$auth.token) { goto('/login'); return; }
		await loadGame();
		pollInterval = setInterval(loadGame, 3000);
	});

	onDestroy(() => {
		if (pollInterval) clearInterval(pollInterval);
	});

	async function loadGame() {
		try {
			const res = await fetch('/api/game', { headers: getAuthHeaders($auth.token!) });
			const data = await res.json();
			if (data.success) game = data.data;
		} catch { /* polling, ignore */ }
		loading = false;
	}

	import { GetPrivateKey, signData } from '$lib/crypto';

	async function doAction(action: string, amount?: number) {
		error = '';
		try {
			const res = await fetch('/api/game', {
				method: 'POST',
				headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, amount })
			});
			const data = await res.json();
			if (!data.success) { error = data.error; return; }

			if (data.data?.gameOver) {
				// Capture state before clearing
				const finalGame = game || data.data.game; // fallback if game was null (shouldn't be)
				const winnerId = data.data.winner;
				
				// Record Hand History (Signed)
				if (finalGame) {
					saveHandHistory(finalGame, winnerId);
				}

				gameOverInfo = { winner: data.data.winner, loser: data.data.loser };
				game = null;
			} else if (data.data?.game) {
				game = data.data.game;
			} else {
				game = data.data;
			}
		} catch {
			error = 'Connection failed';
		}
	}

	async function saveHandHistory(finalGame: GameState, winnerId: string) {
		try {
			const pk = await GetPrivateKey();
			if (!pk) return; // Can't sign

			const record = {
				gameId: crypto.randomUUID(), // unique ID for this hand record
				handNumber: finalGame.handNumber,
				myHand: getMyPlayer(finalGame)?.hand,
				opponentHand: getOpponent(finalGame)?.hand, // might be visible if showdown
				community: finalGame.communityCards,
				pot: finalGame.pot,
				winner: winnerId,
				timestamp: Date.now()
			};

			const dataStr = JSON.stringify(record);
			const signature = await signData(pk, dataStr);

			await fetch('/api/hands', {
				method: 'POST',
				headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
				body: JSON.stringify({
					gameId: 'poker', // category
					data: dataStr,
					signature,
					timestamp: record.timestamp
				})
			});
			console.log('Hand history signed and saved');
		} catch (e) {
			console.error('Failed to save hand history', e);
		}
	}

	function getName(id?: string) {
		return id === 'player1' ? 'Player 1' : 'Player 2';
	}

	function getSuitSymbol(suit: string) {
		const symbols: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
		return symbols[suit] || suit;
	}

	function isRed(suit: string) {
		return suit === 'hearts' || suit === 'diamonds';
	}

	function getMyPlayer(g: GameState) {
		return g.players.find(p => p.id === $auth.userId);
	}

	function getOpponent(g: GameState) {
		return g.players.find(p => p.id !== $auth.userId);
	}

	function isMyTurn(g: GameState) {
		return g.players[g.currentPlayerIndex]?.id === $auth.userId;
	}

	function canCheck(g: GameState) {
		const me = getMyPlayer(g);
		const op = getOpponent(g);
		return me && op && me.currentBet >= op.currentBet;
	}

	function canCall(g: GameState) {
		const me = getMyPlayer(g);
		const op = getOpponent(g);
		return me && op && me.currentBet < op.currentBet;
	}
</script>

<div class="poker-page animate-in">
	<div class="page-header">
		<h1><ion-icon name="card-outline"></ion-icon> Poker</h1>
	</div>

	{#if loading}
		<p class="loading-text loading">Loading...</p>
	{:else if gameOverInfo}
		<!-- Game Over Screen -->
		<div class="game-over card card-glow">
			<span class="game-over-icon"><ion-icon name="trophy-outline"></ion-icon></span>
			<h2>{getName(gameOverInfo.winner)} Wins!</h2>
			<p>{getName(gameOverInfo.loser)} went bankrupt</p>
			<p class="game-over-sub">Point recorded on the blockchain</p>
			<button class="btn btn-primary" onclick={() => { gameOverInfo = null; loadGame(); }}>
				Back to Lobby
			</button>
		</div>
	{:else if !game}
		<!-- No active game -->
		<div class="lobby card">
			<p class="lobby-text">No game in progress</p>
			<button class="btn btn-primary" onclick={() => doAction('create')}>
				Start New Game
			</button>
		</div>
	{:else}
		<!-- Active Game -->
		<div class="game-board">
			<!-- Opponent -->

			<div class="player-zone opponent-zone">
				<div class="player-info">
					<span class="player-name">{getOpponent(game)?.name || 'Opponent'}</span>
					<span class="chip-count"><ion-icon name="cash-outline"></ion-icon> {getOpponent(game)?.chips}</span>
					{#if getOpponent(game)?.isDealer}<span class="dealer-badge">D</span>{/if}
				</div>
				<div class="hand-area">
					{#if getOpponent(game)?.hand && getOpponent(game)!.hand.length > 0}
						{#each getOpponent(game)!.hand as card}
							<div class="playing-card" class:red={isRed(card.suit)}>
								<span class="card-rank">{card.rank}</span>
								<span class="card-suit">{getSuitSymbol(card.suit)}</span>
							</div>
						{/each}
					{:else}
						<div class="playing-card card-back"><ion-icon name="flame-outline"></ion-icon></div>
						<div class="playing-card card-back"><ion-icon name="flame-outline"></ion-icon></div>
					{/if}
				</div>
			</div>

			<!-- Community + Pot -->
			<div class="community-zone">
				<div class="community-cards">
					{#each game.communityCards as card}
						<div class="playing-card community" class:red={isRed(card.suit)}>
							<span class="card-rank">{card.rank}</span>
							<span class="card-suit">{getSuitSymbol(card.suit)}</span>
						</div>
					{/each}
					{#each Array(5 - game.communityCards.length) as _}
						<div class="playing-card community empty"></div>
					{/each}
				</div>
				<div class="pot-display">
					<span class="pot-label">POT</span>
					<span class="pot-value">{game.pot}</span>
				</div>
				<div class="round-info">
					Hand #{game.handNumber} · 
					{game.phase === 'showdown' ? 'Showdown' :
					 game.round === 0 ? 'Pre-Flop' :
					 game.round === 1 ? 'Flop' :
					 game.round === 2 ? 'Turn' : 'River'}
				</div>
			</div>

			<!-- My hand -->
			<div class="player-zone my-zone">
				<div class="hand-area">
					{#if getMyPlayer(game)?.hand}
						{#each getMyPlayer(game)!.hand as card}
							<div class="playing-card my-card" class:red={isRed(card.suit)}>
								<span class="card-rank">{card.rank}</span>
								<span class="card-suit">{getSuitSymbol(card.suit)}</span>
							</div>
						{/each}
					{/if}
				</div>
				<div class="player-info">
					<span class="player-name">{getMyPlayer(game)?.name || 'You'}</span>
					<span class="chip-count">💰 {getMyPlayer(game)?.chips}</span>
					{#if getMyPlayer(game)?.isDealer}<span class="dealer-badge">D</span>{/if}
				</div>
			</div>

			<!-- Actions -->
			{#if game.phase === 'betting' && isMyTurn(game)}
				<div class="actions-bar">
					{#if canCheck(game)}
						<button class="btn btn-ghost" onclick={() => doAction('check')}>Check</button>
					{/if}
					{#if canCall(game)}
						<button class="btn btn-primary" onclick={() => doAction('call')}>
							Call ({(getOpponent(game)?.currentBet || 0) - (getMyPlayer(game)?.currentBet || 0)})
						</button>
					{/if}
					<button class="btn btn-primary" onclick={() => doAction('bet', betAmount)}>
						Bet {betAmount}
					</button>
					<button class="btn btn-danger" onclick={() => doAction('fold')}>Fold</button>
					<button class="btn btn-ghost" onclick={() => doAction('all-in')}>All In</button>
				</div>
				<div class="bet-slider">
					<input type="range" min="5" max={getMyPlayer(game)?.chips || 130} step="5" bind:value={betAmount} />
					<span class="bet-label">{betAmount}</span>
				</div>
			{:else if game.phase === 'betting'}
				<div class="waiting-bar">
					<p class="waiting-text loading">Waiting for {getName(game.players[game.currentPlayerIndex]?.id)}...</p>
				</div>
			{:else if game.phase === 'showdown'}
				<div class="showdown-bar">
					<p class="showdown-text">
						{game.winner ? `${getName(game.winner)} wins this hand!` : 'Split pot!'}
					</p>
					<button class="btn btn-primary" onclick={() => doAction('next-hand')}>
						Next Hand →
					</button>
				</div>
			{/if}

			{#if error}
				<p class="error">{error}</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.poker-page {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	h1 { font-size: 1.3rem; font-weight: 800; }

	.lobby, .game-over {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 40px 20px;
		text-align: center;
	}
	.lobby-text { color: var(--text-muted); }

	.game-over-icon { font-size: 3rem; }
	.game-over h2 { font-size: 1.5rem; color: var(--gold); }
	.game-over-sub { color: var(--text-muted); font-size: 0.8rem; }

	.game-board {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.player-zone {
		display: flex;
		flex-direction: column;
		gap: 8px;
		align-items: center;
	}
	.opponent-zone { flex-direction: column; }
	.my-zone { flex-direction: column-reverse; }

	.player-info {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.player-name {
		font-weight: 600;
		font-size: 0.85rem;
	}
	.chip-count {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--gold);
	}
	.dealer-badge {
		background: var(--accent);
		color: white;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.65rem;
		font-weight: 700;
	}

	.hand-area {
		display: flex;
		gap: 8px;
		justify-content: center;
	}

	.playing-card {
		width: 52px;
		height: 72px;
		background: white;
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		color: #1a1a2e;
		box-shadow: 0 2px 8px rgba(0,0,0,0.3);
		transition: transform var(--transition);
	}
	.playing-card.red { color: #dc2626; }
	.playing-card.my-card {
		width: 60px;
		height: 84px;
	}
	.playing-card.my-card:hover { transform: translateY(-4px); }
	.playing-card.community {
		width: 46px;
		height: 64px;
		font-size: 0.85rem;
	}
	.playing-card.empty {
		background: rgba(255,255,255,0.05);
		border: 1px dashed rgba(255,255,255,0.1);
		box-shadow: none;
	}
	.playing-card.card-back {
		background: var(--accent-dark);
		color: var(--accent-light);
		font-size: 1.5rem;
	}

	.card-rank { font-size: 1rem; line-height: 1; }
	.card-suit { font-size: 0.85rem; line-height: 1; }

	.community-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 16px;
		background: rgba(16, 100, 60, 0.15);
		border-radius: var(--radius);
		border: 1px solid rgba(16, 185, 129, 0.1);
	}

	.community-cards {
		display: flex;
		gap: 6px;
		justify-content: center;
	}

	.pot-display { display: flex; align-items: baseline; gap: 6px; }
	.pot-label {
		font-size: 0.65rem;
		font-weight: 700;
		color: var(--text-muted);
		letter-spacing: 0.1em;
	}
	.pot-value {
		font-size: 1.5rem;
		font-weight: 800;
		font-family: var(--font-mono);
		color: var(--gold);
	}

	.round-info {
		font-size: 0.7rem;
		color: var(--text-muted);
	}

	.actions-bar {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		justify-content: center;
	}
	.actions-bar .btn { font-size: 0.8rem; padding: 10px 14px; }

	.bet-slider {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 20px;
	}
	.bet-slider input[type="range"] {
		flex: 1;
		accent-color: var(--accent);
		background: transparent;
		border: none;
		padding: 0;
	}
	.bet-label {
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--accent-light);
		min-width: 30px;
		text-align: right;
	}

	.waiting-bar, .showdown-bar {
		text-align: center;
		padding: 16px;
	}
	.waiting-text { color: var(--text-muted); font-size: 0.85rem; }
	.showdown-text {
		font-weight: 600;
		color: var(--gold);
		margin-bottom: 12px;
	}

	.error {
		color: var(--danger);
		text-align: center;
		font-size: 0.8rem;
	}

	.loading-text {
		text-align: center;
		color: var(--text-muted);
		padding: 40px;
	}
</style>
