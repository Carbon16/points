<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { auth, getAuthHeaders } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import type { GameState } from '$lib/types';

	let game = $state<GameState | null>(null);
	let loading = $state(true);
	let error = $state('');
	let betAmount = $state(5);
	let isDragging = $state(false);
	
	const minBet = 5;
	const maxBet = $derived(getMyPlayer(game)?.chips || 100);
	const thumbPosition = $derived(((betAmount - minBet) / (maxBet - minBet)) * 100);
	
	let gameOverInfo = $state<{ winner?: string; loser?: string } | null>(null);
	let pendingAction = $state<{ type: string; data?: any } | null>(null);
	let pollInterval: ReturnType<typeof setInterval>;

	onMount(async () => {
		if (!$auth.token) { goto('/login'); return; }
		await loadGame();
		pollInterval = setInterval(loadGame, 1000);
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
	import { bestHand, getRankValue } from '$lib/poker/hand';
	
	let playForPoints = $state(true);

	async function doAction(action: string, data?: any) {
		error = '';

		// Special case: Create game doesn't need signing (it creates the context)
		if (action === 'create') {
			try {
				const res = await fetch('/api/game', {
					method: 'POST',
					headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
					body: JSON.stringify({ action, ...data })
				});
				const dataRes = await res.json();
				if (!dataRes.success) { error = dataRes.error; return; }
				if (dataRes.data?.game) game = dataRes.data.game;
				else game = dataRes.data;
				loadGame(); // Refresh immediately after creation
			} catch {
				error = 'Connection failed';
			}
			return;
		}

		if (!game) return;

		// If data is number, treat as amount (backward compat/betting)
		const payloadData = typeof data === 'number' ? { amount: data } : data;
		
		// 1. Construct Secure Payload for Non-Repudiation
		const timestamp = Date.now();
		const securePayload = {
			gameId: game.id,
			handNumber: game.handNumber,
			userId: $auth.userId,
			action,
			amount: payloadData?.amount,
			timestamp
		};

		// 2. Sign the Payload
		let signature = '';
		try {
			const pk = await GetPrivateKey();
			if (!pk) throw new Error('Private key missing');
			signature = await signData(pk, JSON.stringify(securePayload));
		} catch (e) {
			error = 'Security Error: Could not sign action. Please verify your identity (re-login).';
			return;
		}

		try {
			const res = await fetch('/api/game', {
				method: 'POST',
				headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
				body: JSON.stringify({ 
					action, 
					...payloadData,
					security: {
						payload: JSON.stringify(securePayload),
						signature
					}
				})
			});
			const dataRes = await res.json(); // rename to avoid collision
			if (!dataRes.success) { error = dataRes.error; return; }

			if (dataRes.data?.gameOver) {
				const finalGame = game || dataRes.data.game;
				const winnerId = dataRes.data.winner;
				if (finalGame && finalGame.playForPoints !== false) {
					saveHandHistory(finalGame, winnerId);
				}
				gameOverInfo = { winner: dataRes.data.winner, loser: dataRes.data.loser };
				game = null;
			} else if (dataRes.data?.game) {
				game = dataRes.data.game;
			} else {
				game = dataRes.data;
			}
			loadGame(); // Refresh state immediately after action
		} catch {
			error = 'Connection failed';
		}
	}

	function handleAction(action: string, data?: any) {
		if (action === 'fold' || action === 'all-in') {
			pendingAction = { type: action, data };
			return;
		}
		doAction(action, data);
	}

	function confirmPendingAction() {
		if (pendingAction) {
			doAction(pendingAction.type, pendingAction.data);
			pendingAction = null;
		}
	}

	function cancelPendingAction() {
		pendingAction = null;
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
		const player = game?.players.find(p => p.id === id);
		if (player) return player.name;
		if (id === 'player1') return 'Player 1';
		if (id === 'player2') return 'Player 2';
		return id || 'Unknown';
	}

	function getSuitSymbol(suit: string) {
		const symbols: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
		return symbols[suit] || suit;
	}

	function isRed(suit: string) {
		return suit === 'hearts' || suit === 'diamonds';
	}

	function getMyPlayer(g: GameState | null) {
		if (!g) return null;
		return g.players.find(p => p.id === $auth.userId);
	}

	function getOpponent(g: GameState | null) {
		if (!g) return null;
		return g.players.find(p => p.id !== $auth.userId);
	}

	function isMyTurn(g: GameState | null) {
		if (!g) return false;
		return g.players[g.currentPlayerIndex]?.id === $auth.userId;
	}

	function canCheck(g: GameState | null) {
		if (!g) return false;
		const me = getMyPlayer(g);
		const op = getOpponent(g);
		return me && op && (me.currentBet || 0) >= (op.currentBet || 0);
	}

	function canCall(g: GameState | null) {
		if (!g) return false;
		const me = getMyPlayer(g);
		const op = getOpponent(g);
		return me && op && (me.currentBet || 0) < (op.currentBet || 0);
	}

	function isHighlighted(card: any) {
		if (!game?.winningCards) return false;
		return game.winningCards.some(wc => wc.rank === card.rank && wc.suit === card.suit);
	}

	let currentBestHand = $state<any[]>([]);
	
	$effect(() => {
		if (!game) {
			currentBestHand = [];
			return;
		}
		const me = getMyPlayer(game);
		if (!me || me.hand.length === 0) {
			currentBestHand = [];
			return;
		}
		const allCards = [...me.hand, ...game.communityCards];
		if (allCards.length > 0) {
			const res = bestHand(allCards);
			
			if (res.rank === 'high-card') {
				// Special Case: User requests to highlight THEIR highest card, not the board's high card
				if (me.hand.length > 0) {
					// Find highest card in *my* hand
					const sortedHand = [...me.hand].sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
					currentBestHand = [sortedHand[0]];
				} else {
					currentBestHand = [];
				}
			} else {
				// Use coreCards if available (for precise highlighting), otherwise fallback to cards
				currentBestHand = res.coreCards || res.cards || [];
			}
		} else {
			currentBestHand = [];
		}
	});

	function isSuggestion(card: any) {
		// Only show suggestion if there is NO winner yet
		if (game?.winner) return false;
		return currentBestHand.some(c => c.rank === card.rank && c.suit === card.suit);
	}

	import { fly, scale, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
</script>

<div class="poker-page animate-in">
	<div class="page-header">
		<button class="btn btn-ghost icon-btn" onclick={() => goto('/profile')} aria-label="Profile">
			<ion-icon name="person-circle-outline"></ion-icon>
		</button>
		<h1><ion-icon name="card-outline"></ion-icon> Poker</h1>
		{#if game && !game.playForPoints}
			<span class="badge practice-badge">Practice Mode</span>
		{/if}
		<div style="width: 40px;"></div> <!-- Spacer -->
	</div>

	{#if loading}
		<p class="loading-text loading">Loading...</p>
	{:else if gameOverInfo}
		<!-- Game Over Screen -->
		<div class="game-over card card-glow" in:scale>
			<div class="game-over-icon" in:fly={{ y: 20, duration: 800 }}>
				<ion-icon name="trophy-outline"></ion-icon>
			</div>
			<h2>{getName(gameOverInfo.winner)} Wins!</h2>
			<p>{getName(gameOverInfo.loser)} went bankrupt</p>
			{#if game?.playForPoints !== false}
				<p class="game-over-sub">Point recorded on the blockchain</p>
			{:else}
				<p class="game-over-sub">Practice game - no points recorded</p>
			{/if}
			<button class="btn btn-primary" onclick={() => { gameOverInfo = null; loadGame(); }}>
				Back to Lobby
			</button>
		</div>
	{:else if !game}
		<!-- No active game -->
		<div class="lobby card" in:fade>
			<p class="lobby-text">No game in progress</p>
			
			<div class="lobby-controls">
				<label class="toggle-label">
					<input type="checkbox" bind:checked={playForPoints} />
					<span class="toggle-text">Play for Points</span>
				</label>
			</div>

			<button class="btn btn-primary" onclick={() => doAction('create', { playForPoints })}>
				Start New Game
			</button>
		</div>
	{:else if game.phase === 'waiting'}
		<!-- Waiting Room -->
		<div class="lobby card" in:fade>
			<h2>Waiting for Players...</h2>
			<div class="waiting-list">
				{#each game.players as p}
					<div class="player-slot">
						<ion-icon name="person-circle-outline"></ion-icon>
						<span>{p.name} {p.id === $auth.userId ? '(You)' : ''}</span>
					</div>
				{/each}
			</div>
			
			{#if !getMyPlayer(game)}
				<button class="btn btn-primary" onclick={() => doAction('join')}>
					Join Game
				</button>
			{:else if game.players.some(p => p.id === 'waiting')}
				<p class="waiting-text" style="color: var(--text-muted); padding: 10px;">Waiting for opponent to join...</p>
				<button class="btn btn-primary" disabled style="opacity: 0.5; cursor: not-allowed;">
					Deal Cards
				</button>
			{:else}
				<button class="btn btn-primary" onclick={() => doAction('start')}>
					Deal Cards
				</button>
			{/if}
		</div>
	{:else}
		<!-- Active Game -->
		<div class="game-board">
			<!-- Opponent -->
			<div class="player-zone opponent-zone">
				<div class="player-info">
					<span class="player-name">{getOpponent(game)?.name || 'Opponent'}</span>
					<span class="chip-count">
						<ion-icon name="cash-outline"></ion-icon> {getOpponent(game)?.chips}
						{#if (getOpponent(game)?.currentBet || 0) > 0}
							<span class="bet-indicator">Bet: {getOpponent(game)?.currentBet}</span>
						{/if}
					</span>
					{#if getOpponent(game)?.isDealer}<span class="dealer-badge" in:scale>D</span>{/if}
				</div>
				<div class="hand-area">
					{#if getOpponent(game)?.hand && getOpponent(game)!.hand.length > 0}
						{#each getOpponent(game)!.hand as card (card.rank + card.suit)}
							<div class="playing-card" class:red={isRed(card.suit)} 
								class:highlighted={isHighlighted(card)}
								class:suggestion={isSuggestion(card)}
								class:dimmed={game.winner && !isHighlighted(card)}
								transition:fly|local={{ y: -50, duration: 400 }}>
								<span class="card-rank">{card.rank}</span>
								<span class="card-suit">{getSuitSymbol(card.suit)}</span>
							</div>
						{/each}
					{:else}
						<div class="playing-card card-back" in:fly={{ y: -50, duration: 400, delay: 0 }}>
							<div class="pattern"></div>
						</div>
						<div class="playing-card card-back" in:fly={{ y: -50, duration: 400, delay: 100 }}>
							<div class="pattern"></div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Community + Pot -->
			<div class="table-center">
				<div class="community-zone">
					<div class="community-cards">
						{#each game.communityCards as card (card.rank + card.suit)}
							<div class="playing-card community" class:red={isRed(card.suit)} 
								class:highlighted={isHighlighted(card)}
								class:suggestion={isSuggestion(card)}
								class:dimmed={game.winner && !isHighlighted(card)}
								in:scale={{ duration: 400, easing: cubicOut }}>
								<span class="card-rank">{card.rank}</span>
								<span class="card-suit">{getSuitSymbol(card.suit)}</span>
							</div>
						{/each}
						{#each Array(5 - game.communityCards.length) as _, i}
							<div class="playing-card community empty"></div>
						{/each}
					</div>
					<div class="pot-display">
						<span class="pot-label">POT</span>
						{#key game.pot}
							<span class="pot-value" in:scale>{game.pot}</span>
						{/key}
					</div>
				</div>
			</div>

			<!-- My hand -->
			<div class="player-zone my-zone">
				<div class="hand-area">
					{#if getMyPlayer(game)?.hand}
						{#each getMyPlayer(game)!.hand as card, i (card.rank + card.suit)}
							<div class="playing-card my-card" class:red={isRed(card.suit)} 
								class:highlighted={isHighlighted(card)}
								class:suggestion={isSuggestion(card)}
								class:dimmed={game.winner && !isHighlighted(card)}
								in:fly={{ y: 100, duration: 500, delay: i * 150, easing: cubicOut }}>
								<span class="card-top">{card.rank}{getSuitSymbol(card.suit)}</span>
								<div class="card-center">{getSuitSymbol(card.suit)}</div>
							</div>
						{/each}
					{/if}
				</div>
				<div class="player-info">
					<span class="player-name">{getMyPlayer(game)?.name || 'You'}</span>
					<span class="chip-count">
						<ion-icon name="cash-outline"></ion-icon> {getMyPlayer(game)?.chips}
						{#if (getMyPlayer(game)?.currentBet || 0) > 0}
							<span class="bet-indicator">Bet: {getMyPlayer(game)?.currentBet}</span>
						{/if}
					</span>
					{#if getMyPlayer(game)?.isDealer}<span class="dealer-badge" in:scale>D</span>{/if}
				</div>
			</div>

			<!-- Actions -->
			{#if game.phase === 'betting' && isMyTurn(game)}
				<div class="actions-bar" in:fly={{ y: 20, duration: 300 }}>
					<div class="main-actions">
						{#if canCheck(game)}
							<button class="btn btn-primary big-check" onclick={() => doAction('check')}>Check</button>
						{:else if canCall(game)}
							<button class="btn btn-primary big-check" onclick={() => doAction('call')}>
								Call { (getOpponent(game)?.currentBet || 0) - (getMyPlayer(game)?.currentBet || 0) }
							</button>
						{/if}

						<div class="bet-section">
							<button class="btn btn-primary bet-btn-small" onclick={() => doAction('bet', betAmount)}>
								Bet {betAmount}
							</button>
							<div class="slider-container">
								<input 
									type="range" 
									min={minBet} 
									max={maxBet} 
									step="5" 
									bind:value={betAmount}
									class="big-slider"
								/>
								<div class="slider-labels">
									<span>{minBet}</span>
									<span>{maxBet}</span>
								</div>
							</div>
						</div>
					</div>

					<div class="secondary-actions">
						<button class="btn btn-danger ghost sm" onclick={() => handleAction('fold')}>Fold</button>
						<button class="btn btn-warning ghost sm" onclick={() => handleAction('all-in')}>ALL IN</button>
					</div>
				</div>
			{:else if game.phase === 'betting'}
				<div class="waiting-bar" in:fade>
					<div class="spinner"></div>
					<p class="waiting-text">Opponent thinking...</p>
				</div>
			{:else if game.phase === 'showdown'}
				<div class="showdown-bar" in:scale>
					<div class="showdown-content">
						<p class="showdown-text" in:fly={{ y: -20, delay: 200 }}>
							{#if game.winner}
								{getName(game.winner)} wins!
							{:else}
								Split pot!
							{/if}
						</p>
						{#if game.winReason}
							<p class="win-reason" in:fly={{ y: -20, delay: 400 }}>{game.winReason}</p>
						{/if}
					</div>
					<button class="btn btn-primary" in:fly={{ y: 20, delay: 800 }} onclick={() => doAction('next-hand')}>
						Next Hand →
					</button>
				</div>
			{/if}

			{#if pendingAction}
				<div class="confirmation-overlay" in:fade>
					<div class="confirmation-dialog card card-glow" in:scale>
						<h3>Confirm {pendingAction.type === 'fold' ? 'Fold' : 'ALL IN'}?</h3>
						<p>Are you sure you want to {pendingAction.type}?</p>
						<div class="confirm-actions">
							<button class="btn btn-primary" onclick={confirmPendingAction}>Yes, {pendingAction.type}</button>
							<button class="btn btn-ghost" onclick={cancelPendingAction}>Go Back</button>
						</div>
					</div>
				</div>
			{/if}
			
			{#if error}
				<div class="toast error" transition:fly={{ y: 50 }}>{error}</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.poker-page {
		display: flex;
		flex-direction: column;
		gap: 16px;
		height: 100%;
	}
	h1 { font-size: 1.3rem; font-weight: 800; text-align: center; opacity: 0.5; display: flex; align-items: center; justify-content: center; gap: 8px;}
	.practice-badge { font-size: 0.6rem; background: var(--bg-secondary); color: var(--text-muted); padding: 4px 8px; border-radius: 4px; }

	.lobby, .game-over {
		text-align: center;
		padding: 40px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20px;
	}

	.game-board {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 600px; /* Adjust based on your card sizes */
		justify-content: space-between; /* This pushes top to top, bottom to bottom */
		position: relative;
	}

	/* ... (existing styles) */

	/* New Styles for Toggle and Waiting */
	.lobby-controls {
		margin-bottom: 20px;
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
	.toggle-text { font-weight: 600; }
	
	.waiting-list {
		display: flex;
		gap: 20px;
		margin: 20px 0;
	}
	.player-slot {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		font-size: 0.9rem;
		color: var(--text-muted);
	}
	.player-slot ion-icon { font-size: 2rem; }

	.player-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		z-index: 2;
	}
	.opponent-zone { margin-bottom: 20px; }
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
	.player-name { font-weight: 700; font-size: 0.8rem; color: white; }
	.chip-count { font-family: 'Geist Mono', monospace; color: #ffd700; font-weight: 700; display: flex; gap: 8px; align-items: center; }
	.bet-indicator { font-size: 0.7rem; color: #aaa; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; }

	.hand-area { display: flex; gap: 4px; justify-content: center; height: 90px; }

	.playing-card {
		width: 56px;
		height: 80px;
		background: rgba(255,255,255,0.05); /* Very slight tint for glass */
		border: 2px solid rgba(255,255,255,0.4);
		backdrop-filter: blur(4px);
		border-radius: 6px;
		box-shadow: 0 4px 10px rgba(0,0,0,0.3);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		position: relative;
		font-family: 'Geist Mono', monospace;
		font-weight: 700;
	}
	.playing-card .card-rank, .playing-card .card-suit, .playing-card .card-top, .playing-card .card-center {
		color: white; /* Default white text */
		filter: drop-shadow(0 0 2px rgba(0,0,0,0.8)); /* Readability */
	}
	.playing-card.red .card-rank, .playing-card.red .card-suit, .playing-card.red .card-top, .playing-card.red .card-center { 
		color: #ff5555; /* Bright Red */
	}
	
	.playing-card.highlighted {
		border-color: #ffd700;
		box-shadow: 0 0 20px rgba(255, 215, 0, 0.6), inset 0 0 10px rgba(255, 215, 0, 0.3);
		transform: translateY(-5px) scale(1.05);
		z-index: 10;
		background: rgba(255, 215, 0, 0.1);
		animation: cardPulse 2s infinite ease-in-out;
	}
	.playing-card.suggestion {
		border-color: #00d2ff;
		box-shadow: 0 0 15px rgba(0, 210, 255, 0.4), inset 0 0 5px rgba(0, 210, 255, 0.2);
		transform: translateY(-2px);
	}
	.playing-card.dimmed {
		opacity: 0.5;
		filter: grayscale(0.5);
		transform: scale(0.95);
	}
	.game-over-icon {
		font-size: 4rem;
		color: var(--gold);
		filter: drop-shadow(0 0 15px rgba(255, 215, 0, 0.4));
	}
	@keyframes cardPulse {
		0% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.6); }
		50% { box-shadow: 0 0 35px rgba(255, 215, 0, 0.8); }
		100% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.6); }
	}
	
	.card-back {
		background: #b22222;
		border: 2px solid white;
		background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.1) 0px, rgba(255,255,255,0.1) 10px, transparent 10px, transparent 20px);
	}

	.my-card {
		width: 70px;
		height: 100px;
		border: 2px solid rgba(255,255,255,0.6);
	}
	.my-card .card-top { position: absolute; top: 4px; left: 4px; font-size: 0.9rem; line-height: 1; }
	.my-card .card-center { font-size: 2rem; }

	.table-center {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		margin: auto 0; /* This keeps the table perfectly centered between players */
		z-index: 1;
	}
	
	.community-cards { display: flex; gap: 8px; }
	.playing-card.community { width: 50px; height: 72px; font-size: 0.8rem; }
	.playing-card.empty { background: rgba(0,0,0,0.2); box-shadow: none; border: 2px dashed rgba(255,255,255,0.1); }

	.pot-display {
		background: rgba(0,0,0,0.6);
		padding: 8px 24px;
		border-radius: 30px;
		border: 1px solid rgba(255,215,0,0.5);
		text-align: center;
	}
	.pot-label { display: block; font-size: 0.6rem; color: #ccc; letter-spacing: 2px; }
	.pot-value { font-size: 1.4rem; color: #ffd700; font-weight: 800; text-shadow: 0 0 10px rgba(255,215,0,0.3); }

	.actions-bar {
		position: sticky;
		bottom: 16px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 12px;
		background: rgba(0,0,0,0.95);
		border-radius: 20px;
		backdrop-filter: blur(20px);
		z-index: 100;
		border: 1px solid rgba(255,255,255,0.15);
		width: 95%;
		max-width: 500px;
		box-shadow: 0 -10px 40px rgba(0,0,0,0.6);
	}

	.main-actions {
		display: flex;
		gap: 12px;
		align-items: stretch;
	}

	.big-check {
		flex: 1;
		font-weight: 900;
		font-size: 1.2rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		background: linear-gradient(135deg, var(--accent), var(--accent-light));
		border: none;
		min-height: 80px;
		box-shadow: 0 4px 15px rgba(124, 58, 237, 0.4);
	}

	.bet-section {
		flex: 2;
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: rgba(255,255,255,0.05);
		padding: 8px;
		border-radius: 12px;
	}

	.bet-btn-small {
		height: 36px;
		font-size: 0.8rem;
		font-weight: 700;
		padding: 0 12px;
	}

	.slider-container {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.big-slider {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 8px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		outline: none;
		margin: 8px 0;
	}

	.big-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 24px;
		height: 24px;
		background: white;
		cursor: pointer;
		border-radius: 50%;
		border: 3px solid var(--accent);
		box-shadow: 0 0 10px rgba(124, 58, 237, 0.5);
		transition: transform 0.1s;
	}

	.big-slider::-webkit-slider-thumb:active {
		transform: scale(1.2);
	}

	.slider-labels {
		display: flex;
		justify-content: space-between;
		font-size: 0.6rem;
		color: var(--text-muted);
		font-family: var(--font-mono);
		opacity: 0.7;
	}

	.secondary-actions {
		display: flex;
		gap: 8px;
	}

	.btn.sm {
		flex: 1;
		height: 36px;
		font-size: 0.75rem;
		font-weight: 700;
	}

	.showdown-bar {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 24px;
		padding: 32px;
		background: rgba(0,0,0,0.9);
		border-radius: 16px;
		border: 1px solid rgba(255,255,255,0.1);
		backdrop-filter: blur(10px);
	}

	.showdown-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}

	.showdown-text {
		font-size: 1.5rem;
		font-weight: 800;
		color: #ffd700;
		text-shadow: 0 0 20px rgba(255,215,0,0.5);
		margin: 0;
	}

	.win-reason {
		font-size: 1rem;
		color: #aaa;
		margin: 0;
		font-style: italic;
	}

	.waiting-bar {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 20px;
	}

	.waiting-text {
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.toast {
		position: absolute;
		bottom: 20px; left: 50%; transform: translateX(-50%);
		background: #ef4444; color: white;
		padding: 10px 20px;
		border-radius: 30px;
		box-shadow: 0 10px 30px rgba(0,0,0,0.5);
		font-weight: 600;
	}

	.confirmation-overlay {
		position: absolute;
		top: 0; left: 0; right: 0; bottom: 0;
		background: rgba(0,0,0,0.8);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
	}

	.confirmation-dialog {
		padding: 24px;
		text-align: center;
		width: 90%;
		max-width: 300px;
	}

	.confirmation-dialog h3 {
		margin: 0 0 8px;
		color: #fff;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.confirmation-dialog p {
		color: var(--text-muted);
		margin-bottom: 24px;
	}

	.confirm-actions {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.confirm-actions .btn-primary {
		background: #ef4444; /* Force red for fold confirm */
	}

	.spinner {
		width: 20px; height: 20px;
		border: 2px solid rgba(255,255,255,0.1);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 8px;
	}
	@keyframes spin { 100% { transform: rotate(360deg); } }
</style>
