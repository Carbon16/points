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

	async function createGame() {
		error = null;
		try {
			const res = await fetch('/api/knucklebones', {
				method: 'POST',
				headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'create' })
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
	const dieColors: Record<number, string> = {
		1: 'from-slate-100 to-slate-300 text-slate-800',
		2: 'from-blue-100 to-blue-300 text-blue-900',
		3: 'from-emerald-100 to-emerald-300 text-emerald-900',
		4: 'from-amber-100 to-amber-300 text-amber-900',
		5: 'from-rose-100 to-rose-300 text-rose-900',
		6: 'from-purple-100 to-purple-300 text-purple-900',
	};

	function getDieColor(val: number | null) {
		if (val === null) return 'bg-slate-800/50 border-slate-700/50';
		return `bg-gradient-to-br border-white/20 shadow-md ${dieColors[val]}`;
	}
</script>

<div class="h-full flex flex-col bg-slate-900 text-slate-100 overflow-hidden font-sans relative">
	{#if error}
		<div class="absolute top-4 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-6 py-3 rounded-full shadow-2xl z-50 flex items-center gap-3 animate-fade-in backdrop-blur-sm border border-red-400">
			<span class="font-bold">Error:</span> {error}
			<button class="ml-2 hover:bg-red-600 rounded-full p-1 transition-colors" onclick={() => error = null}>✕</button>
		</div>
	{/if}

	{#if !game}
		<!-- ─── Lobby ─── -->
		<div class="flex-1 flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/20 via-slate-900 to-black">
			<div class="max-w-md w-full bg-slate-800/50 p-10 rounded-3xl shadow-2xl border border-slate-700/50 backdrop-blur-md text-center">
				<div class="w-20 h-20 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
					<span class="text-4xl">🎲</span>
				</div>
				<h1 class="text-4xl font-extrabold mb-2 bg-gradient-to-br from-white to-amber-200 bg-clip-text text-transparent">Knucklebones</h1>
				<p class="text-slate-400 mb-8 font-medium">Strategic dice placement. Match dice to multiply, place to destroy.</p>
				
				<div class="space-y-4">
					<button onclick={createGame} class="w-full py-4 px-6 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-amber-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0">
						Start New Game
					</button>
					<div class="relative py-2 leading-none flex items-center justify-center">
						<div class="w-full border-t border-slate-600/50 absolute"></div>
						<span class="bg-slate-800 z-10 px-4 text-xs font-semibold text-slate-500 uppercase tracking-widest relative">or</span>
					</div>
					<button onclick={joinGame} class="w-full py-4 px-6 bg-slate-700/50 hover:bg-slate-700 text-white rounded-xl font-bold text-lg border border-slate-600 hover:border-slate-500 transition-all shadow-md">
						Join Existing Game
					</button>
				</div>
			</div>
		</div>
	{:else}
		<!-- ─── Active Game Header ─── -->
		<header class="bg-slate-800/80 backdrop-blur-md border-b border-slate-700/50 p-4 flex justify-between items-center z-10 sticky top-0 shadow-sm">
			<div class="flex items-center gap-3">
				<div class="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center shadow-inner">
					<span class="text-xl">🎲</span>
				</div>
				<div>
					<h2 class="font-bold text-lg tracking-wide">Knucklebones</h2>
					<div class="text-xs text-slate-400 font-medium tracking-wide">Phase: <span class="text-amber-400 uppercase">{game.phase}</span></div>
				</div>
			</div>
			
			<div class="flex items-center gap-4">
				<button onclick={leaveGame} class="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white bg-slate-700/50 hover:bg-red-500/80 rounded-lg transition-colors border border-slate-600/50 hover:border-red-500/50">
					Leave Table
				</button>
			</div>
		</header>

		<div class="flex-1 flex flex-col relative bg-slate-900 pb-8 p-4 md:p-8 overflow-y-auto">
             {#if game.phase === 'complete' && me}
                 <div class="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center z-50 rounded-xl">
                    <h2 class="text-5xl font-black text-white mb-4 shadow-black drop-shadow-2xl tracking-wide uppercase italic">
                        {#if game.winnerId === me.id}
                            <span class="text-amber-400">You Win!</span>
                        {:else if game.winnerId === 'draw'}
                            <span class="text-blue-400">It's a Draw!</span>
                        {:else}
                            <span class="text-slate-400">You Lose</span>
                        {/if}
                    </h2>
                    <div class="flex gap-8 mb-8 bg-slate-800/90 p-6 rounded-2xl border border-slate-700">
                         <div class="text-center">
                             <div class="text-sm text-slate-400 font-bold uppercase tracking-wider mb-1">Your Score</div>
                             <div class="text-4xl font-black text-white">{me?.score}</div>
                         </div>
                         <div class="w-px bg-slate-700"></div>
                         <div class="text-center">
                             <div class="text-sm text-slate-400 font-bold uppercase tracking-wider mb-1">Opponent</div>
                             <div class="text-4xl font-black text-white">{opponent?.score || 0}</div>
                         </div>
                    </div>
                    <button onclick={leaveGame} class="px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold rounded-xl shadow-xl hover:shadow-amber-500/25 transition-all text-xl transform hover:-translate-y-1 active:translate-y-0">
                        Back to Lobby
                    </button>
                </div>
             {/if}

			{#if isWaiting}
                <div class="flex-1 flex items-center justify-center">
                    <div class="animate-pulse flex flex-col items-center">
                        <div class="w-16 h-16 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mb-6"></div>
                        <span class="text-xl font-medium text-slate-400">Waiting for opponent...</span>
                    </div>
                </div>
            {:else if me && opponent}
                <div class="max-w-4xl mx-auto w-full flex flex-col gap-12 relative">

                    <!-- Center active/turn indicator area -->
                    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-full md:w-auto flex flex-col items-center pointer-events-none">
                         <div class="bg-slate-800/90 backdrop-blur-md p-4 rounded-3xl shadow-2xl border border-slate-700/50 flex flex-col items-center gap-2 pointer-events-auto">
                              
                              <div class={`text-sm font-bold tracking-widest uppercase px-3 py-1 rounded-full ${isMyTurn ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'}`}>
                                  {isMyTurn ? 'Your Turn' : "Opponent's Turn"}
                              </div>
                              
                              {#if game.currentRoll !== null}
                                  <div class={`w-16 h-16 rounded-2xl border-2 flex items-center justify-center text-3xl font-black ${getDieColor(game.currentRoll)}`}>
                                      {game.currentRoll}
                                  </div>
                              {:else if isMyTurn}
                                   <div class="w-16 h-16 rounded-2xl border-2 border-dashed border-slate-600 bg-slate-800/50 flex items-center justify-center">
                                       <span class="text-2xl opacity-50 text-slate-400">?</span>
                                   </div>
                              {:else}
                                  <div class="w-16 h-16 rounded-2xl border-2 border-slate-700 bg-slate-800 flex items-center justify-center animate-pulse">
                                      <span class="text-2xl text-slate-600">🎲</span>
                                  </div>
                              {/if}

                              {#if isMyTurn && game.currentRoll === null}
                                <button onclick={() => doAction('roll')} class="mt-2 px-6 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold rounded-xl shadow-lg transition-all text-sm w-full">
                                    Roll Die
                                </button>
                              {:else if isMyTurn}
                                <div class="mt-2 text-xs text-slate-400 font-medium text-center">
                                    Select a column<br>on your board
                                </div>
                              {/if}
                         </div>
                    </div>

                    <!-- Opponent Board (Top) -->
                    <div class={`flex flex-col items-center transition-opacity duration-300 ${isMyTurn ? 'opacity-50' : 'opacity-100'}`}>
                        <div class="flex justify-between items-end w-full max-w-sm mb-4">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center text-lg font-bold shadow-inner border border-slate-600/50">
                                    🤖
                                </div>
                                <div class="font-extrabold text-lg text-slate-200">{opponent.name}</div>
                            </div>
                            <div class="text-3xl font-black text-slate-300 drop-shadow-md">{opponent.score}</div>
                        </div>
                        
                        <!-- Column Scores -->
                        <div class="flex gap-4 mb-2 max-w-sm w-full px-2">
                             {#each opponent.columnScores as score}
                                 <div class="flex-1 text-center font-bold text-amber-500/80 text-lg">{score > 0 ? score : '-'}</div>
                             {/each}
                        </div>

                        <!-- Board Grid (Reverse row order for opponent so bottom faces center) -->
                        <div class="flex gap-4 bg-slate-800/50 p-4 rounded-3xl border border-slate-700/50 shadow-inner max-w-sm w-full">
                            {#each [0, 1, 2] as col}
                                 <div class="flex-1 flex flex-col gap-2">
                                     <!-- Opponent rows: 2, 1, 0 -> 0 is bottom visually for them, closest to center. We stored them such that indexing doesn't strictly matter as long as rendering is consistent. Let's assume index 0 is bottom (first played), index 2 is top. So we render 2 then 1 then 0. -->
                                     {#each [2, 1, 0] as row}
                                          {#if opponent.board[col][row] !== null}
                                              <div class={`aspect-square w-full rounded-2xl border-2 flex items-center justify-center text-2xl font-black ${getDieColor(opponent.board[col][row])}`}>
                                                  {opponent.board[col][row]}
                                              </div>
                                          {:else}
                                              <div class="aspect-square w-full rounded-2xl border-2 border-slate-700/50 bg-slate-800/30"></div>
                                          {/if}
                                     {/each}
                                 </div>
                            {/each}
                        </div>
                    </div>

                    <div class="h-16 md:h-32"></div> <!-- Spacer for center element -->

                    <!-- My Board (Bottom) -->
                    <div class={`flex flex-col items-center transition-opacity duration-300 ${!isMyTurn ? 'opacity-50' : 'opacity-100'}`}>
                        <!-- Board Grid (My rows 2, 1, 0 -> 2 is top, 0 is bottom closest to me) -->
                        <div class="flex gap-4 bg-slate-800/80 p-4 rounded-3xl border border-slate-700/80 shadow-2xl max-w-sm w-full relative">
                            {#each [0, 1, 2] as col}
                                 <div class={`flex-1 flex flex-col gap-2 relative ${game && isMyTurn && game.currentRoll !== null ? 'cursor-pointer group' : ''}`}
                                      onclick={() => { if(game && isMyTurn && game.currentRoll !== null) doAction('place', col) }}
                                      role="button"
                                      tabindex="0"
                                      onkeydown={(e) => { if(game && e.key === 'Enter' && isMyTurn && game.currentRoll !== null) doAction('place', col) }}
                                      >
                                     
                                     <!-- Hover indicator overlay for placing -->
                                     {#if game && isMyTurn && game.currentRoll !== null && opponent.board[col].filter(v=>v!==null).length < 3}
                                         <div class="absolute -inset-2 bg-white/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 border border-white/10"></div>
                                     {/if}

                                     {#each [2, 1, 0] as row}
                                          {#if me.board[col][row] !== null}
                                              <div class={`aspect-square w-full rounded-2xl border-2 flex items-center justify-center text-2xl font-black z-20 ${getDieColor(me.board[col][row])}`}>
                                                  {me.board[col][row]}
                                              </div>
                                          {:else}
                                              <div class="aspect-square w-full rounded-2xl border-2 border-slate-700 bg-slate-800 border-dashed z-20 opacity-50 group-hover:border-amber-500/50 group-hover:bg-amber-500/10 transition-colors"></div>
                                          {/if}
                                     {/each}
                                 </div>
                            {/each}
                        </div>

                        <!-- Column Scores -->
                        <div class="flex gap-4 mt-3 mb-4 max-w-sm w-full px-2">
                             {#each me.columnScores as score}
                                 <div class="flex-1 text-center font-bold text-amber-500 text-xl drop-shadow-sm">{score > 0 ? score : '-'}</div>
                             {/each}
                        </div>

                        <div class="flex justify-between items-start w-full max-w-sm bg-slate-800/90 p-4 rounded-2xl shadow-xl border border-slate-700/50">
                             <div class="flex items-center gap-4">
                                <div class="w-14 h-14 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-2xl font-bold shadow-inner border border-slate-500/50">
                                    👤
                                </div>
                                <div class="font-extrabold text-xl text-white tracking-wide">{me.name}</div>
                            </div>
                            <div class="text-4xl font-black text-white drop-shadow-md">{me.score}</div>
                        </div>
                    </div>

                </div>
            {/if}
		</div>
	{/if}
</div>
