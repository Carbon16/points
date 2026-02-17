import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyToken } from '$lib/server/auth';
import { addBlock } from '$lib/blockchain/chain';
import { getDb } from '$lib/server/db';
import { notifyOtherUser } from '$lib/server/push';

function getAuthUser(request: Request) {
	const auth = request.headers.get('authorization');
	if (!auth?.startsWith('Bearer ')) return null;
	return verifyToken(auth.slice(7));
}

// GET /api/points/pending — get pending requests
export const GET: RequestHandler = async ({ request }) => {
	const user = getAuthUser(request);
	if (!user) return json({ success: false, error: 'Unauthorized' }, { status: 401 });

	const db = getDb();
	const rows = db.prepare('SELECT * FROM point_requests WHERE status = ?').all('pending');
	const requests = rows.map((r: Record<string, unknown>) => ({
		...r,
		approved_by: JSON.parse(r.approved_by as string)
	}));

	return json({ success: true, data: requests });
};

// POST /api/points/pending — approve a pending request
export const POST: RequestHandler = async ({ request }) => {
	const user = getAuthUser(request);
	if (!user) return json({ success: false, error: 'Unauthorized' }, { status: 401 });

	const requestData = await request.json();
	const { requestId, action } = requestData;
	const db = getDb();

	const row = db.prepare('SELECT * FROM point_requests WHERE id = ?').get(requestId) as Record<string, unknown> | undefined;
	if (!row) return json({ success: false, error: 'Request not found' }, { status: 404 });
	if (row.status !== 'pending') return json({ success: false, error: 'Already processed' }, { status: 400 });

	if (action === 'reject') {
		db.prepare('UPDATE point_requests SET status = ? WHERE id = ?').run('rejected', requestId);
		await notifyOtherUser(user.userId, {
			title: 'Point Rejected',
			body: `${user.name} rejected the point request`,
			url: '/approve'
		});
		return json({ success: true, data: { status: 'rejected' } });
	}

	// Approve
	const approvedBy = JSON.parse(row.approved_by as string || '[]');
	if (!approvedBy.includes(user.userId)) {
		approvedBy.push(user.userId);
	}

	// Merge signatures
	const signatures = JSON.parse(row.signatures as string || '{}');
	if (requestData.signature) {
		signatures[user.userId] = requestData.signature;
	}

	// Both must approve
	if (approvedBy.length >= 2) {
		db.prepare('UPDATE point_requests SET status = ?, approved_by = ?, signatures = ? WHERE id = ?')
			.run('approved', JSON.stringify(approvedBy), JSON.stringify(signatures), requestId);

		// Mine into blockchain
		// Mine into blockchain
		addBlock({
			type: (row.type as any) || 'manual_point',
			winner: row.award_to as string,
			description: row.description as string,
			approvedBy,
			timestamp: row.created_at as number,
			signatures,
			amount: (row.amount as number) || 1
		});

		await notifyOtherUser(user.userId, {
			title: 'Point Approved!',
			body: `Point recorded on blockchain: ${row.description}`,
			url: '/'
		});

		return json({ success: true, data: { status: 'approved', mined: true } });
	} else {
		db.prepare('UPDATE point_requests SET approved_by = ?, signatures = ? WHERE id = ?')
			.run(JSON.stringify(approvedBy), JSON.stringify(signatures), requestId);
		return json({ success: true, data: { status: 'pending', approvedBy } });
	}
};
