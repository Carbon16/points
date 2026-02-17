<script lang="ts">
	import { auth } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { generateKeyPair, exportPublicKey, StoreKeys, GetPublicKey, importKeyPair, backupPrivateKey, recoverPrivateKey } from '$lib/crypto';
	import { initPush } from '$lib/push-client';

	let selectedUser = $state('');
	let pin = $state('');
	let error = $state('');
	let loading = $state(false);
	let wantNotifications = $state(true);
	let notificationStatus = $state('');
    let notificationEnabled = $state(false);
	
	let creatingIdentity = $state(false);
	let identityStep = $state(0);
	
	let showRestore = $state(false);
	let restoreKey = $state('');

	const steps = [
		'Initializing Enclave Node...',
		'Generating P-256 ECDSA Key Pair...',
		'Encrypting Secure Backup...',
		'Configuring Push Notifications...',
		'Registering Signature...'
	];

	function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

	async function enableNotifications() {
		if (!('Notification' in window) || !('serviceWorker' in navigator)) {
			alert('Notifications are not supported on this device');
			return;
		}

		try {
			// Request permission (iOS requires this to be from user gesture)
			const permission = await Notification.requestPermission();
			
			if (permission === 'granted') {
				// Register service worker if not already registered
				await navigator.serviceWorker.register('/service-worker.js');
				
				// Initialize push subscription
				await initPush($auth.token!);
				
				notificationStatus = 'Enabled';
				notificationEnabled = true;
				alert('Notifications enabled successfully!');
			} else {
				notificationStatus = 'Permission denied';
				alert('Notification permission was denied');
			}
		} catch (e) {
			console.error('Failed to enable notifications:', e);
			alert('Failed to enable notifications: ' + (e as Error).message);
		}
	}

	async function handleLogin() {
		if (!selectedUser || !pin) { error = 'Select a player and enter your PIN'; return; }
		error = '';
		loading = true;

		try {
			// 1. Initial login attempt to check if user exists and get backup if available
			const initialRes = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId: selectedUser, pin })
			});
			const initialData = await initialRes.json();

			if (!initialData.success) {
				error = initialData.error || 'Login failed';
				loading = false;
				return;
			}

			let publicKeyStr: string | undefined;
			let encryptedPrivateKey: string | undefined;

			try {
				const existingKey = await GetPublicKey();
				
				if (existingKey) {
					console.log('Found existing local key');
					publicKeyStr = await exportPublicKey(existingKey);
				} else if (initialData.data.encryptedPrivateKey) {
					// 2. RECOVERY FLOW: Restore from server backup
					console.log('Restoring from server backup...');
					creatingIdentity = true;
					identityStep = 2; // "Encrypting Secure Backup..." (reusing labels)
					
					const privateKey = await recoverPrivateKey(initialData.data.encryptedPrivateKey, pin);
					const publicKey = await GetPublicKey(); // Wait, recoverPrivateKey doesn't store it
					// recoverPrivateKey returns privateKey, we need to store the pair
					// Let's modify recoverPrivateKey to return the pair or handle it here
					// Actually, recoverPrivateKey in my implementation returns just privateKey.
					// I need to derive public key or store it differently.
					
					// Re-import the key as a pair
					const jwk = await window.crypto.subtle.exportKey('jwk', privateKey);
					const pair = await importKeyPair(JSON.stringify(jwk));
					await StoreKeys(pair);
					publicKeyStr = await exportPublicKey(pair.publicKey);
					
					await wait(1000);
					creatingIdentity = false;
				} else {
					// 3. NEW ONBOARDING FLOW
					creatingIdentity = true;
					identityStep = 0;
					await wait(800);

					identityStep = 1;
					const pair = await generateKeyPair();
					await wait(1200);

					identityStep = 2; // Encrypting Secure Backup
					encryptedPrivateKey = await backupPrivateKey(pair.privateKey, pin);
					await StoreKeys(pair);
					publicKeyStr = await exportPublicKey(pair.publicKey);
					await wait(1000);

					identityStep = 3;
					if (wantNotifications) await enableNotifications();
					await wait(800);

					identityStep = 4; 
					await wait(800);
				}

				// 4. Final login/registration with public key and backup if newly created
				const res = await fetch('/api/auth', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ 
						userId: selectedUser, 
						pin, 
						publicKey: publicKeyStr,
						encryptedPrivateKey: encryptedPrivateKey 
					})
				});
				const data = await res.json();
				
				if (!data.success) { 
					error = data.error || 'Login failed'; 
					loading = false; 
					creatingIdentity = false;
					return; 
				}

				auth.login(data.data.token, data.data.userId, selectedUser === 'player1' ? 'Player 1' : 'Player 2');
				goto('/');

			} catch (e) {
				console.error('Crypto error:', e);
				creatingIdentity = false;
				loading = false;
				error = 'Identity recovery failed. Incorrect PIN?';
				return;
			}
		} catch (e) {
			console.error(e);
			error = 'Connection failed';
			creatingIdentity = false;
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

		{#if creatingIdentity}
			<div class="login-card card card-glow onboarding-card">
				<div class="spinner-large"></div>
				<h3>Creating Secure Identity</h3>
				<div class="steps">
					{#each steps as step, i}
						<div class="step-item" class:active={i === identityStep} class:done={i < identityStep}>
							<ion-icon name={i < identityStep ? 'checkmark-circle' : (i === identityStep ? 'ellipse' : 'ellipse-outline')}></ion-icon>
							<span>{step}</span>
						</div>
					{/each}
				</div>
			</div>
		{:else if !showRestore}
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
					inputmode="numeric"
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

	.onboarding-card {
		align-items: center;
		padding: 40px 20px;
		text-align: center;
	}
	.spinner-large {
		width: 40px; height: 40px;
		border: 4px solid rgba(255,255,255,0.1);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 20px;
	}
	.steps {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 20px;
		width: 100%;
		text-align: left;
	}
	.step-item {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--text-muted);
		font-size: 0.8rem;
		transition: all 0.3s;
	}
	.step-item.active { color: var(--text-primary); font-weight: 600; transform: translateX(5px); }
	.step-item.done { color: var(--accent); }
	.step-item ion-icon { font-size: 1.2rem; }
	@keyframes spin { 100% { transform: rotate(360deg); } }
</style>
