<script lang="ts">
    import { onMount } from 'svelte';
    import { auth, getAuthHeaders } from '$lib/stores/auth';
    import { fade, scale } from 'svelte/transition';
    import { signData, GetPrivateKey } from '$lib/crypto';

    interface ManifestConfig {
        min: number;
        max: number;
        replace?: boolean;
        cards: string[];
        icon: string;
        colour: string;
        font: string;
    }

    interface Card {
        id: string;
        type: string;
        card_content: string;
        metadata: {
            icon: string;
            colour: string;
            font: string;
        };
    }

    interface Draw {
        id: string;
        user_id: string;
        creator_name: string;
        drawn_at: number;
        expires_at: number;
        is_visible: boolean;
        completed_by: string[];
        metadata: any;
        cards: Card[];
    }

    interface CardRequest {
        id: string;
        requested_by: string;
        requester_name: string;
        action: 'add' | 'remove';
        category: string;
        card_content: string;
        approved_by: string[];
        status: string;
    }

    let manifest = $state<Record<string, ManifestConfig>>({});
    let activeDraws = $state<Draw[]>([]);
    let cardRequests = $state<CardRequest[]>([]);
    let activeTab = $state<'draw' | 'active' | 'pool'>('draw');
    
    // Draw State
    let selection = $state<Record<string, number>>({}); 
    let hideResult = $state(true);
    let isDrawing = $state(false);
    let showCompleted = $state(false);
    
    let filteredDraws = $derived(
        showCompleted 
            ? activeDraws 
            : activeDraws.filter(d => d.completed_by.length < 2)
    );
    
    // Reveal Wizard State
    let showWizard = $state(false);
    let wizardCards = $state<Card[]>([]);
    let wizardIndex = $state(0);
    let wizardCard = $derived(wizardCards[wizardIndex]);

    // Pool Management State
    let newCardInputs = $state<Record<string, string>>({});

    // Signing Wizard State
    let showSigningWizard = $state(false);
    let signingStep = $state(0);
    let signingStatus = $state('');
    let signingProgress = $state(0);

    onMount(() => {
        loadData();
    });

    async function loadData() {
        if (!$auth.token) return;
        const res = await fetch('/api/draw', { headers: getAuthHeaders($auth.token!) });
        const data = await res.json();
        manifest = data.manifest;
        activeDraws = data.draws;
        cardRequests = data.cardRequests;
        
        // Initialize selection state
        Object.keys(manifest).forEach(key => {
            if (selection[key] === undefined) selection[key] = 0;
            if (newCardInputs[key] === undefined) newCardInputs[key] = '';
        });
    }

    function updateQuantity(type: string, change: number, config: ManifestConfig) {
        const current = selection[type] || 0;
        const newQty = current + change;
        
        if (newQty < 0) return;
        if (config.max > 0 && newQty > config.max) return;
        
        selection[type] = newQty;
    }

    async function drawCards() {
        if (isDrawing || !$auth.token) return;
        
        let total = 0;
        for (const [type, config] of Object.entries(manifest)) {
            const count = selection[type] || 0;
            if (count < config.min) {
                alert(`Please select at least ${config.min} items for ${type}`);
                return;
            }
            total += count;
        }
        
        if (total === 0) {
             alert("Please select at least one item to draw.");
             return;
        }

        isDrawing = true;
        showSigningWizard = true;
        signingStep = 1;
        signingStatus = "Connecting to Casino Node...";
        signingProgress = 10;

        try {
            // Step 1: Simulated Connection
            await new Promise(r => setTimeout(r, 1200));
            signingStep = 2;
            signingStatus = "Mining Transaction Hash...";
            signingProgress = 30;

            // Step 2: Simulated Prep
            await new Promise(r => setTimeout(r, 1000));
            signingStep = 3;
            signingStatus = "Awaiting Digital Signature...";
            signingProgress = 50;

            // Step 3: Actual Signing
            const privKey = await GetPrivateKey();
            if (!privKey) throw new Error("Private key not found. Please set up your wallet in Profile.");
            
            const timestamp = Date.now();
            const dataToSign = `draw_spend:${$auth.userId}:${timestamp}:1`;
            const signature = await signData(privKey, dataToSign);
            
            signingStep = 4;
            signingStatus = "Broadcasting to Blockchain...";
            signingProgress = 80;

            const res = await fetch('/api/draw', {
                method: 'POST',
                headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: 'play', 
                    payload: { 
                        quantities: selection, 
                        hideResult,
                        signature,
                        timestamp
                    } 
                })
            });
            const data = await res.json();
            
            if (data.success) {
                signingStep = 5;
                signingStatus = "Transaction Confirmed!";
                signingProgress = 100;
                await new Promise(r => setTimeout(r, 800));
                showSigningWizard = false;

                Object.keys(manifest).forEach(key => selection[key] = 0);
                await loadData(); 
                
                if (!hideResult) {
                    wizardCards = data.draw.cards;
                    wizardIndex = 0;
                    showWizard = true;
                } else {
                    activeTab = 'active';
                }
            } else {
                throw new Error(data.error);
            }
        } catch (e: any) {
            alert(e.message || "Signing failed");
            showSigningWizard = false;
        } finally {
            isDrawing = false;
        }
    }

    async function revealDraw(drawId: string) {
        if (!$auth.token) return;
        const draw = activeDraws.find(d => d.id === drawId);
        if (draw) draw.is_visible = true;

        await fetch('/api/draw', {
            method: 'POST',
            headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reveal', payload: { drawId } })
        });
        loadData();
    }

    async function markComplete(drawId: string) {
        if (!$auth.token) return;
        await fetch('/api/draw', {
            method: 'POST',
            headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'complete', payload: { drawId } })
        });
        loadData();
    }

    async function redrawCard(drawId: string, cardId: string) {
        if (!$auth.token) return;
        const res = await fetch('/api/draw', {
            method: 'POST',
            headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'redraw', payload: { drawId, cardId } })
        });
        const data = await res.json();
        if (data.success) {
            loadData();
        } else {
            alert(data.error);
        }
    }

    async function requestCardChange(action: 'add' | 'remove', category: string, cardContent: string) {
        if (!$auth.token) return;
        const res = await fetch('/api/draw', {
            method: 'POST',
            headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'request_card_change', 
                payload: { action, category, cardContent } 
            })
        });
        const data = await res.json();
        if (data.success) {
            if (action === 'add') newCardInputs[category] = '';
            loadData();
        } else {
            alert(data.error);
        }
    }

    async function approveRequest(requestId: string) {
        if (!$auth.token) return;
        const res = await fetch('/api/draw', {
            method: 'POST',
            headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                action: 'approve_card_change', 
                payload: { requestId } 
            })
        });
        const data = await res.json();
        if (data.success) {
            loadData();
        } else {
            alert(data.error);
        }
    }
    
    function nextWizardStep() {
        if (wizardIndex < wizardCards.length - 1) {
            wizardIndex++;
        } else {
            showWizard = false;
            activeTab = 'active';
        }
    }

    function getExpiryWarning(expiresAt: number) {
        const hours = (expiresAt - Date.now()) / (1000 * 60 * 60);
        if (hours < 0) return 'Expired';
        if (hours < 24) return `Expires in ${Math.ceil(hours)}h`;
        return '';
    }

    function formatDate(ts: number) {
        return new Date(ts).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    }
</script>

<div class="draw-container">
    <div class="tabs">
        <button class:active={activeTab === 'draw'} onclick={() => activeTab = 'draw'}>Draw Cards</button>
        <button class:active={activeTab === 'active'} onclick={() => activeTab = 'active'}>Active Draws</button>
        <button class:active={activeTab === 'pool'} onclick={() => activeTab = 'pool'}>Manage Pool</button>
    </div>

    {#if activeTab === 'draw'}
        <div class="draw-panel" in:fade>
            <h2>Create Your Hand</h2>
            <p class="subtitle">Select quantities to draw. Cost: 1 Point.</p>
            
            <div class="manifest-grid">
                {#each Object.entries(manifest) as [type, config]}
                    <div class="type-section" style="--theme-color: {config.colour}">
                        <div class="type-header">
                            <ion-icon name={config.icon}></ion-icon>
                            <h3>{type}</h3>
                            <span class="badg">Min: {config.min} / Max: {config.max}</span>
                        </div>
                        <div class="card-options">
                            <div class="quantity-control">
                                <button class="step-btn" onclick={() => updateQuantity(type, -1, config)}>-</button>
                                <span class="qty">{selection[type] || 0}</span>
                                <button class="step-btn" onclick={() => updateQuantity(type, 1, config)}>+</button>
                            </div>
                            <span class="range-hint">Draw {config.min}-{config.max}</span>
                        </div>
                    </div>
                {/each}
            </div>

            <div class="action-bar">
                <label class="toggle">
                    <input type="checkbox" bind:checked={hideResult}>
                    <span class="slider"></span>
                    <span class="label">Hide Result (Reveal Later)</span>
                </label>
                <button class="btn primary lg" onclick={drawCards} disabled={isDrawing}>
                    {isDrawing ? 'Drawing...' : 'Draw Hand (1 Point)'}
                </button>
            </div>
        </div>
    {:else if activeTab === 'active'}
        <div class="active-panel" in:fade>
             <div class="panel-header">
                 <h2>Active Hand History</h2>
                 <label class="toggle-sm">
                     <input type="checkbox" bind:checked={showCompleted}>
                     <span class="slider"></span>
                     <span class="label">Show Completed</span>
                 </label>
             </div>
             
             <div class="draws-list">
                {#each filteredDraws as draw}
                    <div class="draw-group" class:revealed={draw.is_visible}>
                        <div class="draw-header">
                            <div class="draw-info">
                                <div class="draw-top">
                                    <span class="draw-date">{formatDate(draw.drawn_at)}</span>
                                    <span class="creator-tag">by {draw.creator_name}</span>
                                </div>
                                <span class="draw-count">{draw.cards.length} cards</span>
                            </div>
                            <div class="draw-actions">
                                {#if !draw.is_visible && draw.user_id === $auth.userId}
                                    <button class="btn sm primary" onclick={() => revealDraw(draw.id)}>Reveal All</button>
                                {/if}
                                
                                <div class="completion-pill">
                                    {#if draw.completed_by.includes($auth.userId!)}
                                         <span class="tick">✓</span> You
                                    {:else}
                                         <button class="btn xs" onclick={() => markComplete(draw.id)}>Mark Set Done</button>
                                    {/if}
                                    <span class="divider">|</span>
                                    <span class:done={draw.completed_by.length >= 2}>
                                        {draw.completed_by.length}/2
                                    </span>
                                </div>
                            </div>
                        </div>

                        {#if getExpiryWarning(draw.expires_at)}
                             <div class="expiry-banner">{getExpiryWarning(draw.expires_at)}</div>
                        {/if}

                        <div class="cards-grid">
                            {#each draw.cards as card}
                                <div class="game-card" class:hidden={!draw.is_visible} style="--theme-color: {card.metadata.colour}">
                                    {#if !draw.is_visible}
                                        <div class="card-back">
                                            <ion-icon name={card.metadata.icon}></ion-icon>
                                            <span class="card-type-label">{card.type}</span>
                                        </div>
                                    {:else}
                                        <div class="card-front">
                                            <div class="card-type" style="font-family: '{card.metadata.font}', sans-serif; color: {card.metadata.colour}">
                                                {card.type}
                                            </div>
                                            <div class="card-content-wrapper">
                                                <div class="card-content">{card.card_content}</div>
                                            </div>
                                            <div class="card-icon"><ion-icon name={card.metadata.icon}></ion-icon></div>
                                            
                                            {#if manifest[card.type]?.replace && !draw.metadata?.redrawn?.includes(card.type) && draw.user_id === $auth.userId}
                                                <button class="redraw-pill" onclick={() => redrawCard(draw.id, card.id)}>
                                                    <ion-icon name="refresh-outline"></ion-icon> Redraw
                                                </button>
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </div>
                {/each}
                {#if activeDraws.length === 0}
                    <div class="empty-state">No active draws. Go draw some!</div>
                {/if}
             </div>
        </div>
    {:else if activeTab === 'pool'}
        <div class="pool-panel" in:fade>
            <h2>Manage Card Pool</h2>
            <p class="subtitle">Proposed changes require 2 signatures to take effect.</p>

            {#if cardRequests.length > 0}
                <div class="pending-section">
                    <h3>Pending Changes</h3>
                    <div class="requests-list">
                        {#each cardRequests as request}
                            <div class="request-card" class:remove-act={request.action === 'remove'}>
                                <div class="req-info">
                                    <div class="req-main">
                                        <span class="action-tag">{request.action}</span>
                                        <span class="req-content">{request.card_content}</span>
                                        <span class="req-cat">in {request.category}</span>
                                    </div>
                                    <div class="req-meta">Requested by {request.requester_name}</div>
                                </div>
                                <div class="req-actions">
                                    {#if request.approved_by.includes($auth.userId!)}
                                        <span class="approved-pill">✓ Signed</span>
                                    {:else}
                                        <button class="btn sm primary" onclick={() => approveRequest(request.id)}>Sign Off</button>
                                    {/if}
                                    <span class="app-count">{request.approved_by.length}/2</span>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

            <div class="pool-grid">
                {#each Object.entries(manifest) as [type, config]}
                    <div class="pool-category" style="--theme-color: {config.colour}">
                        <div class="pool-cat-header">
                            <ion-icon name={config.icon}></ion-icon>
                            <h3>{type}</h3>
                        </div>
                        <div class="add-card-form">
                            <input type="text" placeholder="New card content..." bind:value={newCardInputs[type]}>
                            <button disabled={!newCardInputs[type]} onclick={() => requestCardChange('add', type, newCardInputs[type])}>Add</button>
                        </div>
                        <div class="pool-items">
                            {#each config.cards as item}
                                <div class="pool-item">
                                    <span>{item}</span>
                                    <button class="remove-btn" onclick={() => requestCardChange('remove', type, item)}>×</button>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>

    {#if showSigningWizard}
        <div class="wizard-overlay" in:fade out:fade>
            <div class="signing-wizard" in:scale>
                <div class="blockchain-bg"></div>
                <div class="wizard-header">
                    <ion-icon name="shield-checkmark-outline"></ion-icon>
                    <h2>Blockchain Signing Ceremony</h2>
                </div>
                
                <div class="status-steps">
                    {#each [1, 2, 3, 4, 5] as step}
                        <div class="step-dot" class:active={signingStep >= step} class:current={signingStep === step}></div>
                    {/each}
                </div>

                <div class="wizard-body">
                    <div class="status-text">{signingStatus}</div>
                    <div class="progress-container">
                        <div class="progress-bar" style="width: {signingProgress}%"></div>
                    </div>
                </div>

                <div class="mining-animation" class:active={signingStep < 5}>
                    <div class="node-circle"></div>
                    <div class="node-circle"></div>
                    <div class="node-circle"></div>
                </div>
                
                <p class="wizard-footer">Transaction is being permanently etched into the Points ledger.</p>
            </div>
        </div>
    {/if}

    {#if showWizard && wizardCard}
    <div class="wizard-overlay" transition:fade>
        <div class="wizard-card">
            <h1>You Drawn:</h1>
            <div class="big-card" style="--theme-color: {wizardCard.metadata.colour}">
                 <div class="card-type" style="font-family: '{wizardCard.metadata.font}', sans-serif; color: {wizardCard.metadata.colour}">
                     {wizardCard.type}
                 </div>
                 <div class="card-content-wrapper">
                     <div class="card-content">{wizardCard.card_content}</div>
                 </div>
                 <ion-icon name={wizardCard.metadata.icon}></ion-icon>
            </div>
            <button class="btn primary lg" onclick={nextWizardStep}>
                {wizardIndex < wizardCards.length - 1 ? 'Next' : 'Finish'}
            </button>
        </div>
    </div>
{/if}

<style>
    .draw-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        color: white;
    }

    .tabs {
        display: flex;
        gap: 10px;
        margin-bottom: 30px;
        background: rgba(255,255,255,0.05);
        padding: 5px;
        border-radius: 12px;
    }

    .tabs button {
        flex: 1;
        padding: 12px;
        background: transparent;
        border: none;
        color: var(--text-secondary);
        font-weight: 700;
        cursor: pointer;
        border-radius: 8px;
        transition: all 0.2s;
    }

    .tabs button.active {
        background: var(--accent);
        color: white;
        box-shadow: 0 2px 10px rgba(99, 102, 241, 0.3);
    }
    
    .type-section {
        background: rgba(255,255,255,0.05);
        border: 1px solid var(--theme-color);
        border-radius: 16px;
        padding: 20px;
        margin-bottom: 20px;
    }
    
    .type-header, .pool-cat-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 15px;
        color: var(--theme-color);
    }
    
    .type-header h3, .pool-cat-header h3 { margin: 0; text-transform: capitalize; font-size: 1.2rem; }
    .type-header ion-icon, .pool-cat-header ion-icon { font-size: 1.5rem; }
    
    .badg {
        background: rgba(0,0,0,0.3);
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.8rem;
        margin-left: auto;
    }

    .card-options {
        display: flex;
        align-items: center;
        gap: 15px;
    }

    .quantity-control {
        display: flex;
        align-items: center;
        background: rgba(255,255,255,0.1);
        border-radius: 20px;
        padding: 5px;
    }
    
    .step-btn {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: none;
        background: rgba(255,255,255,0.1);
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
    }
    .step-btn:hover { background: rgba(255,255,255,0.2); }
    
    .qty {
        width: 40px;
        text-align: center;
        font-weight: bold;
        font-size: 1.2rem;
    }
    
    .range-hint {
        color: var(--text-secondary);
        font-size: 0.9rem;
    }

    .action-bar {
        position: fixed;
        bottom: calc(64px + env(safe-area-inset-bottom));
        left: 0;
        right: 0;
        background: rgba(20, 20, 30, 0.95);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        padding: 15px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        max-width: 480px;
        margin: 0 auto;
        border-top: 1px solid rgba(255,255,255,0.1);
        z-index: 100;
    }
    
    .toggle { display: flex; align-items: center; cursor: pointer; gap: 10px; }
    .toggle input { display: none; }
    .slider {
        width: 40px; height: 22px; background: #333; border-radius: 22px; position: relative; transition: 0.3s;
    }
    .slider:before {
        content: ''; position: absolute; width: 18px; height: 18px; background: white; border-radius: 50%; top: 2px; left: 2px; transition: 0.3s;
    }
    .toggle input:checked + .slider { background: var(--accent); }
    .toggle input:checked + .slider:before { transform: translateX(18px); }

    .btn.lg { padding: 15px 30px; font-size: 1.1rem; }
    .btn.primary { background: var(--accent); color: white; border: none; border-radius: 12px; font-weight: bold; cursor: pointer; }
    .btn.sm { padding: 6px 12px; font-size: 0.8rem; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Draws List */
    .draw-group {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 16px;
        padding: 15px;
        margin-bottom: 20px;
    }

    .draw-group.revealed {
        border-color: rgba(99, 102, 241, 0.3);
        background: rgba(99, 102, 241, 0.05);
    }

    .draw-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
    }

    .draw-top { display: flex; align-items: center; gap: 10px; }
    .creator-tag { background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; color: var(--accent); }
    .draw-date { font-weight: bold; font-size: 1.1rem; }
    .draw-count { color: var(--text-secondary); font-size: 0.8rem; }

    .completion-pill { display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.3); padding: 6px 12px; border-radius: 20px; font-size: 0.8rem; }
    .tick { color: #10b981; font-weight: bold; }
    .done { color: #10b981; }

    .expiry-banner { background: rgba(239, 68, 68, 0.1); color: #ef4444; text-align: center; padding: 5px; border-radius: 8px; font-size: 0.75rem; font-weight: bold; margin-bottom: 15px; }

    .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
    .game-card { aspect-ratio: 2/3; position: relative; background: #1e1e24; border-radius: 10px; border: 2px solid var(--theme-color); overflow: hidden; }
    .game-card.hidden { filter: brightness(0.7); }
    .card-back, .card-front { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 10px; text-align: center; }
    .card-back { background: repeating-linear-gradient(45deg, rgba(255,255,255,0.02), rgba(255,255,255,0.02) 10px, transparent 10px, transparent 20px); color: var(--theme-color); }
    .card-front {
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        color: white;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 12px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2), inset 0 0 0 1px rgba(255,255,255,0.1);
    }
    
    .card-type { 
        font-size: 2rem; 
        font-weight: 700;
        text-align: center;
        text-transform: capitalize;
        letter-spacing: 1px;
    }

    .card-content-wrapper {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 10px 0;
    }
    
    .card-content { 
        font-family: Arial, sans-serif;
        font-style: italic;
        font-size: 1.5rem; 
        font-weight: 500; 
        line-height: 1.2;
        text-align: center;
        text-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }

    .card-icon {
        display: flex;
        justify-content: center;
        opacity: 0.8;
    }
    .card-icon ion-icon { font-size: 1.2rem; color: var(--theme-color); filter: drop-shadow(0 0 5px var(--theme-color)); }

    /* Layout additions */
    .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
    }
    .panel-header h2 { margin: 0; font-size: 1.4rem; }

    .toggle-sm { display: flex; align-items: center; cursor: pointer; gap: 8px; font-size: 0.8rem; color: var(--text-secondary); }
    .toggle-sm input { display: none; }
    .toggle-sm .slider { width: 34px; height: 18px; border-radius: 18px; }
    .toggle-sm .slider:before { width: 14px; height: 14px; top: 2px; left: 2px; }
    .toggle-sm input:checked + .slider:before { transform: translateX(16px); }

    /* Pool Panel */
    .pool-panel h2 { margin-bottom: 5px; }
    .subtitle { color: var(--text-secondary); margin-bottom: 30px; }

    .redraw-pill {
        position: absolute;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--accent);
        color: white;
        border: none;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 0.75rem;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 5px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        transition: all 0.2s;
        z-index: 10;
    }
    .redraw-pill:hover {
        background: #4f46e5;
        transform: translateX(-50%) scale(1.05);
    }
    .redraw-pill ion-icon { font-size: 0.9rem; }

    .pending-section { background: rgba(99, 102, 241, 0.1); border: 1px solid var(--accent); border-radius: 16px; padding: 20px; margin-bottom: 30px; }
    .pending-section h3 { margin-top: 0; color: var(--accent); margin-bottom: 15px; }

    .request-card { display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 12px 20px; border-radius: 12px; margin-bottom: 10px; border-left: 4px solid #10b981; }
    .request-card.remove-act { border-left-color: #ef4444; }
    .req-main { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
    .action-tag { text-transform: uppercase; font-size: 0.6rem; font-weight: bold; padding: 2px 6px; border-radius: 4px; background: #333; }
    .req-content { font-weight: bold; }
    .req-cat { font-size: 0.8rem; color: var(--text-muted); }
    .req-meta { font-size: 0.7rem; color: var(--text-secondary); }
    .req-actions { display: flex; align-items: center; gap: 15px; }
    .approved-pill { color: #10b981; font-size: 0.8rem; font-weight: bold; }
    .app-count { font-weight: bold; background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 10px; font-size: 0.8rem; }

    .pool-grid { display: grid; gap: 20px; }
    .pool-category { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 20px; border-radius: 16px; border-top: 4px solid var(--theme-color); }
    .add-card-form { display: flex; gap: 10px; margin-bottom: 20px; }
    .add-card-form input { flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 8px 12px; color: white; }
    .add-card-form button { background: var(--theme-color); color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: bold; cursor: pointer; }
    .add-card-form button:disabled { opacity: 0.3; }

    .pool-items { display: flex; flex-wrap: wrap; gap: 8px; }
    .pool-item { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.05); padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); }
    .big-card .card-type { font-size: 2.5rem; }
    .remove-btn { background: transparent; border: none; color: #ef4444; font-size: 1.2rem; cursor: pointer; line-height: 1; padding: 0 4px; }

    /* Shared items cleanup */
    .empty-state { text-align: center; padding: 50px; color: var(--text-muted); border: 2px dashed rgba(255,255,255,0.05); border-radius: 20px; }

    /* Signing Wizard Styles */
    .signing-wizard {
        background: rgba(18, 18, 35, 0.95);
        backdrop-filter: blur(20px);
        width: 100%;
        max-width: 400px;
        padding: 40px;
        border-radius: 30px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        text-align: center;
        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        position: relative;
        overflow: hidden;
    }

    .blockchain-bg {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: radial-gradient(circle at center, rgba(124, 58, 237, 0.1) 0%, transparent 70%);
        pointer-events: none;
    }

    .wizard-header {
        margin-bottom: 30px;
    }

    .wizard-header ion-icon {
        font-size: 3rem;
        color: var(--accent);
        margin-bottom: 15px;
        filter: drop-shadow(0 0 10px var(--accent));
    }

    .status-steps {
        display: flex;
        justify-content: center;
        gap: 10px;
        margin-bottom: 30px;
    }

    .step-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: rgba(255,255,255,0.1);
        transition: all 0.3s;
    }

    .step-dot.active {
        background: var(--accent);
        box-shadow: 0 0 10px var(--accent);
    }

    .step-dot.current {
        transform: scale(1.5);
        animation: pulse 1s infinite;
    }

    .status-text {
        font-size: 1.1rem;
        font-weight: 600;
        margin-bottom: 20px;
        min-height: 1.5em;
    }

    .progress-container {
        height: 6px;
        background: rgba(255,255,255,0.05);
        border-radius: 3px;
        overflow: hidden;
        margin-bottom: 40px;
    }

    .progress-bar {
        height: 100%;
        background: linear-gradient(90deg, var(--accent), #a855f7);
        transition: width 0.3s ease;
    }

    .mining-animation {
        display: flex;
        justify-content: center;
        gap: 20px;
        margin-bottom: 30px;
        opacity: 0;
        transition: opacity 0.5s;
    }

    .mining-animation.active {
        opacity: 1;
    }

    .node-circle {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 2px solid var(--accent);
        animation: node-ping 1.5s infinite;
    }

    .node-circle:nth-child(2) { animation-delay: 0.2s; }
    .node-circle:nth-child(3) { animation-delay: 0.4s; }

    @keyframes node-ping {
        0% { transform: scale(1); opacity: 1; }
        100% { transform: scale(2.5); opacity: 0; }
    }

    @keyframes pulse {
        0%, 100% { transform: scale(1.5); }
        50% { transform: scale(1.8); }
    }

    .wizard-footer {
        font-size: 0.75rem;
        color: var(--text-muted);
        font-style: italic;
    }
</style>
