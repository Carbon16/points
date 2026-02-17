<script lang="ts">
	import { auth } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { generateKeyPair, exportPublicKey, StoreKeys, GetPublicKey, importKeyPair } from '$lib/crypto';

	let selectedUser = $state('');
	let pin = $state('');
	let error = $state('');
	let loading = $state(false);
	
	let showRestore = $state(false);
	let restoreKey = $state('');

	async function handleLogin() {
		if (!selectedUser || !pin) { error = 'Select a player and enter your PIN'; return; }
		error = '';
		loading = true;

		try {
			// Crypto setup
			let publicKeyStr: string | undefined;
			try {
				const existingKey = await GetPublicKey();
				if (existingKey) {
					console.log('Found existing key');
					publicKeyStr = await exportPublicKey(existingKey);
				} else {
					console.log('Generating new key pair...');
					const pair = await generateKeyPair();
					await StoreKeys(pair);
					console.log('Keys stored');
					publicKeyStr = await exportPublicKey(pair.publicKey);
				}
			} catch (e) {
				console.error('Crypto error:', e);
			}

			const res = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId: selectedUser, pin, publicKey: publicKeyStr })
			});
			const data = await res.json();
			if (!data.success) { error = data.error || 'Login failed'; loading = false; return; }

			auth.login(data.data.token, data.data.userId, selectedUser === 'player1' ? 'Player 1' : 'Player 2');
			goto('/');
		} catch (e) {
			console.error(e);
			error = 'Connection failed';
		}
		loading = false;
	}

	async function restoreIdentity() {
		try {
			const pair = await importKeyPair(restoreKey);
			await StoreKeys(pair);
			showRestore = false;
			error = 'Identity restored! Sign in now.';
			setTimeout(() => error = '', 3000);
		} catch (e) {
			error = 'Invalid Key Format';
		}
	}
</script>

<div class="login-page">
	<div class="login-container animate-in">
		<div class="logo">
			<span class="logo-icon"><ion-icon name="rocket-outline"></ion-icon></span>
			<h1 class="logo-text">Points</h1>
			<p class="logo-sub">Poker Points Tracker</p>
		</div>

		{#if !showRestore}
			<div class="login-card card card-glow">
				<h2>Sign In</h2>

				<div class="user-select">
					<button
						class="user-btn"
						class:selected={selectedUser === 'player1'}
						onclick={() => selectedUser = 'player1'}
					>
						<span class="user-avatar"><ion-icon name="person-circle-outline"></ion-icon></span>
						<span>Player 1</span>
					</button>
					<button
						class="user-btn"
						class:selected={selectedUser === 'player2'}
						onclick={() => selectedUser = 'player2'}
					>
						<span class="user-avatar"><ion-icon name="person-circle-outline"></ion-icon></span>
						<span>Player 2</span>
					</button>
				</div>

				<input
					type="password"
					placeholder="Enter your PIN"
					bind:value={pin}
					onkeydown={(e) => e.key === 'Enter' && handleLogin()}
				/>

				{#if error}
					<p class="error">{error}</p>
				{/if}

				<button class="btn btn-primary login-btn" onclick={handleLogin} disabled={loading}>
					{loading ? 'Signing in...' : 'Sign In'}
				</button>

				<button class="btn btn-ghost" onclick={() => showRestore = true} style="font-size: 0.8rem; margin-top: 8px;">
					Restore Identity from Backup
				</button>
			</div>
		{:else}
			<div class="login-card card card-glow">
				<h2>Restore Identity</h2>
				<p class="hint">Paste your private key JSON backup here.</p>
				
				<textarea 
					bind:value={restoreKey} 
					placeholder="Paste your private key JSON here..."
					class="restore-input"
				></textarea>

				{#if error}
					<p class="error">{error}</p>
				{/if}

				<button class="btn btn-warning login-btn" onclick={restoreIdentity}>
					Restore Key
				</button>
				<button class="btn btn-ghost" onclick={() => showRestore = false}>
					Cancel
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.login-page {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
	}

	.login-container {
		width: 100%;
		max-width: 380px;
	}

	.logo {
		text-align: center;
		margin-bottom: 32px;
	}

	.logo-icon {
		font-size: 3rem;
		display: block;
		margin-bottom: 8px;
		filter: drop-shadow(0 0 20px var(--accent-glow));
	}

	.logo-text {
		font-size: 2rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		background: linear-gradient(135deg, var(--text-primary), var(--accent-light));
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.logo-sub {
		color: var(--text-muted);
		font-size: 0.85rem;
		margin-top: 4px;
	}

	.login-card {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.login-card h2 {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.user-select {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}

	.user-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 16px;
		background: var(--bg-secondary);
		border: 2px solid transparent;
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		font-size: 0.85rem;
		font-weight: 500;
		transition: all var(--transition);
	}
	.user-btn:hover { border-color: rgba(255,255,255,0.1); }
	.user-btn.selected {
		border-color: var(--accent);
		background: rgba(124, 58, 237, 0.1);
		color: var(--text-primary);
	}

	.user-avatar { font-size: 1.5rem; }

	.login-card input {
		width: 100%;
	}

	.error {
		color: var(--danger);
		font-size: 0.8rem;
		text-align: center;
	}

	.login-btn {
		width: 100%;
		padding: 14px;
		font-size: 1rem;
	}

	.hint {
		text-align: center;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.restore-input {
		width: 100%;
		height: 100px;
		background: var(--bg-secondary);
		border: 1px solid rgba(255,255,255,0.1);
		border-radius: var(--radius-sm);
		padding: 10px;
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		resize: none;
	}
</style>
