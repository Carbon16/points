import { getAuthHeaders } from './stores/auth';

function urlBase64ToUint8Array(base64String: string) {
	const padding = '='.repeat((4 - base64String.length % 4) % 4);
	const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
	const rawData = window.atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}

export async function initPush(token: string) {
	if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
		console.log('Push messaging isn\'t supported.');
		return;
	}

	try {
		// Register Service Worker
		const registration = await navigator.serviceWorker.ready;
		
		// Get VAPID Key from server
		const res = await fetch('/api/push', {
			headers: getAuthHeaders(token)
		});
		const data = await res.json();
		if (!data.success) throw new Error('Failed to get VAPID key');
		
		const vapidPublicKey = data.data.publicKey;
		const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

		// Subscribe
		const subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: convertedVapidKey
		});

		// Send subscription to server
		await fetch('/api/push', {
			method: 'POST',
			headers: {
				...getAuthHeaders(token),
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ subscription })
		});

		console.log('Push notification subscribed!');
	} catch (error) {
		console.error('Push registration failed:', error);
	}
}
