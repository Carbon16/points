<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { auth, getAuthHeaders } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
    import type { KnucklebonesGameState } from '$lib/types';

	let game = $state<KnucklebonesGameState | null>(null);
	let pollingInterval: ReturnType<typeof setInterval>;
	let error = $state<string | null>(null);

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
			const res = await fetch('/api/knucklebones', {
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
	}

	let stakesSelection = $state<'full' | 'half' | 'none'>('full');

	async function createGame() {
		error = null;
		try {
			const res = await fetch('/api/knucklebones', {
				method: 'POST',
				headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'create', payload: { stakes: stakesSelection } })
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
			const res = await fetch('/api/knucklebones', {
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

	async function doAction(action: 'roll' | 'place', colIndex?: number) {
		if (!game) return;
		error = null;

		try {
			const res = await fetch('/api/knucklebones', {
				method: 'POST',
				headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action,
					colIndex
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
			await fetch('/api/knucklebones', {
				method: 'POST',
				headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'leave' })
			});
			game = null;
		} catch (e) {
			console.error(e);
		}
	}

	// ─── Computed Helpers ───
	let me = $derived(game?.players.find((p) => p.id === $auth.userId));
    let myIndex = $derived(game?.players.findIndex((p) => p.id === $auth.userId));
	let opponent = $derived(game?.players.find((p) => p.id !== $auth.userId && p.id !== 'waiting'));
	let isWaiting = $derived(game?.players.some((p) => p.id === 'waiting'));
    let isMyTurn = $derived(game?.currentPlayerIndex === myIndex);

	// ─── Component specific styling ───
	const dieColorClasses: Record<number, string> = {
		1: 'die-v1',
		2: 'die-v2',
		3: 'die-v3',
		4: 'die-v4',
		5: 'die-v5',
		6: 'die-v6',
	};

	function getDieColorClass(val: number | null) {
		if (val === null) return 'die-empty';
		return `die-active ${dieColorClasses[val]}`;
	}
</script>

<div class="knucklebones-container">
	{#if error}
		<div class="error-toast">
			<span class="error-title">Error:</span> {error}
			<button class="close-error" onclick={() => error = null}>✕</button>
		</div>
	{/if}

	{#if !game}
		<!-- ─── Lobby ─── -->
		<div class="lobby-screen">
			<div class="lobby-card">
				<div class="game-icon">
					<span>🎲</span>
				</div>
				<h1 class="game-title">Knucklebones</h1>
				<p class="game-subtitle">Strategic dice placement. Match dice to multiply, place to destroy.</p>
				
                <div class="stakes-selector" style="margin-bottom: 24px; text-align: left;">
                    <label style="display: block; color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; font-weight: bold; margin-bottom: 8px;">Stakes</label>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn {stakesSelection === 'full' ? 'btn-primary' : 'btn-ghost'}" style="flex: 1;" onclick={() => stakesSelection = 'full'}>Full Pt</button>
                        <button class="btn {stakesSelection === 'half' ? 'btn-primary' : 'btn-ghost'}" style="flex: 1;" onclick={() => stakesSelection = 'half'}>Half Pt</button>
                        <button class="btn {stakesSelection === 'none' ? 'btn-primary' : 'btn-ghost'}" style="flex: 1;" onclick={() => stakesSelection = 'none'}>Practice</button>
                    </div>
                </div>

				<div class="lobby-actions">
					<button onclick={createGame} class="btn btn-primary btn-large">
						Start New Game
					</button>
					<div class="divider">
						<span>or</span>
					</div>
					<button onclick={joinGame} class="btn btn-ghost btn-large">
						Join Existing Game
					</button>
				</div>
			</div>
		</div>
	{:else}
		<!-- ─── Active Game Header ─── -->
		<header class="game-header">
			<div class="header-left">
				<div class="header-icon">
					<span>🎲</span>
				</div>
				<div class="header-info">
					<h2 class="header-title">Knucklebones</h2>
					<div class="header-status">
                        Phase: <span class="phase-name">{game.phase}</span>
                        {#if game.stakes}
                            <span style="margin-left: 8px; font-size: 0.7rem; color: #aaa; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">
                                {game.stakes === 'full' ? '1 PT' : game.stakes === 'half' ? '0.5 PT' : 'PRACTICE'}
                            </span>
                        {/if}
                    </div>
				</div>
			</div>
			
			<div class="header-right">
				<button onclick={leaveGame} class="btn-leave">
					Leave Table
				</button>
			</div>
		</header>

		<div class="game-area">
             {#if game.phase === 'complete' && me}
                 <div class="outcome-overlay">
                    <h2 class="outcome-title">
                        {#if game.winnerId === me.id}
                            <span class="text-win">You Win!</span>
                        {:else if game.winnerId === 'draw'}
                            <span class="text-draw">Draw!</span>
                        {:else}
                            <span class="text-lose">You Lose</span>
                        {/if}
                    </h2>
                    <div class="outcome-stats">
                         <div class="stat-item">
                             <div class="stat-label">Your Score</div>
                             <div class="stat-value">{me?.score}</div>
                         </div>
                         <div class="stat-divider"></div>
                         <div class="stat-item">
                             <div class="stat-label">Opponent</div>
                             <div class="stat-value">{opponent?.score || 0}</div>
                         </div>
                    </div>
                    <button onclick={leaveGame} class="btn btn-primary btn-large back-btn">
                        Back to Lobby
                    </button>
                </div>
             {/if}

			{#if isWaiting}
                <div class="waiting-area" style="flex-direction: column; gap: 20px;">
                    <div class="loading-state">
                        {#if !me}
                            <h2 style="font-size: 2rem; margin-bottom: 20px;">Game Available</h2>
                            <p class="waiting-text" style="color: #aaa;">A player is waiting for an opponent.</p>
                            <button class="btn btn-primary btn-large" style="margin-top: 20px;" onclick={joinGame}>
                                Join Game
                            </button>
                        {:else}
                            <div class="loading-spinner"></div>
                            <span class="loading-text">Waiting for opponent...</span>
                        {/if}
                    </div>
                </div>
            {:else if me && opponent}
                <div class="game-layout">

                    <!-- Center active/turn indicator area -->
                    <div class="turn-indicator">
                         <div class="turn-card">
                              
                              <div class="turn-badge" class:my-turn={isMyTurn}>
                                  {isMyTurn ? 'Your Turn' : "Opponent's Turn"}
                              </div>
                              
                              <div class="current-die-display">
                                  {#if game.currentRoll !== null}
                                      <div class={`die die-large ${getDieColorClass(game.currentRoll)}`}>
                                          {game.currentRoll}
                                      </div>
                                  {:else if isMyTurn}
                                       <div class="die die-large die-placeholder">
                                           <span>?</span>
                                       </div>
                                  {:else}
                                      <div class="die die-large die-waiting">
                                          <span>🎲</span>
                                      </div>
                                  {/if}
                              </div>

                              {#if isMyTurn && game.currentRoll === null}
                                <button onclick={() => doAction('roll')} class="btn btn-primary roll-btn">
                                    Roll Die
                                </button>
                              {:else if isMyTurn}
                                <div class="turn-hint">
                                    Select a column<br>on your board
                                </div>
                              {/if}
                         </div>
                    </div>

                    <!-- Opponent Board (Top) -->
                    <div class="board-container opponent-board" class:inactive={isMyTurn}>
                        <div class="board-header">
                            <div class="player-info">
                                <div class="player-avatar">🤖</div>
                                <div class="player-name">{opponent.name}</div>
                            </div>
                            <div class="board-score">{opponent.score}</div>
                        </div>
                        
                        <!-- Column Scores -->
                        <div class="column-scores">
                             {#each opponent.columnScores as score}
                                 <div class="col-score">{score > 0 ? score : '-'}</div>
                             {/each}
                        </div>

                        <!-- Board Grid -->
                        <div class="grid-card">
                            {#each [0, 1, 2] as col}
                                 <div class="board-column">
                                     {#each [2, 1, 0] as row}
                                          {#if opponent.board[col][row] !== null}
                                              <div class={`die die-normal ${getDieColorClass(opponent.board[col][row])}`}>
                                                  {opponent.board[col][row]}
                                              </div>
                                          {:else}
                                              <div class="die-slot"></div>
                                          {/if}
                                     {/each}
                                 </div>
                            {/each}
                        </div>
                    </div>

                    <div class="layout-spacer"></div>

                    <!-- My Board (Bottom) -->
                    <div class="board-container my-board" class:inactive={!isMyTurn}>
                        <!-- Board Grid -->
                        <div class="grid-card interactive">
                            {#each [0, 1, 2] as col}
                                 <div class="board-column"
                                      onclick={() => { if(game && isMyTurn && game.currentRoll !== null) doAction('place', col) }}
                                      role="button"
                                      tabindex="0"
                                      onkeydown={(e) => { if(game && e.key === 'Enter' && isMyTurn && game.currentRoll !== null) doAction('place', col) }}
                                      >
                                     
                                     <!-- Hover indicator overlay -->
                                     {#if game && isMyTurn && game.currentRoll !== null && opponent.board[col].filter(v=>v!==null).length < 3}
                                         <div class="column-hover-effect"></div>
                                     {/if}

                                     {#each [2, 1, 0] as row}
                                          {#if me.board[col][row] !== null}
                                              <div class={`die die-normal ${getDieColorClass(me.board[col][row])}`}>
                                                  {me.board[col][row]}
                                              </div>
                                          {:else}
                                              <div class="die-slot die-slot-interactive"></div>
                                          {/if}
                                     {/each}
                                 </div>
                            {/each}
                        </div>

                        <!-- Column Scores -->
                        <div class="column-scores my-col-scores">
                             {#each me.columnScores as score}
                                 <div class="col-score">{score > 0 ? score : '-'}</div>
                             {/each}
                        </div>

                        <div class="board-footer">
                             <div class="player-info">
                                <div class="player-avatar me">👤</div>
                                <div class="player-name">{me.name}</div>
                            </div>
                            <div class="board-score">{me.score}</div>
                        </div>
                    </div>

                </div>
            {/if}
		</div>
	{/if}
</div>

<style>
    .knucklebones-container {
        height: 100%;
        display: flex;
        flex-direction: column;
        background-color: var(--bg-primary);
        color: var(--text-primary);
        overflow: hidden;
        position: relative;
    }

    /* Shared Styles with Blackjack */
    .error-toast {
        position: absolute;
        top: 1rem;
        left: 50%;
        transform: translateX(-50%);
        background-color: var(--danger);
        color: white;
        padding: 0.75rem 1.5rem;
        border-radius: 9999px;
        box-shadow: var(--shadow-lg);
        z-index: 50;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        border: 1px solid rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(4px);
    }

    .error-title { font-weight: bold; }
    .close-error { background: none; color: white; margin-left: 0.5rem; }

    /* Lobby */
    .lobby-screen {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        background: radial-gradient(ellipse at top, #451a03, var(--bg-primary), #000);
    }

    .lobby-card {
        max-width: 28rem;
        width: 100%;
        background-color: rgba(30, 41, 59, 0.5);
        padding: 2.5rem;
        border-radius: 1.5rem;
        box-shadow: var(--shadow-lg);
        border: 1px solid rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(12px);
        text-align: center;
    }

    .game-icon {
        width: 5rem;
        height: 5rem;
        background-color: rgba(245, 158, 11, 0.2);
        border-radius: 1rem;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 1.5rem;
        font-size: 2.5rem;
    }

    .game-title {
        font-size: 2.25rem;
        font-weight: 800;
        margin-bottom: 0.5rem;
        background: linear-gradient(to bottom right, #fff, var(--gold));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    .game-subtitle {
        color: var(--text-secondary);
        margin-bottom: 2rem;
        font-weight: 500;
    }

    .lobby-actions { display: flex; flex-direction: column; gap: 1rem; }
    .btn-large { padding: 1rem 1.5rem; font-size: 1.125rem; width: 100%; border-radius: 0.75rem; }
    
    .divider {
        position: relative;
        padding: 0.5rem 0;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .divider::before {
        content: '';
        position: absolute;
        width: 100%;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .divider span {
        background-color: #1e293b;
        z-index: 10;
        padding: 0 1rem;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
    }

    /* Game Header */
    .game-header {
        background-color: rgba(30, 41, 59, 0.8);
        backdrop-filter: blur(12px);
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        padding: 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 10;
        position: sticky;
        top: 0;
    }

    .header-left { display: flex; align-items: center; gap: 0.75rem; }
    .header-icon {
        width: 2.5rem; height: 2.5rem;
        background: linear-gradient(to bottom right, var(--gold), #d97706);
        border-radius: 0.5rem;
        display: flex; align-items: center; justify-content: center;
        font-size: 1.25rem;
    }
    .header-title { font-weight: bold; font-size: 1.125rem; }
    .header-status { font-size: 0.75rem; color: var(--text-secondary); }
    .phase-name { color: var(--gold); text-transform: uppercase; }
    .btn-leave {
        padding: 0.5rem 1rem; font-size: 0.875rem; font-weight: 600;
        color: var(--text-secondary); background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 0.5rem;
    }
    .btn-leave:hover { color: white; background-color: var(--danger); }

    /* Game Area */
    .game-area {
        flex: 1; display: flex; flex-direction: column;
        padding: 1rem; overflow-y: auto; position: relative;
    }

    .waiting-area { flex: 1; display: flex; align-items: center; justify-content: center; }
    .loading-state { display: flex; flex-direction: column; align-items: center; transition: opacity 0.5s; }
    .loading-spinner {
        width: 4rem; height: 4rem; border: 4px solid rgba(245, 158, 11, 0.2);
        border-top-color: var(--gold); border-radius: 50%; animation: spin 1s linear infinite;
        margin-bottom: 1.5rem;
    }
    .loading-text { font-size: 1.25rem; color: var(--text-secondary); font-weight: 500; }

    /* Outcome Overlay */
    .outcome-overlay {
        position: absolute; inset: 0; background: rgba(0,0,0,0.8);
        backdrop-filter: blur(8px); z-index: 100; display: flex;
        flex-direction: column; align-items: center; justify-content: center;
        padding: 2rem;
    }
    .outcome-title { font-size: 4rem; font-weight: 900; margin-bottom: 1.5rem; text-transform: uppercase; font-style: italic; }
    .text-win { color: var(--gold); }
    .text-lose { color: var(--text-muted); }
    .text-draw { color: #60a5fa; }
    
    .outcome-stats {
        display: flex; gap: 3rem; background: rgba(30, 41, 59, 0.9);
        padding: 1.5rem 2.5rem; border-radius: 1.5rem; border: 1px solid var(--bg-card-hover);
        margin-bottom: 2.5rem;
    }
    .stat-item { text-align: center; }
    .stat-label { font-size: 0.875rem; font-weight: bold; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem; }
    .stat-value { font-size: 2.5rem; font-weight: 900; }
    .stat-divider { width: 1px; background: var(--bg-card-hover); }
    .back-btn { max-width: 200px; }

    /* Main Game Layout */
    .game-layout {
        max-width: 56rem; width: 100%; margin: 0 auto;
        display: flex; flex-direction: column; gap: 3rem;
        position: relative;
    }

    /* Turn Indicator (Center) */
    .turn-indicator {
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, -50%); z-index: 20;
        width: 100%; max-width: 200px;
    }
    .turn-card {
        background: rgba(30, 41, 59, 0.95); backdrop-filter: blur(12px);
        padding: 1rem; border-radius: 1.5rem; box-shadow: var(--shadow-lg);
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
    }
    .turn-badge {
        font-size: 0.75rem; font-weight: bold; text-transform: uppercase;
        padding: 0.25rem 0.75rem; border-radius: 9999px;
        background: var(--bg-elevated); color: var(--text-muted);
        letter-spacing: 0.05em;
    }
    .turn-badge.my-turn { background: rgba(245, 158, 11, 0.2); color: var(--gold); }
    
    .current-die-display { margin: 0.5rem 0; }
    .die {
        display: flex; align-items: center; justify-content: center;
        border-radius: 1rem; font-weight: 900; border: 2px solid rgba(255, 255, 255, 0.1);
        box-shadow: var(--shadow);
    }
    .die-large { width: 4.5rem; height: 4.5rem; font-size: 2.25rem; }
    .die-normal { width: 100%; aspect-ratio: 1; font-size: 1.5rem; }
    
    .die-placeholder { border-style: dashed; opacity: 0.5; color: var(--text-muted); }
    .die-waiting { animation: pulse 2s infinite; color: var(--text-muted); font-size: 1.5rem; }
    
    .roll-btn { margin-top: 0.5rem; width: 100%; }
    .turn-hint { font-size: 0.75rem; color: var(--text-muted); text-align: center; }

    /* Boards */
    .board-container { display: flex; flex-direction: column; align-items: center; transition: opacity 0.3s; }
    .board-container.inactive { opacity: 0.5; }
    
    .board-header, .board-footer {
        display: flex; justify-content: space-between; align-items: center;
        width: 100%; max-width: 20rem; margin-bottom: 1rem;
    }
    .board-footer { margin-top: 1rem; margin-bottom: 0; padding: 1rem; background: var(--bg-card); border-radius: 1rem; }
    
    .player-info { display: flex; align-items: center; gap: 0.75rem; }
    .player-avatar {
        width: 2.5rem; height: 2.5rem; background: var(--bg-elevated);
        border-radius: 0.75rem; display: flex; align-items: center; justify-content: center;
        font-weight: bold; border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .player-avatar.me { background: linear-gradient(135deg, #4b5563, #1f2937); }
    .player-name { font-weight: 800; }
    .board-score { font-size: 2rem; font-weight: 900; color: var(--text-secondary); }

    .column-scores { display: flex; gap: 1rem; width: 100%; max-width: 20rem; padding: 0 0.5rem; margin-bottom: 0.5rem; }
    .col-score { flex: 1; text-align: center; font-weight: 900; font-size: 1.125rem; color: var(--gold); opacity: 0.8; }
    .my-col-scores { margin-top: 0.75rem; margin-bottom: 1rem; }

    .grid-card {
        display: flex; gap: 1rem; background: rgba(30, 41, 59, 0.4);
        padding: 1rem; border-radius: 1.5rem; border: 1px solid rgba(255, 255, 255, 0.05);
        width: 100%; max-width: 20rem;
    }
    .grid-card.interactive { background: rgba(30, 41, 59, 0.7); border-color: rgba(255, 255, 255, 0.1); box-shadow: var(--shadow-lg); }

    .board-column { flex: 1; display: flex; flex-direction: column; gap: 0.5rem; position: relative; }
    .interactive .board-column { cursor: pointer; border-radius: 0.75rem; }
    
    .column-hover-effect {
        position: absolute; inset: -0.5rem; background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 1rem;
        opacity: 0; transition: opacity 0.2s; pointer-events: none;
    }
    .board-column:hover .column-hover-effect { opacity: 1; }

    .die-slot {
        aspect-ratio: 1; width: 100%; border-radius: 0.75rem;
        background: rgba(15, 23, 42, 0.3); border: 2px dashed rgba(255, 255, 255, 0.05);
    }
    .die-slot-interactive { border-color: rgba(255, 255, 255, 0.1); }
    .board-column:hover .die-slot-interactive { border-color: rgba(245, 158, 11, 0.3); background: rgba(245, 158, 11, 0.05); }

    /* Die Contextual Colors */
    .die-active { background: white; color: #1e293b; border: 1px solid #e2e8f0; }
    .die-v1 { background: linear-gradient(135deg, #f8fafc, #cbd5e1); color: #1e293b; }
    .die-v2 { background: linear-gradient(135deg, #dbeafe, #93c5fd); color: #1e3a8a; }
    .die-v3 { background: linear-gradient(135deg, #d1fae5, #6ee7b7); color: #064e3b; }
    .die-v4 { background: linear-gradient(135deg, #fef3c7, #fcd34d); color: #78350f; }
    .die-v5 { background: linear-gradient(135deg, #ffe4e6, #fda4af); color: #881337; }
    .die-v6 { background: linear-gradient(135deg, #f3e8ff, #d8b4fe); color: #581c87; }

    .layout-spacer { height: 6rem; flex-shrink: 0; }

    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
