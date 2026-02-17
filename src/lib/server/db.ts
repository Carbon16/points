import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Use environment variable for production, fallback to relative path for dev
const DB_PATH = process.env.DATABASE_PATH || path.resolve(__dirname, '../../../../data/points.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
	if (!db) {
		const dir = path.dirname(DB_PATH);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		db = new Database(DB_PATH);
		db.pragma('journal_mode = WAL');
		db.pragma('foreign_keys = ON');

		db.exec(`
			CREATE TABLE IF NOT EXISTS blocks (
				idx INTEGER PRIMARY KEY,
				data TEXT NOT NULL
			);

			CREATE TABLE IF NOT EXISTS users (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				pin_hash TEXT NOT NULL,
				public_key TEXT,
				encrypted_private_key TEXT
			);

			CREATE TABLE IF NOT EXISTS point_requests (
				id TEXT PRIMARY KEY,
				requested_by TEXT NOT NULL,
				award_to TEXT NOT NULL,
				description TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'pending',
				approved_by TEXT NOT NULL DEFAULT '[]',
				signatures TEXT DEFAULT '{}',
				created_at INTEGER NOT NULL
			);

			CREATE TABLE IF NOT EXISTS push_subscriptions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id TEXT NOT NULL,
				subscription TEXT NOT NULL,
				created_at INTEGER NOT NULL DEFAULT (unixepoch())
			);

			CREATE TABLE IF NOT EXISTS game_actions (
				id TEXT PRIMARY KEY,
				game_id TEXT NOT NULL,
				hand_number INTEGER,
				user_id TEXT NOT NULL,
				action_type TEXT NOT NULL,
				amount INTEGER,
				signature TEXT NOT NULL,
				timestamp INTEGER
			);
			CREATE INDEX IF NOT EXISTS idx_actions_game ON game_actions(game_id);

			CREATE TABLE IF NOT EXISTS game_state (
				id TEXT PRIMARY KEY DEFAULT 'current',
				state TEXT NOT NULL,
				updated_at INTEGER NOT NULL DEFAULT (unixepoch())
			);
		`);

		// Migration: add public_key if missing
		try {
			db.prepare('ALTER TABLE users ADD COLUMN public_key TEXT').run();
		} catch (e) { /* ignore */ }

		try {
			db.prepare('ALTER TABLE users ADD COLUMN encrypted_private_key TEXT').run();
		} catch (e) { /* ignore */ }

		// Migration: add signatures if missing
		try {
			db.prepare('ALTER TABLE point_requests ADD COLUMN signatures TEXT DEFAULT \'{}\'').run();
		} catch (e) { /* ignore */ }

		db.exec(`
			CREATE TABLE IF NOT EXISTS hand_history (
				id TEXT PRIMARY KEY,
				game_id TEXT NOT NULL,
				data TEXT NOT NULL,
				signatures TEXT NOT NULL DEFAULT '{}',
				timestamp INTEGER NOT NULL
			);
		`);

		// Migration: add type to point_requests if missing
		try {
			db.prepare("ALTER TABLE point_requests ADD COLUMN type TEXT DEFAULT 'manual_point'").run();
		} catch (e) { /* ignore */ }

		// Migration: add amount to point_requests
		try {
			db.prepare("ALTER TABLE point_requests ADD COLUMN amount REAL DEFAULT 1.0").run();
		} catch (e) { /* ignore */ }
	}
	return db;
}

export function saveGameAction(action: {
	id: string;
	game_id: string;
	hand_number: number;
	user_id: string;
	action_type: string;
	amount?: number;
	signature: string;
	timestamp: number;
}) {
	const db = getDb();
	db.prepare(`
		INSERT INTO game_actions (id, game_id, hand_number, user_id, action_type, amount, signature, timestamp)
		VALUES (@id, @game_id, @hand_number, @user_id, @action_type, @amount, @signature, @timestamp)
	`).run(action);
}
