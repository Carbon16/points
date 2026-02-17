import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyToken } from '$lib/server/auth';
import { saveSubscription, removeSubscription, getVapidPublicKey } from '$lib/server/push';

function getAuthUser(request: Request) {
	const auth = request.headers.get('authorization');
	if (!auth?.startsWith('Bearer ')) return null;
	return verifyToken(auth.slice(7));
}

// GET /api/push — get VAPID public key
export const GET: RequestHandler = async () => {
	return json({ success: true, data: { publicKey: getVapidPublicKey() } });
};

// POST /api/push — subscribe
export const POST: RequestHandler = async ({ request }) => {
	const user = getAuthUser(request);
	if (!user) return json({ success: false, error: 'Unauthorized' }, { status: 401 });

	const { subscription } = await request.json();
	saveSubscription(user.userId, subscription);

	return json({ success: true });
};

// DELETE /api/push — unsubscribe
export const DELETE: RequestHandler = async ({ request }) => {
	const user = getAuthUser(request);
	if (!user) return json({ success: false, error: 'Unauthorized' }, { status: 401 });

	const { endpoint } = await request.json();
	removeSubscription(user.userId, endpoint);

	return json({ success: true });
};
