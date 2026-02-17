<script lang="ts">
	import { onMount } from 'svelte';
	import { auth, getAuthHeaders } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { GetPrivateKey, signData } from '$lib/crypto';

	interface PointReq {
		id: string;
		requested_by: string;
		award_to: string;
		description: string;
		status: string;
		approved_by: string[];
		created_at: number;
		signatures?: Record<string, string>;
		type?: string;
	}

	let pending = $state<PointReq[]>([]);
	let loading = $state(true);
	let showForm = $state(false);
	let awardTo = $state('player1');
	let description = $state('');
	let submitting = $state(false);
	let message = $state('');
	
	let mode = $state<'earn' | 'spend'>('earn');
	let spendAmount = $state(0.5);
	let earnAmount = $state(1);

	let users = $state<{id: string, name: string}[]>([]);
	let myBalance = $state(0);

	onMount(async () => {
		if (!$auth.token) { goto('/login'); return; }
		const [uRes, sRes] = await Promise.all([
			fetch('/api/auth', { headers: getAuthHeaders($auth.token!) }),
			fetch('/api/points', { headers: getAuthHeaders($auth.token!) })
		]);
		const [uData, sData] = await Promise.all([uRes.json(), sRes.json()]);
		if (uData.success) users = uData.data;
		if (sData.success) {
			const myScore = (sData.data as any[]).find(s => s.userId === $auth.userId);
			myBalance = myScore ? myScore.points : 0;
		}
		await loadPending();
	});

	async function loadPending() {
		loading = true;
		try {
			const res = await fetch('/api/points/pending', { headers: getAuthHeaders($auth.token!) });
			const data = await res.json();
			if (data.success) pending = data.data;
		} catch {/* */}
		loading = false;
	}

	function getModeTitle() {
		return mode === 'earn' ? 'Request Points' : 'Spend Points';
	}

	async function submitRequest() {
		submitting = true;
		message = '';
		try {
			const pk = await GetPrivateKey();
			if (!pk) throw new Error('No private key found');

			const timestamp = Date.now();
			let payload = '';
			let body: any = {};

			if (mode === 'earn') {
				payload = `manual_point:${awardTo}:${description || 'Manual point'}:${timestamp}`;
				body = {
					type: 'manual_point',
					winnerId: awardTo,
					description: description || 'Manual point',
					timestamp
				};
			} else {
				const desc = `[SPEND] ${description || 'Spend'}`;
				payload = `spend:${$auth.userId}:${spendAmount}:${desc}:${timestamp}`;
				body = {
					type: 'spend',
					amount: spendAmount,
					description: desc,
					timestamp
				};
			}

			const signature = await signData(pk, payload);
			body.signature = signature;

			const res = await fetch('/api/points', {
				method: 'POST',
				headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const data = await res.json();
			if (data.success) {
				message = 'Request sent! Waiting for approval.';
				description = '';
				showForm = false;
				await loadPending();
			} else {
				message = data.error;
			}
		} catch (e) {
			console.error(e);
			message = 'Failed to submit (Crypto error?)';
		}
		submitting = false;
	}

	async function handleApproval(req: PointReq, action: 'approve' | 'reject') {
		try {
			let signature: string | undefined;
			if (action === 'approve') {
				const pk = await GetPrivateKey();
				if (pk) {
					let payload = '';
					if (req.description.startsWith('[SPEND]')) {
						payload = `spend:${req.requested_by}:${req.description}:${req.created_at}`;
					} else {
						payload = `manual_point:${req.award_to}:${req.description}:${req.created_at}`;
					}
					
					signature = await signData(pk, payload);
				}
			}

			const res = await fetch('/api/points/pending', {
				method: 'POST',
				headers: { ...getAuthHeaders($auth.token!), 'Content-Type': 'application/json' },
				body: JSON.stringify({ requestId: req.id, action, signature })
			});
			const data = await res.json();
			if (data.success) {
				if (data.data?.mined) {
					message = 'Point approved and recorded on blockchain!';
				} else if (data.data?.status === 'rejected') {
					message = 'Request rejected';
				}
				await loadPending();
			}
		} catch {/* */}
	}

	function getName(id: string) {
		const user = users.find(u => u.id === id);
		if (user) return user.name;
		return id === 'player1' ? 'Player 1' : 'Player 2';
	}

	function formatTime(ts: number) {
		return new Date(ts).toLocaleDateString('en-GB', {
			day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
		});
	}
</script>

<div class="approve-page animate-in">
	<div class="page-header">
		<h1><ion-icon name="checkmark-done-circle-outline"></ion-icon> Approvals</h1>
		<button class="btn btn-primary" onclick={() => showForm = !showForm}>
			{showForm ? 'Cancel' : '+ New Request'}
		</button>
	</div>

	{#if message}
		<div class="card message-card">{message}</div>
	{/if}

	{#if showForm}
		<div class="card form-card">
			<div class="tabs">
				<button class="tab" class:active={mode === 'earn'} onclick={() => mode = 'earn'}>Earn Point</button>
				<button class="tab" class:active={mode === 'spend'} onclick={() => mode = 'spend'}>Spend Point</button>
			</div>

			<h3>{getModeTitle()}</h3>
			
			{#if mode === 'earn'}
				<div class="form-group">
					<span class="label-text">Award to:</span>
					<div class="select-row">
						<button class="user-btn" class:selected={awardTo === 'player1'} onclick={() => awardTo = 'player1'} aria-label="Award to Player 1">
							{getName('player1')}
						</button>
						<button class="user-btn" class:selected={awardTo === 'player2'} onclick={() => awardTo = 'player2'} aria-label="Award to Player 2">
							{getName('player2')}
						</button>
					</div>
				</div>
			{:else}
				<div class="info-box">
					<ion-icon name="information-circle-outline"></ion-icon>
					<p>Spending reduces your score. Current Balance: <strong>{myBalance}</strong></p>
				</div>

				<div class="form-group">
					<span class="label-text">Amount to spend:</span>
					<div class="select-row">
						<button class="user-btn" class:selected={spendAmount === 0.5} onclick={() => spendAmount = 0.5} aria-label="Spend 0.5 points">
							0.5
						</button>
						<button class="user-btn" class:selected={spendAmount === 1} onclick={() => spendAmount = 1} aria-label="Spend 1.0 point">
							1.0
						</button>
					</div>
				</div>
			{/if}

			<div class="form-group">
				<label>Reason:</label>
				<input type="text" bind:value={description} placeholder={mode === 'earn' ? "e.g. Won pool" : "e.g. Pint"} />
			</div>
			<button class="btn btn-success" onclick={submitRequest} disabled={submitting}>
				{submitting ? 'Submitting...' : 'Submit Request'}
			</button>
		</div>
	{/if}

	<section class="pending-section">
		<h2>Pending Requests</h2>
		{#if loading}
			<p class="empty loading">Loading...</p>
		{:else if pending.length === 0}
			<p class="empty">No pending requests</p>
		{:else}
			{#each pending as req}
				<div class="card request-card">
					<div class="req-info">
						<span class="req-title">
							{#if req.description.startsWith('[SPEND]')}
								<strong>{getName(req.requested_by)}</strong> wants to Spend a Point
							{:else}
								Award point to <strong>{getName(req.award_to)}</strong>
							{/if}
						</span>
						<span class="req-desc">{req.description}</span>
						<span class="req-meta">
							Requested by {getName(req.requested_by)} · {formatTime(req.created_at)}
						</span>
						<span class="req-approvals">
							Approved by: {req.approved_by.map(getName).join(', ') || 'None'}
						</span>
					</div>
					{#if !req.approved_by.includes($auth.userId || '')}
						<div class="req-actions">
							<button class="btn btn-success" onclick={() => handleApproval(req, 'approve')}>
								Approve
							</button>
							<button class="btn btn-danger" onclick={() => handleApproval(req, 'reject')}>
								Reject
							</button>
						</div>
					{:else}
						<span class="badge badge-warning">Awaiting other player</span>
					{/if}
				</div>
			{/each}
		{/if}
	</section>
</div>

<style>
	.approve-page {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	h1 { font-size: 1.3rem; font-weight: 800; }
	h2 {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-bottom: 10px;
	}

	.message-card {
		background: rgba(124, 58, 237, 0.1);
		border-color: var(--accent);
		text-align: center;
		font-size: 0.85rem;
		padding: 14px;
	}

	.form-card {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.form-card h3 {
		font-size: 1rem;
		color: var(--text-secondary);
	}

	.tabs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
		background: var(--bg-secondary);
		padding: 4px;
		border-radius: var(--radius-sm);
	}
	.tab {
		background: transparent;
		border: none;
		color: var(--text-muted);
		padding: 8px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		border-radius: 4px;
		transition: all var(--transition);
	}
	.tab.active {
		background: var(--bg-card);
		color: var(--text-primary);
		box-shadow: 0 1px 3px rgba(0,0,0,0.1);
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.form-group label, .label-text {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-muted);
	}
	.form-group input { width: 100%; }

	.select-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.user-btn {
		padding: 10px;
		background: var(--bg-secondary);
		border: 2px solid transparent;
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition);
	}
	.user-btn:hover { border-color: rgba(255,255,255,0.1); }
	.user-btn.selected {
		border-color: var(--accent);
		background: rgba(124, 58, 237, 0.1);
		color: var(--text-primary);
	}

	.info-box {
		background: rgba(59, 130, 246, 0.1);
		border: 1px solid rgba(59, 130, 246, 0.2);
		padding: 12px;
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.85rem;
		color: #60a5fa;
	}

	.request-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
	}
	.req-info { display: flex; flex-direction: column; gap: 4px; }
	.req-title { font-size: 0.9rem; }
	.req-desc { font-size: 0.8rem; color: var(--text-secondary); }
	.req-meta { font-size: 0.72rem; color: var(--text-muted); }
	.req-approvals { font-size: 0.72rem; color: var(--accent-light); }

	.req-actions { display: flex; gap: 8px; }
	.req-actions .btn { flex: 1; font-size: 0.8rem; padding: 8px; }

	.empty {
		text-align: center;
		color: var(--text-muted);
		font-size: 0.85rem;
		padding: 24px;
	}
</style>
