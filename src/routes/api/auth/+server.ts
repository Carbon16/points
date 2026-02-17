import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { login, getUsers, isSetup } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request }) => {
	const { userId, pin, publicKey } = await request.json();
	if (!userId || !pin) {
		return json({ success: false, error: 'Missing userId or pin' }, { status: 400 });
	}

	const token = login(userId, pin, publicKey);
	if (!token) {
		return json({ success: false, error: 'Invalid credentials' }, { status: 401 });
	}

	return json({ success: true, data: { token, userId } });
};

export const GET: RequestHandler = async () => {
	const users = getUsers().map((u) => ({
		...u,
		isSetup: isSetup(u.id)
	}));
	return json({ success: true, data: users });
};
