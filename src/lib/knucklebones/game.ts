import type { KnucklebonesGameState, KnucklebonesPlayerState, KnucklebonesAction } from '$lib/types';
import crypto from 'node:crypto';

export function createGame(player1Id: string, player1Name: string, player2Id: string, player2Name: string, stakes: 'full' | 'half' | 'none' = 'full'): KnucklebonesGameState {
	return {
		id: crypto.randomUUID(),
		phase: 'waiting',
		players: [
			{
				id: player1Id,
				name: player1Name,
				board: [[null, null, null], [null, null, null], [null, null, null]],
                score: 0,
                columnScores: [0, 0, 0]
			},
			{
				id: player2Id,
				name: player2Name,
				board: [[null, null, null], [null, null, null], [null, null, null]],
                score: 0,
                columnScores: [0, 0, 0]
			}
		],
        currentPlayerIndex: 0,
        currentRoll: null,
        stakes
	};
}

export function joinGame(game: KnucklebonesGameState, playerId: string, playerName: string): KnucklebonesGameState {
	if (game.phase !== 'waiting') throw new Error('Game already started');
	
	const emptySlotIndex = game.players.findIndex(p => p.id === 'waiting');
	if (emptySlotIndex === -1) throw new Error('Game is full');

	game.players[emptySlotIndex].id = playerId;
	game.players[emptySlotIndex].name = playerName;
	game.phase = 'playing';
    
    // Initial roll for player 1
    game.currentRoll = rollDie();

	return game;
}

function rollDie(): number {
    const buffer = new Uint8Array(1);
    let rand;
    do {
        crypto.getRandomValues(buffer);
        rand = buffer[0];
    } while (rand >= 252); // Keep it evenly divisible by 6 (252 is 42 * 6)
    return (rand % 6) + 1;
}

export function calculateBoardScore(board: (number | null)[][]): { total: number, columns: number[] } {
    const columns = [0, 0, 0];
    let total = 0;

    for (let col = 0; col < 3; col++) {
        const counts = new Map<number, number>();
        for (let row = 0; row < 3; row++) {
            const val = board[col][row];
            if (val !== null) {
                 counts.set(val, (counts.get(val) || 0) + 1);
            }
        }

        let colScore = 0;
        for (const [val, count] of counts.entries()) {
             colScore += val * count * count;
        }
        
        columns[col] = colScore;
        total += colScore;
    }

    return { total, columns };
}

export function performAction(game: KnucklebonesGameState, playerId: string, action: KnucklebonesAction, colIndex?: number): KnucklebonesGameState {
	const playerIndex = game.players.findIndex((p) => p.id === playerId);
	if (playerIndex === -1) throw new Error('Player not in game');
    if (playerIndex !== game.currentPlayerIndex) throw new Error('Not your turn');
    if (game.phase !== 'playing') throw new Error('Game is not playing');

    const player = game.players[playerIndex];
    const opponent = game.players[1 - playerIndex];

    if (action === 'roll') {
        if (game.currentRoll !== null) throw new Error('Already rolled');
        game.currentRoll = rollDie();
	} else if (action === 'place') {
        if (game.currentRoll === null) throw new Error('Must roll first');
        if (colIndex === undefined || colIndex < 0 || colIndex > 2) throw new Error('Invalid column');

        // Find empty spot in column
        let placedRow = -1;
        for (let row = 0; row < 3; row++) {
             if (player.board[colIndex][row] === null) {
                 placedRow = row;
                 break;
             }
        }

        if (placedRow === -1) throw new Error('Column is full');

        // Place die
        const placedValue = game.currentRoll;
        player.board[colIndex][placedRow] = placedValue;

        // Destroy opponent's dice in parallel column (max 2)
        let removedCount = 0;
        for (let row = 0; row < 3; row++) {
             if (opponent.board[colIndex][row] === placedValue && removedCount < 2) {
                  opponent.board[colIndex][row] = null;
                  removedCount++;
             }
        }
        
        // Compact opponent's column (gravity)
        const compactCol: (number | null)[] = opponent.board[colIndex].filter(v => v !== null);
        while (compactCol.length < 3) compactCol.push(null); // Pad with nulls
        
        // Convert to (number | null)[] specifically if needed?
        // Let's just assign it safely
        for(let i = 0; i < 3; i++) {
             opponent.board[colIndex][i] = (compactCol[i] !== undefined ? compactCol[i] : null) as number | null;
        }

        // Update scores
        const pScores = calculateBoardScore(player.board);
        player.score = pScores.total;
        player.columnScores = pScores.columns;

        const oScores = calculateBoardScore(opponent.board);
        opponent.score = oScores.total;
        opponent.columnScores = oScores.columns;

        game.currentRoll = null;

        // Check for game over (any board is full)
        if (checkGameOver(player.board)) {
             game.phase = 'complete';
             if (player.score > opponent.score) game.winnerId = player.id;
             else if (opponent.score > player.score) game.winnerId = opponent.id;
             else game.winnerId = 'draw'; // Not an ID, but indicates draw
        } else {
             game.currentPlayerIndex = 1 - game.currentPlayerIndex;
             // Auto roll for next player
             game.currentRoll = rollDie();
        }
    }

	return game;
}

function checkGameOver(board: (number | null)[][]): boolean {
     for (let col = 0; col < 3; col++) {
         for (let row = 0; row < 3; row++) {
             if (board[col][row] === null) return false;
         }
     }
     return true;
}

export function isGameOver(game: KnucklebonesGameState): { over: boolean; winner?: string; loser?: string } {
	if (game.phase === 'complete') {
        if (game.winnerId === 'draw') return { over: true };
        
        const winner = game.players.find(p => p.id === game.winnerId);
        const loser = game.players.find(p => p.id !== game.winnerId);
		return { over: true, winner: winner?.id, loser: loser?.id };
	}

	return { over: false };
}
