import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getDb } from './db';
import type { User } from '$lib/types';

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_key'; // In production, use a secure env variable

// Two hardcoded users — set names via env vars or defaults
const USERS: User[] = [
	{ id: 'player1', name: process.env.PLAYER1_NAME || 'Player 1' },
	{ id: 'player2', name: process.env.PLAYER2_NAME || 'Player 2' }
];

function hashPin(pin: string): string {
	return crypto.createHash('sha256').update(pin).digest('hex');
}

export function getUsers(): User[] {
	const db = getDb();
	const users = db.prepare('SELECT id, name, public_key FROM users').all() as { id: string; name: string; public_key: string }[];
	
	// Merge hardcoded names incase they change via env, but prefer DB for public key
	return USERS.map(u => {
		const dbUser = users.find(du => du.id === u.id);
		return { ...u, publicKey: dbUser?.public_key };
	});
}

export function setupUser(userId: string, pin: string, publicKey?: string): boolean {
	const user = USERS.find((u) => u.id === userId);
	if (!user) return false;

	const db = getDb();
	const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
	if (existing) return false; // already set up

	db.prepare('INSERT INTO users (id, name, pin_hash, public_key) VALUES (?, ?, ?, ?)').run(
		userId,
		user.name,
		hashPin(pin),
		publicKey || null
	);
	return true;
}

export function login(userId: string, pin: string, publicKey?: string): string | null {
	const db = getDb();
	const row = db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(userId) as
		| { pin_hash: string }
		| undefined;

	if (!row) {
		// User not set up yet — auto-setup
		const user = USERS.find((u) => u.id === userId);
		if (!user) return null;
		setupUser(userId, pin, publicKey);
		return jwt.sign({ userId, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
	}

	if (row.pin_hash !== hashPin(pin)) return null;

	const user = USERS.find((u) => u.id === userId)!;
	return jwt.sign({ userId, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): { userId: string; name: string } | null {
	try {
		return jwt.verify(token, JWT_SECRET) as { userId: string; name: string };
	} catch {
		return null;
	}
}

export function isSetup(userId: string): boolean {
	const db = getDb();
	const row = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
	return !!row;
}
