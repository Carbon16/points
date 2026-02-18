<script lang="ts">
	import '../app.css';
	import { auth } from '$lib/stores/auth';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	import { onMount } from 'svelte';
	import { initPush } from '$lib/push-client';

	let { children } = $props();

	// Pull-to-refresh state
	let pullStartY = $state(0);
	let pullDistance = $state(0);
	let isPulling = $state(false);
	let isRefreshing = $state(false);
	let isStandalone = $state(false);
	const PULL_THRESHOLD = 80;

	onMount(() => {
		isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
	});

	const navItems = [
		{ href: '/', label: 'Dashboard', icon: '<ion-icon name="home-outline"></ion-icon>' },
		{ href: '/casino', label: 'Casino', icon: '<ion-icon name="wallet-outline"></ion-icon>' },
		{ href: '/approve', label: 'Approve', icon: '<ion-icon name="checkmark-circle-outline"></ion-icon>' },
		{ href: '/chain', label: 'Chain', icon: '<ion-icon name="link-outline"></ion-icon>' }
	];

	function handleLogout() {
		auth.logout();
		goto('/login');
	}

	onMount(async () => {
		if ('serviceWorker' in navigator && $auth.token) {
			try {
				await navigator.serviceWorker.register('/service-worker.js');
				// Note: Notification permission is now requested from Profile page
				// iOS requires permission requests to come from user gestures
			} catch (e) {
				console.error('SW Error', e);
			}
		}

		// Attempt to lock screen orientation to portrait when possible.
		// This works on many modern mobile browsers; it will silently fail where unsupported.
		// Most browsers require fullscreen mode for this to work, so we primarily target standalone (PWA) mode.
		if (isStandalone) {
			try {
				if ((screen as any)?.orientation?.lock) {
					await (screen as any).orientation.lock('portrait-primary');
				} else {
					const lockFn = (screen as any).lockOrientation || (screen as any).mozLockOrientation || (screen as any).msLockOrientation;
					if (lockFn) lockFn('portrait-primary');
				}
			} catch (err: any) {
				// Silently fail for "Insecure" errors as they are common browser limitations
				if (err.name !== 'NotAllowedError' && err.name !== 'SecurityError') {
					console.warn('Orientation lock unavailable:', err.message);
				}
			}
		}
	});

	function handleTouchStart(e: TouchEvent) {
		if (isStandalone && window.scrollY === 0 && !isRefreshing) {
			pullStartY = e.touches[0].clientY;
			isPulling = true;
		}
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isPulling || isRefreshing) return;
		const currentY = e.touches[0].clientY;
		const distance = Math.max(0, currentY - pullStartY);
		pullDistance = Math.min(distance * 0.5, PULL_THRESHOLD + 20); // Damping effect
	}

	async function handleTouchEnd() {
		if (!isPulling || isRefreshing) return;
		isPulling = false;

		if (pullDistance >= PULL_THRESHOLD) {
			isRefreshing = true;
			await new Promise(resolve => setTimeout(resolve, 300)); // Brief delay for UX
			window.location.reload();
		} else {
			pullDistance = 0;
		}
	}
</script>

{#if !$auth.token}
	{@render children()}
{:else}
	<div class="app-shell" 
		role="region"
		aria-label="Main Application"
		ontouchstart={handleTouchStart} 
		ontouchmove={handleTouchMove} 
		ontouchend={handleTouchEnd}>
		
		<!-- Pull-to-refresh indicator -->
		{#if pullDistance > 0 || isRefreshing}
			<div class="pull-indicator" style="opacity: {Math.min(pullDistance / PULL_THRESHOLD, 1)}; transform: translateX(-50%) translateY({Math.min(pullDistance, PULL_THRESHOLD)}px)">
				<div class="spinner" class:spinning={isRefreshing || pullDistance >= PULL_THRESHOLD}></div>
			</div>
		{/if}

		<main class="app-content" style="transform: translateY({pullDistance}px); transition: {isPulling ? 'none' : 'transform 0.3s ease'}">
			{@render children()}
		</main>

		<nav class="bottom-nav">
			{#each navItems as item}
				<a
					href={item.href}
					class="nav-item"
					class:active={$page.url.pathname === item.href}
				>
					<span class="nav-icon">{@html item.icon}</span>
					<span class="nav-label">{item.label}</span>
				</a>
			{/each}
		</nav>
	</div>
{/if}

<style>
	.app-shell {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		max-width: 480px;
		margin: 0 auto;
		position: relative;
		overflow: hidden;
	}

	.pull-indicator {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		pointer-events: none;
	}

	.spinner {
		width: 24px;
		height: 24px;
		border: 3px solid rgba(255, 255, 255, 0.2);
		border-top-color: var(--accent);
		border-radius: 50%;
		transition: transform 0.3s ease;
	}

	.spinner.spinning {
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		100% { transform: rotate(360deg); }
	}

	.app-content {
		flex: 1;
		padding: 20px 16px;
		padding-bottom: 80px;
		overflow-y: auto;
	}


	.bottom-nav {
		position: fixed;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 100%;
		max-width: 480px;
		display: flex;
		background: rgba(18, 18, 42, 0.95);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		padding: 8px 0;
		padding-bottom: calc(8px + env(safe-area-inset-bottom));
		z-index: 100;
	}

	.nav-item {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 8px 4px;
		color: var(--text-muted);
		text-decoration: none;
		transition: all var(--transition);
		border-radius: var(--radius-sm);
	}
	.nav-item:hover { color: var(--text-secondary); }
	.nav-item.active {
		color: var(--accent-light);
	}
	.nav-item.active .nav-icon {
		transform: scale(1.1);
	}

	.nav-icon {
		font-size: 1.3rem;
		transition: transform var(--transition);
	}
	.nav-label {
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
</style>
