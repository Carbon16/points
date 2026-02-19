import { getDb } from './src/lib/server/db';
import fs from 'fs';

const db = getDb();
let output = '--- INVESTIGATION: FLUSH HAND ---\n';

try {
    const gameId = '2d707a2e-3f92-4f5a-9452-4d0c8d2d21d3';
    
    // 1. Get Game Actions
    output += `\n--- GAME ACTIONS (${gameId}) ---\n`;
    const actions = db.prepare('SELECT * FROM game_actions WHERE game_id = ? ORDER BY timestamp ASC').all(gameId);
    output += JSON.stringify(actions, null, 2) + '\n';

    // 2. Check for any other potentially relevant error data
    // (Searching for "error" in text columns of relevant tables)
    // output += `\n--- SEARCHING FOR ERRORS ---\n`;
    // const potentialErrors = db.prepare("SELECT * FROM hand_history WHERE data LIKE '%error%'").all();
    // output += JSON.stringify(potentialErrors, null, 2);

} catch (e) {
    output += `Error querying DB: ${e}\n`;
}

fs.writeFileSync('db_investigation.txt', output);
console.log('Dumped to db_investigation.txt');
