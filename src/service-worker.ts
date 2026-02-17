/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

import { build, files, version } from '$service-worker';

const CACHE = `cache-${version}`;
const ASSETS = [...build, ...files];

// Install — cache all assets
self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
	);
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
		).then(() => self.clients.claim())
	);
});

// Fetch — cache first for assets, network first for API
self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);

	// Skip API calls and external requests from cache-first
	if (url.pathname.startsWith('/api/')) {
		event.respondWith(
			fetch(event.request).catch(() =>
				new Response(JSON.stringify({ success: false, error: 'Offline' }), {
					headers: { 'Content-Type': 'application/json' }
				})
			)
		);
		return;
	}

	// Cache-first for static assets
	if (ASSETS.includes(url.pathname)) {
		event.respondWith(
			caches.match(event.request).then((cached) => cached || fetch(event.request))
		);
		return;
	}

	// Network-first for pages
	event.respondWith(
		fetch(event.request)
			.then((response) => {
				const clone = response.clone();
				caches.open(CACHE).then((cache) => cache.put(event.request, clone));
				return response;
			})
			.catch(() => caches.match(event.request).then((cached) => cached || caches.match('/') as Promise<Response>))
	);
});

// Push notifications
self.addEventListener('push', (event) => {
	if (!event.data) return;

	const payload = event.data.json() as { title: string; body: string; url?: string };

	event.waitUntil(
		self.registration.showNotification(payload.title, {
			body: payload.body,
			icon: '/icons/icon-192.png',
			badge: '/icons/icon-192.png',
			data: { url: payload.url || '/' },
			vibrate: [200, 100, 200]
		})
	);
});

// Notification click — open the app
self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = (event.notification.data as { url?: string })?.url || '/';

	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
			const client = clients.find((c) => c.url.includes(url));
			if (client) return client.focus();
			return self.clients.openWindow(url);
		})
	);
});
