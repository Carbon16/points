<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { auth, getAuthHeaders } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
    import type { BlackjackGameState, Card } from '$lib/types';
	import { fly, scale, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	let game = $state<BlackjackGameState | null>(null);
	let pollingInterval: ReturnType<typeof setInterval>;
	let error = $state<string | null>(null);
    let loading = $state(true);

    // Form inputs
    let betAmount = $state(10);
	let playForPoints = $state(true);

	onMount(() => {
		loadGame();
		startPolling();
	});

	onDestroy(() => {
		if (pollingInterval) clearInterval(pollingInterval);
	});

	function startPolling() {
		if (pollingInterval) clearInterval(pollingInterval);
		pollingInterval = setInterval(loadGame, 1000);
	}

	async function loadGame() {
		if (!$auth.token) {
			goto('/portal/login');
			return;
		}

		try {
			const res = await fetch('/api/blackjack', {
				headers: getAuthHeaders($auth.token)
			});
			const data = await res.json();
			if (data.type === 'game') {
				game = data.game;
			} else {
				game = null;
			}
		} catch (e) {
			console.error('Failed to load game', e);
		}
        loading = false;
	}

	async function createGame() {
		error = null;
		try {
			const stakes = playForPoints ? 'full' : 'none';
			const res = await fetch('/api/blackjack', {
				method: 'POST',
				headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'create', payload: { stakes } })
			});
			const data = await res.json();
			if (data.success) {
				game = data.game;
			} else {
				error = data.error;
			}
		} catch (e) {
			error = 'Connection failed';
		}
	}

	async function joinGame() {
		error = null;
		try {
			const res = await fetch('/api/blackjack', {
				method: 'POST',
				headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'join' })
			});
			const data = await res.json();
			if (data.success) {
				game = data.game;
			} else {
				error = data.error;
			}
		} catch (e) {
			error = 'Connection failed';
		}
	}

	async function doAction(action: 'bet' | 'call' | 'check' | 'fold' | 'hit' | 'stand' | 'double', amount?: number) {
		if (!game) return;
		error = null;

		try {
			const res = await fetch('/api/blackjack', {
				method: 'POST',
				headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action,
					amount
				})
			});
			const data = await res.json();
			if (data.success) {
				game = data.game;
			} else {
				error = data.error || 'Action failed';
			}
		} catch (e) {
			error = 'Connection failed';
		}
	}

	async function leaveGame() {
		try {
			await fetch('/api/blackjack', {
				method: 'POST',
				headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'leave' })
			});
			game = null;
		} catch (e) {
			console.error(e);
		}
	}

    async function nextHand() {
        error = null;
		try {
			const res = await fetch('/api/blackjack', {
				method: 'POST',
				headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'next-hand' })
			});
			const data = await res.json();
			if (data.success) {
                if (data.game?.gameOver) {
                    game = null; // Game completely over
                } else {
				    game = data.game;
                }
			} else {
				error = data.error || 'Action failed';
			}
		} catch (e) {
			error = 'Connection failed';
		}
    }

	// ─── Computed Helpers ───
	let me = $derived(game?.players.find((p) => p.id === $auth.userId));
	let opponent = $derived(game?.players.find((p) => p.id !== $auth.userId && p.id !== 'waiting'));
    let isWaiting = $derived(game?.players.some((p) => p.id === 'waiting'));
    let myIndex = $derived(game?.players.findIndex(p => p.id === $auth.userId));
    let isMyTurn = $derived(game && game.currentPlayerIndex === myIndex);

    const minBet = 5;
	const maxBet = $derived(me?.chips || 250);

	// ─── Formatters ───
	function getSuitSymbol(suit: string) {
		const symbols: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
		return symbols[suit] || suit;
	}

	function isRed(suit: string) {
		return suit === 'hearts' || suit === 'diamonds';
	}
</script>

<div class="blackjack-page animate-in">
	<div class="page-header">
		<button class="btn btn-ghost icon-btn" onclick={() => goto('/casino')} aria-label="Casino Lobby">
			<ion-icon name="arrow-back-outline"></ion-icon>
		</button>
		<h1>🃏 Blackjack</h1>
		{#if game && game.stakes === 'none'}
			<span class="badge practice-badge">Practice Mode</span>
		{/if}
        {#if game}
             <button class="btn btn-ghost sm" onclick={leaveGame}>Leave</button>
        {:else}
		    <div style="width: 40px;"></div> <!-- Spacer -->
        {/if}
	</div>

	{#if error}
		<div class="toast error" transition:fly={{ y: 50 }}>
			{error} <button class="close-error" onclick={() => error = null}>✕</button>
		</div>
	{/if}

	{#if loading}
		<p class="loading-text loading">Loading...</p>
	{:else if !game}
		<!-- ─── Lobby ─── -->
		<div class="lobby card" in:fade>
			<div class="game-icon">🃏</div>
            <h2>Blackjack</h2>
			<p class="lobby-text">Beat the dealer to win chips.</p>
			
			<div class="lobby-controls">
                <label class="toggle-label">
					<input type="checkbox" bind:checked={playForPoints} />
					<span class="toggle-text">Play for Points (Stakes)</span>
				</label>
			</div>

            <div class="actions">
                <button class="btn btn-primary" onclick={createGame}>
                    Start New Game
                </button>
                <button class="btn btn-ghost" onclick={joinGame}>
                    Join Game
                </button>
            </div>
		</div>
	{:else if isWaiting}
		<!-- ─── Waiting Room ─── -->
		<div class="lobby card" in:fade>
			<h2>Waiting for opponent...</h2>
            {#if !me}
                <p class="waiting-text">A player is waiting for you to join.</p>
                <div class="actions" style="margin-top: 20px;">
                    <button class="btn btn-primary" onclick={joinGame}>
                        Join Game
                    </button>
                </div>
            {:else}
                <div class="spinner"></div>
                <p class="waiting-text">Another player needs to join the table.</p>
            {/if}
		</div>
	{:else}
		<!-- ─── Active Game ─── -->
		<div class="game-board">
			
            <!-- ─── Opponent Area ─── -->
            {#if opponent}
			<div class="player-zone opponent-zone">
				<div class="player-info">
					<span class="player-name">{opponent.name} {game?.currentPlayerIndex === game?.players.findIndex(p => p.id === opponent.id) && game.phase !== 'waiting' && game.phase !== 'complete' ? '(Thinking...)' : ''}</span>
					<span class="chip-count">
						<ion-icon name="cash-outline"></ion-icon> {opponent.chips}
						{#if opponent.currentBet > 0}
							<span class="bet-indicator">Bet: £{opponent.currentBet}</span>
						{/if}
					</span>
                    {#if opponent.score > 0}
                         <span class="score-badge mini">Score: {opponent.score}</span>
                    {/if}
				</div>
				<div class="hand-area mini-hand-area">
					{#if opponent.hand && opponent.hand.length > 0}
						{#each opponent.hand as card, i (i)}
							<div class="playing-card mini" class:red={isRed(card.suit)} class:card-back={(card as any).hidden} transition:fly|local={{ y: -20, duration: 400 }}>
								{#if !(card as any).hidden}
                                    <span class="card-rank">{card.rank}</span>
                                    <span class="card-suit">{getSuitSymbol(card.suit)}</span>
                                {:else}
                                    <div class="pattern"></div>
                                {/if}
							</div>
						{/each}
					{:else}
                        <div class="playing-card card-back mini"><div class="pattern"></div></div>
                        <div class="playing-card card-back mini"><div class="pattern"></div></div>
					{/if}
				</div>
                {#if opponent.status !== 'betting' && opponent.status !== 'playing'}
                    <div class="status-indicator">{opponent.status}</div>
                {/if}
			</div>
            {/if}

			<!-- ─── Center Area ─── -->
			<div class="table-center">
				<div class="community-zone">
					<div class="pot-display" style="margin-top: 15px;">
						<span class="pot-label">POT</span>
						{#key game.pot}
						<span class="pot-value" in:scale>£{game.pot}</span>
						{/key}
					</div>
				</div>
			</div>

			<!-- ─── My Area ─── -->
            {#if me}
			<div class="player-zone my-zone">
				<div class="hand-area my-hand-area">
					{#if me.hand && me.hand.length > 0}
						{#each me.hand as card, i (card.rank + card.suit)}
							<div class="playing-card my-card" class:red={isRed(card.suit)} 
								in:fly={{ y: 100, duration: 500, delay: i * 150, easing: cubicOut }}>
								<span class="card-top">{card.rank}{getSuitSymbol(card.suit)}</span>
								<div class="card-center">{getSuitSymbol(card.suit)}</div>
							</div>
						{/each}
					{/if}
				</div>
				<div class="player-info my-info">
					<span class="player-name">{me.name}</span>
					<span class="chip-count">
						<ion-icon name="cash-outline"></ion-icon> {me.chips}
						{#if me.currentBet > 0}
							<span class="bet-indicator">Bet: £{me.currentBet}</span>
						{/if}
					</span>
                    {#if me.score > 0}
                         <span class="score-badge">Score: {me.score}</span>
                    {/if}
				</div>
			</div>
            {/if}

			<!-- ─── Actions Bar ─── -->
             {#if me}
                {#if game.phase === 'complete'}
                    <div class="actions-bar outcome-bar" in:fly={{ y: 20, duration: 300 }}>
                        <div class="outcome-message">
                            {#if game.winnerIds.includes(me.id)}
                                <h3 class="text-win">You Win!</h3>
                            {:else if game.pushIds.includes(me.id)}
                                <h3 class="text-push">Push</h3>
                            {:else if game.loserIds.includes(me.id)}
                                <h3 class="text-lose">You Lost!</h3>
                            {:else}
                                <h3 class="text-muted">Hand Complete</h3>
                            {/if}
                        </div>
                        <button class="btn btn-primary" onclick={nextHand}>Next Hand</button>
                    </div>
                {:else if game.phase === 'betting' && me.status === 'betting' && isMyTurn}
                    <div class="actions-bar" in:fly={{ y: 20, duration: 300 }}>
                        <div class="main-actions" style="display: flex; gap: 12px; align-items: stretch; width: 100%;">
                            {#if opponent && me.currentBet >= opponent.currentBet}
                                <button class="btn btn-primary big-check" onclick={() => doAction('check')} style="flex: 1; min-height: 80px; font-weight: bold; font-size: 1.2rem; text-transform: uppercase;">Check</button>
                            {:else if opponent}
                                <button class="btn btn-primary big-check" onclick={() => doAction('call')} style="flex: 1; min-height: 80px; font-weight: bold; font-size: 1.2rem; text-transform: uppercase;">
                                    Call £{opponent.currentBet - me.currentBet}
                                </button>
                            {/if}

                            <div class="bet-section" style="flex: 2; display: flex; flex-direction: column; gap: 8px; background: rgba(255,255,255,0.05); padding: 8px; border-radius: 12px;">
                                <button class="btn btn-primary bet-btn-small" onclick={() => doAction('bet', betAmount)} disabled={me.chips < betAmount || betAmount < minBet}>
                                    Bet £{betAmount}
                                </button>
                                <div class="slider-container">
                                    <input 
                                        type="range" 
                                        min={minBet} 
                                        max={Math.min(maxBet, 250)} 
                                        step="5" 
                                        bind:value={betAmount}
                                        class="big-slider"
                                    />
                                    <div class="slider-labels">
                                        <span>£{minBet}</span>
                                        <span>£{Math.min(maxBet, 250)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="secondary-actions" style="width: 100%; display: flex; margin-top: 8px;">
                             <button class="btn btn-danger ghost sm" style="width: 100%;" onclick={() => doAction('fold')}>Fold</button>
                        </div>
                    </div>
                {:else if game.phase === 'playing' && me.status === 'playing' && isMyTurn}
                    <div class="actions-bar" in:fly={{ y: 20, duration: 300 }}>
                        <div class="secondary-actions" style="display: flex; gap: 8px;">
                            <button class="btn btn-primary" onclick={() => doAction('hit')}>HIT</button>
                            <button class="btn btn-success" onclick={() => doAction('stand')}>STAND</button>
                            <button class="btn btn-warning" onclick={() => doAction('double')} disabled={me.chips < me.currentBet || me.hand.length > 2}>DOUBLE DOWN</button>
                        </div>
                    </div>
                {:else}
                    <div class="waiting-bar" in:fade>
                        <div class="spinner"></div>
                        <p class="waiting-text">{me.status === 'busted' ? 'You busted!' : 'Waiting for round to finish...'}</p>
                    </div>
                {/if}
             {/if}
			
		</div>
	{/if}
</div>

<style>
/* 
  Reusing Poker's open layout structure. 
  Variables like --bg-primary are assumed to be in global app.css
*/
.blackjack-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;
    min-height: 100vh;
}

h1 { font-size: 1.3rem; font-weight: 800; text-align: center; opacity: 0.5; display: flex; align-items: center; justify-content: center; gap: 8px;}
.practice-badge { font-size: 0.6rem; background: var(--bg-secondary); color: var(--text-muted); padding: 4px 8px; border-radius: 4px; }

.page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 20px;
    background: rgba(30, 41, 59, 0.5);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.lobby {
    text-align: center;
    padding: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    max-width: 400px;
    margin: 40px auto;
}

.game-icon {
    font-size: 4rem;
    margin-bottom: 10px;
    background: rgba(255,255,255,0.05);
    width: 100px;
    height: 100px;
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.lobby-controls {
    margin: 20px 0;
}

.toggle-label {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    background: var(--bg-secondary);
    padding: 10px 20px;
    border-radius: 20px;
}

.game-board {
    display: flex;
    flex-direction: column;
    height: 100%;
    flex: 1;
    justify-content: space-between;
    position: relative;
    padding: 20px;
}

.player-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    z-index: 2;
}

.opponent-zone { margin-bottom: 20px; opacity: 0.9;}
.my-zone { 
    display: flex;
    flex-direction: column-reverse; /* Keeps info below cards */
    align-items: center;
    gap: 10px;
    padding-bottom: 20px; /* Space from the very bottom edge */
    margin-top: 0; 
}

.player-info {
    background: rgba(0,0,0,0.6);
    padding: 6px 16px;
    border-radius: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid rgba(255,255,255,0.1);
}

.my-info {
    background: rgba(30, 41, 59, 0.8);
    border: 1px solid rgba(99, 102, 241, 0.3);
    padding: 8px 20px;
}

.player-name { font-weight: 700; font-size: 0.8rem; color: white; }
.chip-count { font-family: 'Geist Mono', monospace; color: #ffd700; font-weight: 700; display: flex; gap: 8px; align-items: center; }
.bet-indicator { font-size: 0.7rem; color: #aaa; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; }
.score-badge { font-size: 0.8rem; color: #fff; background: rgba(99, 102, 241, 0.4); padding: 2px 8px; border-radius: 10px; font-weight: bold;}
.score-badge.mini { font-size: 0.7rem; background: rgba(255, 255, 255, 0.1); }

.hand-area { 
    display: flex; 
    gap: 8px; 
    justify-content: center; 
    align-items: flex-end; /* cards align bottom */
}
.my-hand-area { height: 120px; gap: 12px; }
.mini-hand-area { height: 70px; gap: 4px; }

.playing-card {
    width: 60px;
    height: 85px;
    background: rgba(255,255,255,0.05); /* Very slight tint for glass */
    border: 2px solid rgba(255,255,255,0.4);
    backdrop-filter: blur(4px);
    border-radius: 8px;
    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    font-family: 'Geist Mono', monospace;
    font-weight: 700;
}

.playing-card.my-card {
    width: 80px;
    height: 115px;
    border: 2px solid rgba(255,255,255,0.6);
}

.playing-card.mini {
    width: 45px;
    height: 65px;
    font-size: 0.8rem;
}

.playing-card .card-top, .playing-card .card-center, .playing-card .card-rank, .playing-card .card-suit {
    color: white; /* Default white text */
    filter: drop-shadow(0 0 2px rgba(0,0,0,0.8)); /* Readability */
}
.playing-card.red .card-top, .playing-card.red .card-center, .playing-card.red .card-rank, .playing-card.red .card-suit { 
    color: #ff5555; /* Bright Red */
}

.my-card .card-top { position: absolute; top: 6px; left: 6px; font-size: 1rem; line-height: 1; }
.my-card .card-center { font-size: 2.5rem; }

.card-back {
    background: #1e293b;
    border: 2px solid rgba(255, 255, 255, 0.2);
    position: relative;
}
.card-back .pattern {
    position: absolute;
    inset: 4px;
    border-radius: 4px;
    background: repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.05) 5px, rgba(255,255,255,0.05) 10px);
}

.playing-card.empty { background: rgba(0,0,0,0.2); box-shadow: none; border: 2px dashed rgba(255,255,255,0.1); }

.table-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    margin: auto 0; /* This keeps the table perfectly centered between players */
    z-index: 1;
}

.dealer-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
}

.dealer-label {
    font-weight: 800;
    font-size: 0.9rem;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    text-shadow: 0 2px 4px rgba(0,0,0,0.5);
}
.dealer-label .score-value { color: #fff; margin-left: 6px; }

/* Actions Bar */
.actions-bar, .waiting-bar {
    position: sticky;
    bottom: 16px;
    margin: 0 auto;
    background: linear-gradient(to top, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.8));
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    padding: 16px;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 100;
    width: 95%;
    max-width: 600px;
    box-shadow: 0 -10px 40px rgba(0,0,0,0.6);
}

.main-actions, .secondary-actions {
    display: flex;
    gap: 16px;
    width: 100%;
    max-width: 600px;
    align-items: center;
    justify-content: center;
}

.bet-section {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 20px;
    background: rgba(0,0,0,0.3);
    padding: 10px 20px;
    border-radius: 12px;
}
.slider-container { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.big-slider { width: 100%; accent-color: var(--accent); }
.slider-labels { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted); font-family: 'Geist Mono', monospace; }
.bet-btn-small { min-width: 120px; font-weight: 800; }

.outcome-bar {
    flex-direction: column;
    gap: 15px;
}

.outcome-message h3 { font-size: 1.5rem; font-weight: 800; margin: 0; }
.text-win { color: #10b981; text-shadow: 0 0 10px rgba(16, 185, 129, 0.5); }
.text-push { color: #f59e0b; }
.text-lose { color: #ef4444; }

.toast.error {
    position: fixed; top: 100px; left: 50%; transform: translateX(-50%);
    background: var(--danger); color: white; padding: 10px 20px; border-radius: 20px;
    z-index: 1000; display: flex; align-items: center; gap: 10px; font-weight: bold; box-shadow: 0 10px 20px rgba(0,0,0,0.5);
}
.close-error { background: none; border: none; color: white; cursor: pointer; opacity: 0.8; font-size: 1rem; }
	.pot-display {
		background: rgba(0,0,0,0.6);
		padding: 8px 24px;
		border-radius: 30px;
		border: 1px solid rgba(255,215,0,0.5);
		text-align: center;
	}
	.pot-label { display: block; font-size: 0.6rem; color: #ccc; letter-spacing: 2px; }
	.pot-value { font-size: 1.4rem; color: #ffd700; font-weight: 800; text-shadow: 0 0 10px rgba(255,215,0,0.3); }

.spinner { width: 20px; height: 20px; border: 3px solid rgba(255,255,255,0.1); border-top-color: var(--accent); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.waiting-text { color: var(--text-muted); font-weight: 600; }
.status-indicator { font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: var(--accent); background: rgba(99, 102, 241, 0.2); padding: 4px 10px; border-radius: 8px;}
</style>
