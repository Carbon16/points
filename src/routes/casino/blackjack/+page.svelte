<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { auth, getAuthHeaders } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
    import type { BlackjackGameState, Card } from '$lib/types';

	let game = $state<BlackjackGameState | null>(null);
	let pollingInterval: ReturnType<typeof setInterval>;
	let error = $state<string | null>(null);

    // Form inputs
    let betAmount = $state(10);

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
	}

	async function createGame() {
		error = null;
		try {
			const res = await fetch('/api/blackjack', {
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

	async function doAction(action: 'bet' | 'hit' | 'stand' | 'double', amount?: number) {
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
        doAction('next-hand' as any); // Type assertion since it's a special action
    }

	// ─── Computed Helpers ───
	let me = $derived(game?.players.find((p) => p.id === $auth.userId));
	let opponent = $derived(game?.players.find((p) => p.id !== $auth.userId && p.id !== 'waiting'));
	let isWaiting = $derived(game?.players.some((p) => p.id === 'waiting'));

	// ─── Formatters ───
	function getSuitSymbol(suit: string) {
		switch (suit) {
			case 'hearts': return '♥';
			case 'diamonds': return '♦';
			case 'clubs': return '♣';
			case 'spades': return '♠';
			default: return '?';
		}
	}

	function getSuitColor(suit: string) {
		return suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-slate-800';
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
		<div class="flex-1 flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black">
			<div class="max-w-md w-full bg-slate-800/50 p-10 rounded-3xl shadow-2xl border border-slate-700/50 backdrop-blur-md text-center">
				<div class="w-20 h-20 bg-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
					<span class="text-4xl">🃏</span>
				</div>
				<h1 class="text-4xl font-extrabold mb-2 bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">Blackjack</h1>
				<p class="text-slate-400 mb-8 font-medium">Beat the dealer to win chips!</p>
				
				<div class="space-y-4">
					<button onclick={createGame} class="w-full py-4 px-6 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-indigo-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0">
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
				<div class="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center shadow-inner">
					<span class="text-xl">🃏</span>
				</div>
				<div>
					<h2 class="font-bold text-lg tracking-wide">Blackjack</h2>
					<div class="text-xs text-slate-400 font-medium tracking-wide">Hand #{game.handNumber} • Phase: <span class="text-indigo-300 uppercase">{game.phase}</span></div>
				</div>
			</div>
			
			<div class="flex items-center gap-4">
				<button onclick={leaveGame} class="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white bg-slate-700/50 hover:bg-red-500/80 rounded-lg transition-colors border border-slate-600/50 hover:border-red-500/50">
					Leave Table
				</button>
			</div>
		</header>

		<div class="flex-1 flex flex-col relative bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-green-900/40 via-slate-900 to-slate-900">
			<!-- Table pattern overlay -->
			<div class="absolute inset-0 opacity-5 pointer-events-none" style="background-image: url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E');"></div>

			<!-- ─── Dealer Area ─── -->
			<div class="flex-1 flex flex-col items-center justify-center p-6 relative">
				{#if isWaiting}
					<div class="animate-pulse flex flex-col items-center">
						<div class="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
						<span class="text-lg font-medium text-slate-400">Waiting for players to join...</span>
					</div>
				{:else}
                    <div class="flex flex-col items-center">
                        <div class="mb-2 px-3 py-1 bg-slate-800/80 rounded-full text-sm font-semibold text-slate-300 shadow-sm border border-slate-700/50 shadow-black/50">
                            Dealer <span class="text-indigo-400 font-bold ml-1">{game.dealerScore > 0 ? game.dealerScore : ''}</span>
                        </div>
                        
                        <div class="flex gap-2">
                            {#if game.dealerHand.length === 0}
                                <!-- Card placeholders -->
                                <div class="w-20 h-28 rounded-lg border-2 border-dashed border-slate-600/50 bg-slate-800/30"></div>
                                <div class="w-20 h-28 rounded-lg border-2 border-dashed border-slate-600/50 bg-slate-800/30"></div>
                            {:else}
                                {#each game.dealerHand as card}
                                    <div class="w-20 h-28 bg-white rounded-lg shadow-xl flex flex-col items-center justify-center select-none transform transition-transform hover:-translate-y-2 relative border border-slate-200">
                                         {#if (card as any).hidden}
                                            <div class="absolute inset-1 rounded-md bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,#334155_5px,#334155_10px)] bg-slate-800 border-2 border-white/10"></div>
                                         {:else}
                                            <span class={`text-3xl ${getSuitColor(card.suit)}`}>{getSuitSymbol(card.suit)}</span>
                                            <span class={`text-xl font-bold mt-1 ${getSuitColor(card.suit)}`}>{card.rank}</span>
                                         {/if}
                                    </div>
                                {/each}
                            {/if}
                        </div>
                    </div>
				{/if}
			</div>

			<!-- ─── Player Areas (Other players) ─── -->
             {#if opponent && opponent.id !== 'waiting'}
				<div class="absolute top-20 left-6 flex flex-col items-start scale-75 origin-top-left opacity-80">
					<div class="flex items-center gap-3 mb-2 px-4 py-2 bg-slate-800/80 rounded-full shadow-md border border-slate-700/50">
						<div class="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-sm font-bold shadow-inner">👤</div>
						<div>
							<div class="font-bold text-slate-200 leading-tight">{opponent.name}</div>
							<div class="text-xs text-emerald-400 font-semibold tracking-wide">£{opponent.chips} <span class="text-slate-500 ml-1">Bet: £{opponent.currentBet}</span></div>
						</div>
					</div>
					
					<div class="flex gap-[-20px] ml-4">
						{#each opponent.hand as card, i}
							<div class="w-16 h-24 bg-white rounded-md shadow-lg flex flex-col items-center justify-center border border-slate-200" style={`z-index: ${i}; transform: translateX(-${i * 15}px) rotate(${i * 5 - 5}deg);`}>
								<span class={`text-2xl ${getSuitColor(card.suit)}`}>{getSuitSymbol(card.suit)}</span>
								<span class={`text-lg font-bold mt-1 ${getSuitColor(card.suit)}`}>{card.rank}</span>
							</div>
						{/each}
					</div>
                    <div class="mt-1 ml-4 px-2 py-0.5 bg-slate-800/80 rounded-full text-xs font-semibold text-slate-300 shadow-sm border border-slate-700/50">
                        Score: {opponent.score}
                    </div>
				</div>
			{/if}

			<!-- ─── My Area ─── -->
			{#if me}
				<div class="bg-gradient-to-t from-slate-900 via-slate-800 to-transparent p-6 pb-8 relative z-20">
                    
                     {#if game.phase === 'complete'}
                        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-30 rounded-t-3xl border-t border-slate-700/50">
                            <h2 class="text-4xl font-black text-white mb-2 shadow-black drop-shadow-lg tracking-wide uppercase italic">
                                {#if game.winnerIds.includes(me.id)}
                                    <span class="text-emerald-400">You Win!</span>
                                {:else if game.pushIds.includes(me.id)}
                                    <span class="text-yellow-400">Push</span>
                                {:else if game.loserIds.includes(me.id)}
                                    <span class="text-red-400">Dealer Wins</span>
                                {:else}
                                    <span class="text-slate-400">Hand Complete</span>
                                {/if}
                            </h2>
                            <p class="text-xl text-slate-300 font-medium mb-8 bg-slate-800/80 px-4 py-2 rounded-lg border border-slate-700">
                                {#if me.status === 'blackjack'}
                                    Blackjack!
                                {:else if me.status === 'busted'}
                                    Busted
                                {:else}
                                    Score: {me.score}
                                {/if}
                            </p>
                            <button onclick={nextHand} class="px-8 py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold rounded-xl shadow-xl hover:shadow-emerald-500/25 transition-all text-xl transform hover:-translate-y-1 active:translate-y-0">
                                Next Hand
                            </button>
                        </div>
                    {/if}

					<div class="max-w-3xl mx-auto flex flex-col md:flex-row justify-between items-end gap-6 relative z-10">
						<!-- Player Info -->
						<div class="flex items-center gap-4 bg-slate-800/90 p-3 rounded-2xl shadow-xl border border-slate-700/50 backdrop-blur-md">
							<div class="w-14 h-14 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-2xl font-bold shadow-inner border border-slate-500/50">
								👤
							</div>
							<div>
								<div class="font-extrabold text-xl text-white tracking-wide">{me.name}</div>
								<div class="text-sm text-emerald-400 font-semibold tracking-wide flex items-center gap-1">
                                    <span class="text-emerald-500">💰</span> £{me.chips}
                                </div>
							</div>
						</div>

						<!-- My Cards -->
						<div class="flex-1 flex flex-col items-center">
                            <div class="mb-2 px-3 py-1 bg-slate-800/80 rounded-full text-sm font-semibold text-slate-300 shadow-sm border border-slate-700/50 shadow-black/50">
                                Score <span class="text-emerald-400 font-bold ml-1">{me.score > 0 ? me.score : ''}</span>
                            </div>
							<div class="flex gap-2 min-h-[120px]">
								{#if me.hand.length === 0}
                                    <div class="w-20 h-28 rounded-lg border-2 border-dashed border-slate-500/30"></div>
                                    <div class="w-20 h-28 rounded-lg border-2 border-dashed border-slate-500/30"></div>
                                {:else}
                                    {#each me.hand as card}
                                        <div class="w-20 h-28 bg-white rounded-lg shadow-2xl flex flex-col items-center justify-center transform hover:-translate-y-3 transition-transform duration-300 relative border-2 border-slate-200">
                                            <span class={`text-3xl ${getSuitColor(card.suit)}`}>{getSuitSymbol(card.suit)}</span>
                                            <span class={`text-xl font-bold mt-1 ${getSuitColor(card.suit)}`}>{card.rank}</span>
                                        </div>
                                    {/each}
                                {/if}
							</div>
						</div>

						<!-- Actions panel -->
						<div class="bg-slate-800/90 p-4 rounded-2xl shadow-xl border border-slate-700/50 backdrop-blur-md min-w-[280px]">
							
                            {#if game.phase === 'betting' && me.status === 'betting'}
                                <div class="mb-4">
                                    <div class="flex justify-between text-sm text-slate-400 mb-2 font-medium">
                                        <span>Place Bet</span>
                                        <span class="text-emerald-400 font-bold">£{betAmount}</span>
                                    </div>
                                    <input type="range" min="0" max={Math.min(me.chips, 500)} step="10" bind:value={betAmount} class="w-full accent-emerald-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer">
                                </div>
                                <button onclick={() => doAction('bet', betAmount)} disabled={me.chips < betAmount} class="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-emerald-500/25">
                                    {betAmount === 0 ? 'Skip Hand' : 'Place Bet'}
                                </button>
                            {:else if game.phase === 'betting'}
                                <div class="text-center py-4 text-slate-400 font-medium animate-pulse">
                                    Waiting for opponent to bet...
                                </div>
                            {:else if game.phase === 'playing' && me.status === 'playing'}
                                <div class="grid grid-cols-2 gap-3 mb-3">
                                    <button onclick={() => doAction('hit')} class="py-3 bg-slate-700/80 hover:bg-slate-600 text-white font-bold rounded-xl transition-all border border-slate-600 shadow-md">
                                        Hit
                                    </button>
                                    <button onclick={() => doAction('stand')} class="py-3 bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-md">
                                        Stand
                                    </button>
                                </div>
                                <button onclick={() => doAction('double')} disabled={me.chips < me.currentBet || me.hand.length > 2} class="w-full py-2 bg-indigo-600/90 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-md text-sm">
                                    Double Down (£{me.currentBet})
                                </button>
                            {:else if me.status === 'busted' || me.status === 'stood' || me.status === 'blackjack'}
                                <div class="text-center py-4 text-slate-400 flex flex-col items-center">
                                    <span class="font-bold text-lg mb-1">{me.status.charAt(0).toUpperCase() + me.status.slice(1)}</span>
                                    {#if game.phase === 'playing'}
                                        <span class="text-sm animate-pulse">Waiting for opponent...</span>
                                    {/if}
                                </div>
                            {:else}
                                 <div class="text-center py-4 text-slate-400 font-medium">
                                    Waiting...
                                </div>
                            {/if}

                            <div class="mt-4 pt-3 border-t border-slate-700/50 flex justify-between text-xs text-slate-400 font-medium uppercase tracking-wider">
                                <span>Pot</span>
                                <span class="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">£{me.currentBet + (opponent ? opponent.currentBet : 0)}</span>
                            </div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
