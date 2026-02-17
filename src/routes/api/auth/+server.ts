import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { login, getUsers, isSetup, verifyToken } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request }) => {
	const { userId, pin, publicKey, encryptedPrivateKey } = await request.json();
	if (!userId || !pin) {
		return json({ success: false, error: 'Missing userId or pin' }, { status: 400 });
	}

	const result = login(userId, pin, publicKey, encryptedPrivateKey);
	if (!result) {
		return json({ success: false, error: 'Invalid credentials' }, { status: 401 });
	}

	return json({ success: true, data: { 
		token: result.token, 
		userId, 
		name: result.name,
		encryptedPrivateKey: result.encryptedPrivateKey 
	} });
};

export const GET: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('authorization');
	const isAuthenticated = authHeader?.startsWith('Bearer ') && verifyToken(authHeader.slice(7));

	const users = getUsers().map((u) => ({
		id: u.id,
		name: isAuthenticated ? u.name : (u.id === 'player1' ? 'Player 1' : 'Player 2'),
		isSetup: isSetup(u.id)
	}));
	return json({ success: true, data: users });
};
