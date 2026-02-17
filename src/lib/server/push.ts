import webPush from 'web-push';
import { getDb } from './db';

// Generate VAPID keys if not set
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:points@example.com';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
	webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export function getVapidPublicKey(): string {
	return VAPID_PUBLIC;
}

export function saveSubscription(userId: string, subscription: webPush.PushSubscription): void {
	const db = getDb();
	// Remove any existing subscription for this endpoint
	db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND json_extract(subscription, \'$.endpoint\') = ?')
		.run(userId, subscription.endpoint);
	db.prepare('INSERT INTO push_subscriptions (user_id, subscription) VALUES (?, ?)').run(
		userId,
		JSON.stringify(subscription)
	);
}

export function removeSubscription(userId: string, endpoint: string): void {
	const db = getDb();
	db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND json_extract(subscription, \'$.endpoint\') = ?')
		.run(userId, endpoint);
}

export async function sendNotification(userId: string, payload: { title: string; body: string; url?: string }): Promise<void> {
	if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

	const db = getDb();
	const rows = db.prepare('SELECT subscription FROM push_subscriptions WHERE user_id = ?').all(userId) as { subscription: string }[];

	const promises = rows.map(async (row) => {
		try {
			await webPush.sendNotification(
				JSON.parse(row.subscription),
				JSON.stringify(payload)
			);
		} catch (err: unknown) {
			// Remove expired/invalid subscriptions
			const error = err as { statusCode?: number };
			if (error.statusCode === 410 || error.statusCode === 404) {
				const sub = JSON.parse(row.subscription);
				removeSubscription(userId, sub.endpoint);
			}
		}
	});

	await Promise.allSettled(promises);
}

export async function notifyOtherUser(fromUserId: string, payload: { title: string; body: string; url?: string }): Promise<void> {
	const otherUser = fromUserId === 'player1' ? 'player2' : 'player1';
	await sendNotification(otherUser, payload);
}
