import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = './data/points.db'; // Adjust if needed
const db = new Database(DB_PATH);

console.log('--- Current Users in DB ---');
const users = db.prepare('SELECT id, name, public_key, encrypted_private_key FROM users').all();
console.table(users);

db.close();
