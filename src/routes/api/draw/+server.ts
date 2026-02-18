import { json } from '@sveltejs/kit';
import { getDb, saveGameAction } from '$lib/server/db';
import { verifyToken } from '$lib/server/auth';
import { addBlock, getPointsForUser } from '$lib/blockchain/chain';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const MANIFEST_PATH = path.resolve(process.cwd(), 'manifest.json');

function verifyServerSignature(publicKey: string, data: string, signature: string): boolean {
    try {
        const pubKey = crypto.createPublicKey({
            key: Buffer.from(publicKey, 'base64'),
            format: 'der',
            type: 'spki'
        });
        
        return crypto.verify(
            'sha256',
            Buffer.from(data),
            {
                key: pubKey,
                dsaEncoding: 'ieee-p1363'
            },
            Buffer.from(signature, 'base64')
        );
    } catch (e) {
        console.error('Signature verification error:', e);
        return false;
    }
}

function getManifest() {
    if (!fs.existsSync(MANIFEST_PATH)) return {};
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
}

function updateManifest(action: string, category: string, content: string) {
    const manifest = getManifest();
    if (!manifest[category]) return;
    
    if (action === 'add') {
        if (!manifest[category].cards.includes(content)) {
            manifest[category].cards.push(content);
        }
    } else if (action === 'remove') {
        manifest[category].cards = manifest[category].cards.filter((c: string) => c !== content);
    }
    
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

interface DrawRecord {
    id: string;
    user_id: string;
    drawn_at: number;
    expires_at: number;
    is_visible: number;
    completed_by: string;
    metadata: string;
    creator_name?: string;
}

interface CardRecord {
    id: string;
    draw_id: string;
    type: string;
    card_content: string;
    metadata: string;
}

export async function GET({ request, cookies }) {
    const token = cookies.get('token');
    const authHeader = request.headers.get('Authorization');
    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const actualToken = headerToken || token;

    if (!actualToken) return json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = verifyToken(actualToken);
    if (!decoded) return json({ error: 'Invalid token' }, { status: 401 });

    const db = getDb();
    const now = Date.now();

    // Fetch ALL draws joined with user names
    const draws = db.prepare(`
        SELECT d.*, u.name as creator_name
        FROM draws d
        JOIN users u ON d.user_id = u.id
        WHERE d.expires_at > ?
        ORDER BY d.drawn_at DESC
    `).all(now) as DrawRecord[];

    const result = [];
    for (const draw of draws) {
        const cards = db.prepare(`SELECT * FROM drawn_cards WHERE draw_id = ?`).all(draw.id) as CardRecord[];
        result.push({
            ...draw,
            is_visible: Boolean(draw.is_visible),
            completed_by: JSON.parse(draw.completed_by),
            metadata: JSON.parse(draw.metadata),
            cards: cards.map(c => ({
                ...c,
                metadata: JSON.parse(c.metadata)
            }))
        });
    }

    // Fetch pending card requests
    const cardRequests = db.prepare(`
        SELECT cr.*, u.name as requester_name
        FROM card_requests cr
        JOIN users u ON cr.requested_by = u.id
        WHERE cr.status = 'pending'
        ORDER BY cr.created_at DESC
    `).all() as any[];

    return json({ 
        manifest: getManifest(),
        draws: result,
        cardRequests: cardRequests.map(r => ({ ...r, approved_by: JSON.parse(r.approved_by) }))
    });
}

export async function POST({ request, cookies }) {
    const token = cookies.get('token');
    const authHeader = request.headers.get('Authorization');
    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const actualToken = headerToken || token;

    if (!actualToken) return json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = verifyToken(actualToken);
    if (!decoded) return json({ error: 'Invalid token' }, { status: 401 });
    const userId = decoded.userId;

    const { action, payload } = await request.json();
    const db = getDb();

    if (action === 'play') {
        const { quantities, hideResult, signature, timestamp } = payload; 
        
        // 1. Balance Check
        const balance = getPointsForUser(userId);
        if (balance < 1) {
            return json({ error: 'Insufficient balance. You need at least 1 point to draw.' }, { status: 403 });
        }

        // 2. Signature Verification (if provided)
        if (signature && timestamp) {
            const dbUser = db.prepare('SELECT public_key FROM users WHERE id = ?').get(userId) as { public_key: string } | undefined;
            if (dbUser?.public_key) {
                const dataToSign = `draw_spend:${userId}:${timestamp}:1`;
                const isValid = verifyServerSignature(dbUser.public_key, dataToSign, signature);
                if (!isValid) {
                    return json({ error: 'Invalid cryptographic signature' }, { status: 401 });
                }
            }
        } else {
            // For now, allow without signature if not provided, but we'll enforce it later once UI is ready
            // actually, let's just log it for now
            console.warn(`Draw requested without signature from ${userId}`);
        }

        const manifest = getManifest();
        const selection: Record<string, string[]> = {};

        for (const [type, qty] of Object.entries(quantities) as [string, number][]) {
            if (qty <= 0) continue;
            const config = manifest[type];
            if (!config) return json({ error: `Invalid type: ${type}` }, { status: 400 });
            
            // Validate limits
            if (config.max > 0 && qty > config.max) return json({ error: `Too many items for ${type}` }, { status: 400 });
            if (qty < config.min) return json({ error: `Not enough items for ${type}` }, { status: 400 });
            
            // Ensure we have enough cards in the pool for unique draw
            if (qty > config.cards.length) {
                return json({ error: `Not enough unique cards available for ${type} (Requested: ${qty}, Available: ${config.cards.length})` }, { status: 400 });
            }

            // Fisher-Yates shuffle the available cards
            const shuffled = [...config.cards];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = crypto.randomInt(0, i + 1);
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            
            // Take the first N cards
            selection[type] = shuffled.slice(0, qty);
        }

        if (Object.keys(selection).length === 0) return json({ error: 'No items selected' }, { status: 400 });

        const drawId = crypto.randomUUID();
        const now = Date.now();
        const expiresAt = now + (7 * 24 * 60 * 60 * 1000);
        
        db.prepare(`
            INSERT INTO draws (id, user_id, drawn_at, expires_at, is_visible, completed_by, metadata)
            VALUES (?, ?, ?, ?, ?, '[]', '{}')
        `).run(drawId, userId, now, expiresAt, hideResult ? 0 : 1);

        const createdCards = [];
        for (const [type, items] of Object.entries(selection)) {
            const config = manifest[type];
            for (const item of items) {
                const cardId = crypto.randomUUID();
                const cardMetadata = JSON.stringify({
                    icon: config.icon,
                    colour: config.colour,
                    font: config.font
                });
                
                db.prepare(`
                    INSERT INTO drawn_cards (id, draw_id, type, card_content, metadata)
                    VALUES (?, ?, ?, ?, ?)
                `).run(cardId, drawId, type, item, cardMetadata);
                
                createdCards.push({
                    id: cardId,
                    type,
                    card_content: item,
                    metadata: JSON.parse(cardMetadata)
                });
            }
        }

        saveGameAction({
            id: crypto.randomUUID(),
            game_id: 'draw_' + Date.now(),
            hand_number: 0,
            user_id: userId,
            action_type: 'draw_spend',
            amount: -1,
            signature: signature || 'signed_at_reveal',
            timestamp: now
        });

        // 3. Record on Blockchain
        addBlock({
            type: 'spend',
            winner: userId,
            amount: 1,
            description: 'Draw Hand',
            timestamp: now,
            approvedBy: [userId],
            signatures: signature ? { [userId]: signature } : {}
        });

        return json({ 
            success: true, 
            draw: {
                id: drawId,
                user_id: userId,
                drawn_at: now,
                expires_at: expiresAt,
                is_visible: !hideResult,
                completed_by: [],
                cards: createdCards
            }
        });
    }

    if (action === 'reveal') {
        const { drawId } = payload;
        const draw = db.prepare('SELECT * FROM draws WHERE id = ?').get(drawId) as DrawRecord | undefined;
        if (!draw) return json({ error: 'Draw not found' }, { status: 404 });
        if (draw.user_id !== userId) return json({ error: 'Not your draw' }, { status: 403 });
        
        db.prepare('UPDATE draws SET is_visible = 1 WHERE id = ?').run(drawId);
        return json({ success: true });
    }

    if (action === 'complete') {
        const { drawId } = payload;
        const draw = db.prepare('SELECT * FROM draws WHERE id = ?').get(drawId) as DrawRecord | undefined;
        if (!draw) return json({ error: 'Draw not found' }, { status: 404 });
        
        const completedBy = JSON.parse(draw.completed_by || '[]');
        if (!completedBy.includes(userId)) {
            completedBy.push(userId);
            db.prepare('UPDATE draws SET completed_by = ? WHERE id = ?').run(JSON.stringify(completedBy), drawId);
        }
        
        return json({ success: true, completedBy });
    }

    if (action === 'request_card_change') {
        const { action: cardAction, category, cardContent } = payload;
        const requestId = crypto.randomUUID();
        db.prepare(`
            INSERT INTO card_requests (id, requested_by, action, category, card_content, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(requestId, userId, cardAction, category, cardContent, Date.now());
        return json({ success: true });
    }

    if (action === 'approve_card_change') {
        const { requestId } = payload;
        const request = db.prepare('SELECT * FROM card_requests WHERE id = ?').get(requestId) as any;
        if (!request) return json({ error: 'Request not found' }, { status: 404 });
        
        const approvedBy = JSON.parse(request.approved_by || '[]');
        if (!approvedBy.includes(userId)) {
            approvedBy.push(userId);
            db.prepare('UPDATE card_requests SET approved_by = ? WHERE id = ?').run(JSON.stringify(approvedBy), requestId);
            
            if (approvedBy.length >= 2) {
                updateManifest(request.action, request.category, request.card_content);
                db.prepare("UPDATE card_requests SET status = 'approved' WHERE id = ?").run(requestId);
            }
        }
        return json({ success: true });
    }

    if (action === 'redraw') {
        const { drawId, cardId } = payload;
        const draw = db.prepare('SELECT * FROM draws WHERE id = ?').get(drawId) as DrawRecord | undefined;
        if (!draw) return json({ error: 'Draw not found' }, { status: 404 });
        if (draw.user_id !== userId) return json({ error: 'Not your draw' }, { status: 403 });

        const card = db.prepare('SELECT * FROM drawn_cards WHERE id = ? AND draw_id = ?').get(cardId, drawId) as CardRecord | undefined;
        if (!card) return json({ error: 'Card not found' }, { status: 404 });

        const manifest = getManifest();
        const config = manifest[card.type];
        if (!config || !config.replace) return json({ error: 'Category does not allow redraws' }, { status: 400 });

        const metadata = JSON.parse(draw.metadata || '{}');
        const redrawn = metadata.redrawn || []; // Array of categories already redrawn
        if (redrawn.includes(card.type)) return json({ error: 'Category already redrawn once' }, { status: 400 });

        // Get current cards in this draw to ensure uniqueness
        const existingCards = db.prepare('SELECT card_content FROM drawn_cards WHERE draw_id = ?').all(drawId) as { card_content: string }[];
        const existingContents = existingCards.map(c => c.card_content);

        // Find available options in manifest for this category that aren't in this draw
        const availableOptions = config.cards.filter((c: string) => !existingContents.includes(c));
        if (availableOptions.length === 0) return json({ error: 'No other unique cards available' }, { status: 400 });

        // Select new card
        const newCardContent = availableOptions[crypto.randomInt(0, availableOptions.length)];
        
        // Update DB
        db.prepare('UPDATE drawn_cards SET card_content = ? WHERE id = ?').run(newCardContent, cardId);
        
        metadata.redrawn = [...redrawn, card.type];
        db.prepare('UPDATE draws SET metadata = ? WHERE id = ?').run(JSON.stringify(metadata), drawId);

        return json({ 
            success: true, 
            newCardContent,
            redrawnCategories: metadata.redrawn
        });
    }

    return json({ error: 'Invalid action' }, { status: 400 });
}
