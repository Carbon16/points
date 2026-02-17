import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChain } from '$lib/blockchain/chain';

export const GET: RequestHandler = async () => {
	const chain = getChain();
	return json({ success: true, data: chain });
};
