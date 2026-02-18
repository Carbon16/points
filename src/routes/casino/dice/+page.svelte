
<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { auth, getAuthHeaders } from '$lib/stores/auth';
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
        if (!$auth.token) return;
        const headers = getAuthHeaders($auth.token);
        
        if (!game?.id) {
            // Check for existing/waiting games
            const res = await fetch('/api/dice', { headers });
            const waitingGames = await res.json();
            if (waitingGames.length > 0) {
                 // Auto-join first waiting game? Or specific UI?
            }
        } else {
             const res = await fetch(`/api/dice?id=${game.id}`, { headers });
             game = await res.json();
        }
    }

    async function createGame() {
        if (!$auth.token) return;
        const res = await fetch('/api/dice', {
            method: 'POST',
            headers: { ...getAuthHeaders($auth.token), 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', payload: { stakes: selectedStakes } })
        });
        const data = await res.json();
        if (data.success) {
            game = data.game;
            startPolling();
        }
    }

    async function joinGame(gameId: string) {
        if (!$auth.token) return;
        const res = await fetch('/api/dice', {
            method: 'POST',
            headers: { ...getAuthHeaders($auth.token), 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'join', gameId })
        });
        const data = await res.json();
        if (data.success) {
            game = data.game;
            startPolling();
        }
    }

    async function submitBid() {
        if (!game || !$auth.token) return;
        const res = await fetch('/api/dice', {
            method: 'POST',
            headers: { ...getAuthHeaders($auth.token), 'Content-Type': 'application/json' },
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
       if (!game || !$auth.token) return;
        const res = await fetch('/api/dice', {
            method: 'POST',
            headers: { ...getAuthHeaders($auth.token), 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'challenge', 
                gameId: game.id 
            })
        });
        const data = await res.json();
        if (data.success) game = data.game;
        else alert(data.error); 
    }

    function cycleFace() {
        bidFace = (bidFace % 6) + 1 as DiceFace;
    }

    function incQty() {
        // Can't decrease below current bid unless face is higher? No, standard rule is:
        // Raise Qty OR Raise Face (same Qty).
        // UI should just allow any positive integer and validation handles it.
        // Or enforce min based on current bid to be helpful?
        // Let's just do simple +/- for now.
        bidQuantity++;
    }

    function decQty() {
        if (bidQuantity > 1) bidQuantity--;
    }

    function startPolling() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(async () => {
            if (game?.id && $auth.token) {
                const res = await fetch(`/api/dice?id=${game.id}`, { 
                    headers: getAuthHeaders($auth.token) 
                });
                const updated = await res.json();
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
            <h3>Current High Bid</h3>
            {#if game.currentBid}
                <div class="current-bid">
                    <span class="bid-qty">{game.currentBid.quantity}</span>
                    <span class="x-swords">×</span>
                    <span class="die-icon">{getDiceIcon(game.currentBid.face)}</span>
                    <span class="bid-amt">(${game.currentBid.betAmount})</span>
                </div>
            {:else}
                <div class="waiting-text">Waiting for opening bid...</div>
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
                    <div class="bid-row">
                        <div class="bid-group">
                            <label>Count</label>
                            <div class="stepper">
                                <button class="step-btn" onclick={decQty}>−</button>
                                <span class="step-value">{bidQuantity}</span>
                                <button class="step-btn" onclick={incQty}>+</button>
                            </div>
                        </div>
                        
                        <div class="bid-group">
                            <label>Face</label>
                            <button class="face-btn" onclick={cycleFace}>
                                {getDiceIcon(bidFace)}
                            </button>
                        </div>

                        <div class="bid-group grow">
                            <label>Raise Chips</label>
                            <div class="chip-input">
                                <span>$</span>
                                <input type="number" min="10" step="10" bind:value={raiseAmount} />
                            </div>
                        </div>
                    </div>

                    <div class="actions">
                        <button class="btn action" onclick={submitBid}>make bid</button>
                        {#if game.currentBid}
                            <button class="btn danger" onclick={challenge}>liar!</button>
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
    /* ... existing styles ... */
    /* Add new styles for controls */
    .bid-row {
        display: flex;
        gap: 20px;
        margin-bottom: 20px;
        align-items: flex-end;
    }
    
    .bid-group {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
    }
    .bid-group.grow { flex: 1;    align-items: stretch; }

    .bid-group label {
        font-size: 0.7rem;
        text-transform: uppercase;
        color: var(--text-secondary);
        letter-spacing: 0.1em;
    }

    .stepper {
        display: flex;
        align-items: center;
        background: rgba(255,255,255,0.1);
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.2);
    }

    .step-btn {
        background: transparent;
        border: none;
        color: white;
        width: 40px;
        height: 44px;
        font-size: 1.2rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .step-btn:hover { background: rgba(255,255,255,0.1); }
    
    .step-value {
        width: 40px;
        text-align: center;
        font-weight: 700;
        font-size: 1.2rem;
    }

    .face-btn {
        background: white;
        color: black;
        border: none;
        width: 50px;
        height: 50px;
        border-radius: 8px;
        font-size: 2.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        transition: transform 0.1s;
    }
    .face-btn:active { transform: scale(0.95); }

    .chip-input {
        display: flex;
        align-items: center;
        background: rgba(0,0,0,0.3);
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.2);
        padding: 0 10px;
    }
    .chip-input span { color: #ffd700; font-weight: bold; }
    .chip-input input {
        background: transparent;
        border: none;
        color: white;
        width: 100%;
        text-align: right;
        font-family: 'Geist Mono', monospace;
        font-size: 1.2rem;
        padding: 10px;
    }
    .chip-input input:focus { outline: none; background: transparent; }

    .x-swords { color: var(--text-muted); font-size: 1.2rem; margin: 0 5px; }
    .bid-qty { font-size: 2.5rem; color: white; }
    
    /* Ensure other styles remain or are imported/merged */
    /* Check previous CSS block to ensure validity */
    .dice-container {
        padding: 20px;
        max-width: 600px;
        margin: 0 auto;
        color: white;
        min-height: 100%;
        display: flex;
        flex-direction: column;
    }
    
    .lobby {
        text-align: center;
        margin-top: 50px;
        background: rgba(255, 255, 255, 0.05);
        padding: 40px;
        border-radius: 20px;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .lobby h1 {
        font-size: 2.5rem;
        margin-bottom: 30px;
        background: linear-gradient(135deg, #fff 0%, #a5b4fc 100%);
        -webkit-background-clip: text;
        background-clip: text; 
        -webkit-text-fill-color: transparent;
    }
    
    .control-group {
        margin-bottom: 30px;
    }

    .control-group label {
        display: block;
        margin-bottom: 10px;
        color: var(--text-secondary);
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    
    .game-header {
        display: flex;
        justify-content: space-between;
        background: linear-gradient(to right, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2));
        padding: 15px 20px;
        border-radius: 12px;
        margin-bottom: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .pot, .stakes {
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-size: 0.9rem;
    }
    
    .avatar {
        font-size: 0.85rem;
        color: var(--text-secondary);
        margin-bottom: 5px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .stats {
        font-size: 0.9rem;
        color: #fff;
        margin-bottom: 8px;
    }
    
    .cup {
        display: flex;
        gap: 8px;
        justify-content: center;
        margin: 15px 0;
        perspective: 1000px;
    }
    
    .die {
        font-size: 2rem;
        background: #fff;
        color: #000;
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    
    .die:not(.hidden):hover {
        transform: translateY(-5px);
    }
    
    .die.hidden {
        background: #333;
        color: #555;
        border: 1px solid #444;
        background-image: repeating-linear-gradient(
            45deg,
            transparent,
            transparent 5px,
            #3a3a3a 5px,
            #3a3a3a 10px
        );
    }

    .table-area {
        min-height: 180px;
        background: radial-gradient(circle at center, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%);
        border-radius: 20px;
        padding: 20px;
        text-align: center;
        margin: 20px 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        border: 1px solid rgba(255, 255, 255, 0.05);
        box-shadow: inset 0 0 20px rgba(0,0,0,0.2);
    }

    .table-area h3 {
        color: var(--text-secondary);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        margin-bottom: 15px;
    }
    
    .current-bid {
        font-size: 2rem;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
    }

    .die-icon {
        color: var(--accent);
        font-size: 2.5rem;
    }

    .bid-amt {
        font-size: 1rem;
        color: var(--text-muted);
        font-weight: normal;
        margin-left: 5px;
    }

    .controls {
        background: rgba(30, 30, 40, 0.95);
        padding: 20px;
        border-radius: 20px 20px 0 0;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        position: fixed;
        bottom: 80px; /* Above nav */
        left: 0;
        right: 0;
        max-width: 480px; /* Match app shell */
        margin: 0 auto;
        box-shadow: 0 -5px 20px rgba(0,0,0,0.3);
    }
    
    
    input, select {
        background: rgba(255,255,255,0.1);
        border: 1px solid rgba(255,255,255,0.2);
        color: white;
        padding: 10px 15px;
        border-radius: 8px;
        font-size: 1rem;
        outline: none;
        transition: all 0.2s;
    }

    input:focus, select:focus {
        border-color: var(--accent);
        background: rgba(255,255,255,0.15);
    }

    .actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 15px;
    }

    .btn {
        padding: 12px 20px;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        font-weight: 700;
        font-size: 1rem;
        transition: all 0.2s;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    
    .btn.primary { 
        background: var(--accent); 
        color: white; 
        box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
    }
    
    .btn.action { 
        background: #10b981; 
        color: white;
        box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
    }
    
    .btn.danger { 
        background: #ef4444; 
        color: white;
        box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3);
    }

    .btn:hover {
        transform: translateY(-2px);
        filter: brightness(1.1);
    }
    
    .btn:active {
        transform: translateY(0);
    }
    
    .game-over {
        border-top: 1px solid rgba(255,255,255,0.1);
        margin-top: 20px;
        padding-top: 20px;
        animation: fadeIn 0.5s ease;
    }

    .game-over h2 {
        color: #fbbf24;
        margin-bottom: 10px;
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>
