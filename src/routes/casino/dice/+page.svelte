
<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { auth } from '$lib/stores/auth';
    import { goto } from '$app/navigation';
    import type { DiceGameState, DiceFace, Stakes } from '$lib/dice/game';

    let game = $state<DiceGameState | null>(null);
    let pollingInterval: any;
    
    // Form Inputs
    let bidQuantity = $state(1);
    let bidFace = $state<DiceFace>(1);
    let raiseAmount = $state(10);
    let selectedStakes = $state<Stakes>('full');

    async function loadGame() {
        if (!game?.id) {
            // Check for existing/waiting games
            const res = await fetch('/api/dice');
            const waitingGames = await res.json();
            if (waitingGames.length > 0) {
                 // Auto-join first waiting game? Or specific UI?
                 // For simplicity, let's just show a "Join Game" button if not in one.
            }
        } else {
             const res = await fetch(`/api/dice?id=${game.id}`);
             game = await res.json();
        }
    }

    async function createGame() {
        const res = await fetch('/api/dice', {
            method: 'POST',
            body: JSON.stringify({ action: 'create', payload: { stakes: selectedStakes } })
        });
        const data = await res.json();
        if (data.success) {
            game = data.game;
            startPolling();
        }
    }

    async function joinGame(gameId: string) {
        const res = await fetch('/api/dice', {
            method: 'POST',
            body: JSON.stringify({ action: 'join', gameId })
        });
        const data = await res.json();
        if (data.success) {
            game = data.game;
            startPolling();
        }
    }

    async function submitBid() {
        if (!game) return;
        const res = await fetch('/api/dice', {
            method: 'POST',
            body: JSON.stringify({ 
                action: 'bid', 
                gameId: game.id, 
                payload: { quantity: bidQuantity, face: bidFace, raiseAmount } 
            })
        });
        const data = await res.json();
        if (data.success) game = data.game;
        else alert(data.error);
    }

    async function challenge() {
       if (!game) return;
        const res = await fetch('/api/dice', {
            method: 'POST',
            body: JSON.stringify({ 
                action: 'challenge', 
                gameId: game.id 
            })
        });
        const data = await res.json();
        if (data.success) game = data.game;
        else alert(data.error); 
    }

    function startPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(async () => {
            if (game?.id) {
                const res = await fetch(`/api/dice?id=${game.id}`);
                const updated = await res.json();
                // Simple update
                if (updated && updated.id) game = updated;
            }
        }, 1000);
    }
    
    onDestroy(() => {
        if (pollingInterval) clearInterval(pollingInterval);
    });

    // Helper for Dice Icons
    function getDiceIcon(face: number) {
        return ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][face - 1] || '?';
    }
</script>

<div class="dice-container">
    {#if !game}
        <div class="lobby">
            <h1>Liar's Dice</h1>
            
            <div class="control-group">
                <label for="stakes-select">Stakes:</label>
                <select id="stakes-select" bind:value={selectedStakes}>
                    <option value="full">Full Point (1.0)</option>
                    <option value="half">Half Point (0.5)</option>
                    <option value="none">Practice (No Points)</option>
                </select>
            </div>

            <button class="btn primary" onclick={createGame}>Create Game</button>
            
            <!-- List waiting games here ideally -->
             <div class="waiting-list">
                 <h3>Waiting Games</h3>
                 <!-- We'd fetch these on mount. For now, manual refresh needed or simplistic -->
             </div>
        </div>
    {:else}
        <!-- Game Interface -->
        <header class="game-header">
            <div class="pot">Pot: ${game.pot}</div>
            <div class="stakes">Stakes: {game.stakes}</div>
        </header>

        <!-- Opponent Area -->
        <div class="opponent-area">
            <div class="avatar">👤 Opponent</div>
            <div class="stats">Chips: {game.players.find(p => p.id !== $auth.userId)?.chips}</div>
            <div class="cup">
                {#each game.players.find(p => p.id !== $auth.userId)?.hand || [] as d}
                   <span class="die hidden">?</span>
                {/each}
            </div>
        </div>

        <!-- Table / Bid History -->
        <div class="table-area">
            <h3>Current Bid</h3>
            {#if game.currentBid}
                <div class="current-bid">
                    {game.currentBid.quantity} x <span class="die-icon">{getDiceIcon(game.currentBid.face)}</span>
                    <span class="bid-amt">(${game.currentBid.betAmount})</span>
                </div>
            {:else}
                <div class="waiting-text">Waiting for first bid...</div>
            {/if}
            
            {#if game.phase === 'complete'}
                <div class="game-over">
                     <h2>Game Over!</h2>
                     <p>{game.winReason}</p>
                     <p>Winner: {game?.players.find(p => p.id === game?.winner)?.name}</p>
                     <button class="btn" onclick={() => game = null}>Back to Lobby</button>
                </div>
            {/if}
        </div>

        <!-- Player Area -->
        <div class="player-area">
             <div class="avatar">👤 You</div>
             <div class="stats">Chips: {game.players.find(p => p.id === $auth.userId)?.chips}</div>
             <div class="cup">
                {#each game.players.find(p => p.id === $auth.userId)?.hand || [] as d}
                   <span class="die">{getDiceIcon(d)}</span>
                {/each}
            </div>
            
            <!-- Controls -->
            {#if game.players.find(p => p.id === $auth.userId)?.isTurn && game.phase !== 'complete'}
                <div class="controls">
                    <div class="bid-input">
                        Quantity: <input type="number" min="1" bind:value={bidQuantity} />
                        Face: <select bind:value={bidFace}>
                            <option value={1}>1</option>
                            <option value={2}>2</option>
                            <option value={3}>3</option>
                            <option value={4}>4</option>
                            <option value={5}>5</option>
                            <option value={6}>6</option>
                        </select>
                    </div>
                    
                    <div class="bet-input">
                        Raise: <input type="number" min="10" step="10" bind:value={raiseAmount} />
                    </div>

                    <div class="actions">
                        <button class="btn action" onclick={submitBid}>Bid</button>
                        {#if game.currentBid}
                            <button class="btn danger" onclick={challenge}>Liar!</button>
                        {/if}
                    </div>
                </div>
            {:else}
                <div class="waiting-text">Opponent's Turn...</div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .dice-container {
        padding: 20px;
        max-width: 600px;
        margin: 0 auto;
        color: white;
    }
    
    .lobby {
        text-align: center;
        margin-top: 50px;
    }
    
    .game-header {
        display: flex;
        justify-content: space-between;
        background: rgba(255,255,255,0.1);
        padding: 10px;
        border-radius: 8px;
        margin-bottom: 20px;
    }
    
    .cup {
        display: flex;
        gap: 10px;
        justify-content: center;
        margin: 10px 0;
    }
    
    .die {
        font-size: 2rem;
        background: #fff;
        color: #000;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    }
    
    .die.hidden {
        background: #444;
        color: #ccc;
    }

    .table-area {
        min-height: 150px;
        background: rgba(0,0,0,0.3);
        border-radius: 12px;
        padding: 20px;
        text-align: center;
        margin: 20px 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }
    
    .current-bid {
        font-size: 1.5rem;
        font-weight: bold;
    }

    .controls {
        background: rgba(255,255,255,0.05);
        padding: 15px;
        border-radius: 12px;
    }
    
    .bid-input, .bet-input {
        margin-bottom: 10px;
        display: flex;
        gap: 10px;
        justify-content: center;
        align-items: center;
    }
    
    input, select {
        background: rgba(0,0,0,0.5);
        border: 1px solid #555;
        color: white;
        padding: 5px;
        border-radius: 4px;
    }

    .btn {
        padding: 10px 20px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
        transition: all 0.2s;
    }
    
    .btn.primary { background: #6366f1; color: white; }
    .btn.action { background: #10b981; color: white; }
    .btn.danger { background: #ef4444; color: white; }
    
    .game-over {
        border-top: 1px solid rgba(255,255,255,0.2);
        margin-top: 20px;
        padding-top: 20px;
    }
</style>
