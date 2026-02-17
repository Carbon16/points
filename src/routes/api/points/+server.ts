import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyToken } from '$lib/server/auth';
import { addBlock, getScoreboard, getPointsForUser } from '$lib/blockchain/chain';
import { getDb } from '$lib/server/db';
import { notifyOtherUser } from '$lib/server/push';
import type { PointRequest } from '$lib/types';

function getAuthUser(request: Request) {
	const auth = request.headers.get('authorization');
	if (!auth?.startsWith('Bearer ')) return null;
	return verifyToken(auth.slice(7));
}

// GET /api/points — get scoreboard
export const GET: RequestHandler = async () => {
	const scores = getScoreboard();
	return json({ success: true, data: scores });
};

// POST /api/points — record a poker win
export const POST: RequestHandler = async ({ request }) => {
	const user = getAuthUser(request);
	if (!user) return json({ success: false, error: 'Unauthorized' }, { status: 401 });

	const requestData = await request.json();
	const { type, winnerId, loserId, description } = requestData;

	if (type === 'poker_win') {
		const block = addBlock({
			type: 'poker_win',
			winner: winnerId,
			loser: loserId,
			approvedBy: [winnerId, loserId],
			timestamp: Date.now()
		});
		return json({ success: true, data: block });
	}

	if (type === 'manual_point') {
		// Create a pending request
		const id = crypto.randomUUID();
		const db = getDb();
		const timestamp = requestData.timestamp || Date.now();
		const signatures = requestData.signature ? { [user.userId]: requestData.signature } : {};
		const amount = parseFloat(requestData.amount) || 1.0;

		db.prepare(
			'INSERT INTO point_requests (id, requested_by, award_to, description, status, approved_by, signatures, created_at, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
		).run(id, user.userId, winnerId, description || 'Manual point', 'pending', JSON.stringify([user.userId]), JSON.stringify(signatures), timestamp, amount);

		await notifyOtherUser(user.userId, {
			title: 'Point Request',
			body: `${user.name} wants to award ${amount} point(s) to ${winnerId}: ${description || 'Manual point'}`,
			url: '/approve'
		});

		return json({ success: true, data: { id, status: 'pending' } });
	}

	if (type === 'spend') {
		const id = crypto.randomUUID();
		const db = getDb();
		const timestamp = requestData.timestamp || Date.now();
		const signatures = requestData.signature ? { [user.userId]: requestData.signature } : {};
		const amount = parseFloat(requestData.amount) || 1.0;

		// ENFORCEMENT: Check balance
		const currentBalance = getPointsForUser(user.userId);
		if (currentBalance < amount) {
			return json({ success: false, error: `Insufficient points. You have ${currentBalance} and tried to spend ${amount}.` }, { status: 403 });
		}

		db.prepare(
			'INSERT INTO point_requests (id, requested_by, award_to, description, status, approved_by, signatures, created_at, type, amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
		).run(id, user.userId, user.userId, description || 'Spend', 'pending', JSON.stringify([user.userId]), JSON.stringify(signatures), timestamp, 'spend', amount);

		await notifyOtherUser(user.userId, {
			title: 'Spend Request',
			body: `${user.name} wants to spend ${amount} point(s): ${description || 'Spend'}`,
			url: '/approve'
		});

		return json({ success: true, data: { id, status: 'pending' } });
	}

	return json({ success: false, error: 'Invalid type' }, { status: 400 });
};
