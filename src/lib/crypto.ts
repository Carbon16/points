// Client-side crypto using Web Crypto API

export async function generateKeyPair(): Promise<CryptoKeyPair> {
	if (!window.crypto || !window.crypto.subtle) {
		throw new Error('Web Crypto API unauthorized. Site must be served over HTTPS or localhost.');
	}
	return window.crypto.subtle.generateKey(
		{
			name: 'ECDSA',
			namedCurve: 'P-256'
		},
		true, // extractable (we need to export public key)
		['sign', 'verify']
	);
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
	const exported = await window.crypto.subtle.exportKey('spki', key);
	return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

export async function importPublicKey(pem: string): Promise<CryptoKey> {
	const binary = atob(pem);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	
	return window.crypto.subtle.importKey(
		'spki',
		bytes,
		{ name: 'ECDSA', namedCurve: 'P-256' },
		true,
		['verify']
	);
}

export async function StoreKeys(pair: CryptoKeyPair) {
	const db = await openDb();
	const tx = db.transaction('keys', 'readwrite');
	await tx.objectStore('keys').put(pair.privateKey, 'private');
	await tx.objectStore('keys').put(pair.publicKey, 'public');
}

export async function GetPrivateKey(): Promise<CryptoKey | undefined> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const req = db.transaction('keys').objectStore('keys').get('private');
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function GetPublicKey(): Promise<CryptoKey | undefined> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const req = db.transaction('keys').objectStore('keys').get('public');
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function signData(privateKey: CryptoKey, data: string): Promise<string> {
	const encoder = new TextEncoder();
	const signature = await window.crypto.subtle.sign(
		{ name: 'ECDSA', hash: { name: 'SHA-256' } },
		privateKey,
		encoder.encode(data)
	);
	return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export async function verifySignature(publicKey: CryptoKey, data: string, signature: string): Promise<boolean> {
	const encoder = new TextEncoder();
	const binarySig = atob(signature);
	const bytes = new Uint8Array(binarySig.length);
	for (let i = 0; i < binarySig.length; i++) bytes[i] = binarySig.charCodeAt(i);

	return window.crypto.subtle.verify(
		{ name: 'ECDSA', hash: { name: 'SHA-256' } },
		publicKey,
		bytes,
		encoder.encode(data)
	);
}

export async function exportPrivateKey(key: CryptoKey): Promise<string> {
	const exported = await window.crypto.subtle.exportKey('jwk', key);
	return JSON.stringify(exported);
}

export async function importPrivateKey(jwkStr: string): Promise<CryptoKey> {
	const jwk = JSON.parse(jwkStr);
	return window.crypto.subtle.importKey(
		'jwk',
		jwk,
		{ name: 'ECDSA', namedCurve: 'P-256' },
		true, // extractable
		['sign']
	);
}

export async function digestMessage(message: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(message);
	const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function importKeyPair(jwkStr: string): Promise<CryptoKeyPair> {
	const jwkPrivate = JSON.parse(jwkStr);
	const privateKey = await window.crypto.subtle.importKey(
		'jwk',
		jwkPrivate,
		{ name: 'ECDSA', namedCurve: 'P-256' },
		true,
		['sign']
	);

	// Derive public key from private key JWK
	const jwkPublic = { ...jwkPrivate };
	delete jwkPublic.d; // remove private exponent
	jwkPublic.key_ops = ['verify']; // set proper usage
	
	const publicKey = await window.crypto.subtle.importKey(
		'jwk',
		jwkPublic,
		{ name: 'ECDSA', namedCurve: 'P-256' },
		true,
		['verify']
	);

	return { privateKey, publicKey };
}

// PIN-based identity backup
const PBKDF2_ITERATIONS = 100000;

async function deriveKeyFromPin(pin: string, salt: Uint8Array): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const baseKey = await window.crypto.subtle.importKey(
		'raw',
		encoder.encode(pin),
		'PBKDF2',
		false,
		['deriveKey']
	);

	return window.crypto.subtle.deriveKey(
		{
			name: 'PBKDF2',
			salt: salt as any,
			iterations: PBKDF2_ITERATIONS,
			hash: 'SHA-256'
		},
		baseKey,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

export async function backupPrivateKey(privateKey: CryptoKey, pin: string): Promise<string> {
	const salt = window.crypto.getRandomValues(new Uint8Array(16));
	const iv = window.crypto.getRandomValues(new Uint8Array(12));
	const derivedKey = await deriveKeyFromPin(pin, salt);
	
	const jwk = await window.crypto.subtle.exportKey('jwk', privateKey);
	const data = new TextEncoder().encode(JSON.stringify(jwk));
	
	const encrypted = await window.crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		derivedKey,
		data
	);

	// Pack: salt(16) + iv(12) + encrypted
	const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
	combined.set(salt, 0);
	combined.set(iv, salt.length);
	combined.set(new Uint8Array(encrypted), salt.length + iv.length);
	
	return btoa(String.fromCharCode(...combined));
}

export async function recoverPrivateKey(encryptedBase64: string, pin: string): Promise<CryptoKey> {
	const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
	
	const salt = combined.slice(0, 16);
	const iv = combined.slice(16, 28);
	const data = combined.slice(28);
	
	const derivedKey = await deriveKeyFromPin(pin, salt);
	
	const decrypted = await window.crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv },
		derivedKey,
		data
	);
	
	const jwkStr = new TextDecoder().decode(decrypted);
	const jwk = JSON.parse(jwkStr);
	
	return window.crypto.subtle.importKey(
		'jwk',
		jwk,
		{ name: 'ECDSA', namedCurve: 'P-256' },
		true,
		['sign']
	);
}

// Simple IDB wrapper
function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open('PointsCrypto', 1);
		req.onupgradeneeded = () => req.result.createObjectStore('keys');
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}
