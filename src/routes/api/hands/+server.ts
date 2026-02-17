import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyToken } from '$lib/server/auth';
import { getDb } from '$lib/server/db';

function getAuthUser(request: Request) {
	const auth = request.headers.get('authorization');
	if (!auth?.startsWith('Bearer ')) return null;
	return verifyToken(auth.slice(7));
}

// GET /api/hands — retrieve hand history (optionally filtered by gameId)
export const GET: RequestHandler = async ({ url, request }) => {
	const user = getAuthUser(request);
	if (!user) return json({ success: false, error: 'Unauthorized' }, { status: 401 });

	const db = getDb();
	const gameId = url.searchParams.get('gameId');
	
	let query = 'SELECT * FROM hand_history ORDER BY timestamp DESC LIMIT 50';
	let params: any[] = [];
	
	if (gameId) {
		query = 'SELECT * FROM hand_history WHERE game_id = ? ORDER BY timestamp ASC';
		params = [gameId];
	}

	const hands = db.prepare(query).all(...params).map((h: any) => ({
		...h,
		signatures: JSON.parse(h.signatures)
	}));

	return json({ success: true, data: hands });
};

// POST /api/hands — store signed hand data
export const POST: RequestHandler = async ({ request }) => {
	const user = getAuthUser(request);
	if (!user) return json({ success: false, error: 'Unauthorized' }, { status: 401 });

	const { gameId, data, signature, timestamp } = await request.json(); // data is a JSON string of the hand summary

	if (!gameId || !data || !signature) {
		return json({ success: false, error: 'Missing fields' }, { status: 400 });
	}

	const db = getDb();
	
	const id = crypto.randomUUID();
	const signatures = JSON.stringify({ [user.userId]: signature });

	try {
		db.prepare(
			'INSERT INTO hand_history (id, game_id, data, signatures, timestamp) VALUES (?, ?, ?, ?, ?)'
		).run(id, gameId, typeof data === 'string' ? data : JSON.stringify(data), signatures, timestamp || Date.now());
	} catch (e) {
		return json({ success: false, error: 'Failed to store hand' }, { status: 500 });
	}

	return json({ success: true, data: { id } });
};
