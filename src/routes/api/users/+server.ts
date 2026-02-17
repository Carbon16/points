import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = async () => {
    const db = getDb();
    const users = db.prepare('SELECT id, name, public_key FROM users').all();
    return json({ success: true, data: users });
};
