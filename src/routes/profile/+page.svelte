<script lang="ts">
	import { onMount } from 'svelte';
	import { auth, getAuthHeaders } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { GetPublicKey, GetPrivateKey, exportPrivateKey, exportPublicKey, digestMessage } from '$lib/crypto';
	import { initPush } from '$lib/push-client';

	let fingerprint = $state('Loading...');
	let showPrivateKey = $state(false);
	let privateKeyJson = $state('');
	let copyStatus = $state('');
	let notificationStatus = $state('checking...');
	let notificationEnabled = $state(false);

	onMount(async () => {
		if (!$auth.token) { goto('/login'); return; }
		await loadIdentity();
		checkNotificationStatus();
	});

	async function loadIdentity() {
		try {
			const pub = await GetPublicKey();
			if (pub) {
				const jwk = await exportPublicKey(pub); // this returns string
				fingerprint = await digestMessage(jwk);
			} else {
				fingerprint = 'No Identity Found';
			}
		} catch (e) {
			fingerprint = 'Error loading identity';
		}
	}

	async function revealPrivateKey() {
		try {
			const priv = await GetPrivateKey();
			if (priv) {
				privateKeyJson = await exportPrivateKey(priv);
				showPrivateKey = true;
			} else {
				alert('No private key found in storage. You may need to restore your identity.');
			}
		} catch (e) {
			console.error(e);
			alert('Failed to export private key: ' + (e as Error).message);
		}
	}

	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(privateKeyJson);
			copyStatus = 'Copied!';
			setTimeout(() => copyStatus = '', 2000);
		} catch (e) {
			copyStatus = 'Failed to copy';
		}
	}

	function checkNotificationStatus() {
		if (!('Notification' in window)) {
			notificationStatus = 'Not supported';
			return;
		}
		const permission = Notification.permission;
		if (permission === 'granted') {
			notificationStatus = 'Enabled';
			notificationEnabled = true;
		} else if (permission === 'denied') {
			notificationStatus = 'Blocked (check browser settings)';
		} else {
			notificationStatus = 'Disabled';
		}
	}

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
</script>

<div class="profile-page animate-in">
	<div class="page-header">
		<h1><ion-icon name="person-circle-outline"></ion-icon> Identity</h1>
		<button class="btn btn-ghost" onclick={() => goto('/poker')}>Back</button>
	</div>

	<div class="card identity-card">
		<div class="user-info">
			<h2>{$auth.name || $auth.userId}</h2>
			<span class="badge badge-accent">Authenticated</span>
		</div>

		<div class="fingerprint-section">
			<span class="label-text">Public Key Fingerprint (SHA-256)</span>
			<code class="fingerprint">{fingerprint}</code>
			<p class="help-text">Verify this matches what other players see.</p>
		</div>
	</div>

	<div class="card notification-card">
		<h3><ion-icon name="notifications-outline"></ion-icon> Notifications</h3>
		<div class="notification-status">
			<span class="status-label">Status:</span>
			<span class="status-value" class:enabled={notificationEnabled}>{notificationStatus}</span>
		</div>
		{#if !notificationEnabled && notificationStatus !== 'Not supported'}
			<button class="btn btn-primary" onclick={enableNotifications}>
				<ion-icon name="notifications-outline"></ion-icon> Enable Notifications
			</button>
			<p class="help-text">Get notified when it's your turn to play or when you receive points.</p>
		{/if}
	</div>

	<div class="card backup-card">
		<h3><ion-icon name="shield-checkmark-outline"></ion-icon> Identity Backup</h3>
		<p>Your private key is stored in this browser. If you clear cookies/data, you lose access. <br><strong>Backup your key to survive a reset.</strong></p>
		
		{#if !showPrivateKey}
			<button class="btn btn-warning" onclick={revealPrivateKey}>
				Reveal Private Key
			</button>
		{:else}
			<div class="key-display">
				<textarea readonly value={privateKeyJson}></textarea>
				<button class="btn btn-primary" onclick={copyToClipboard}>
					{copyStatus || 'Copy to Clipboard'}
				</button>
				<button class="btn btn-ghost" onclick={() => showPrivateKey = false}>Hide</button>
			</div>
			<p class="warning-text">⚠️ DO NOT SHARE THIS KEY. Anyone with it can sign as you.</p>
		{/if}
	</div>
</div>

<style>
	.profile-page {
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

	.backup-card, .notification-card {
		padding: 24px;
	}

	.identity-card {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 20px;
	}
	.user-info {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.user-info h2 { font-size: 1.5rem; color: var(--gold); }

	.fingerprint-section {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.fingerprint-section .label-text {
		font-size: 0.75rem;
		text-transform: uppercase;
		color: var(--text-muted);
		font-weight: 700;
		letter-spacing: 0.05em;
	}
	.fingerprint {
		font-family: var(--font-mono);
		background: var(--bg-secondary);
		padding: 10px;
		border-radius: 6px;
		font-size: 0.8rem;
		word-break: break-all;
		color: var(--accent-light);
		border: 1px solid rgba(255,255,255,0.05);
	}
	.help-text { font-size: 0.75rem; color: var(--text-muted); }

	.backup-card {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 20px;
		border-color: rgba(234, 179, 8, 0.2);
	}
	.backup-card h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 1.1rem;
		color: var(--text-primary);
	}
	.backup-card p { font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; }

	.key-display {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	textarea {
		background: var(--bg-secondary);
		border: 1px solid rgba(255,255,255,0.1);
		border-radius: 6px;
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		padding: 10px;
		height: 100px;
		resize: none;
	}
	.warning-text {
		color: var(--danger);
		font-weight: 700;
		font-size: 0.8rem;
		text-align: center;
	}
</style>
