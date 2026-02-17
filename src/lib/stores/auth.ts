import { writable } from 'svelte/store';
import { browser } from '$app/environment';

interface AuthState {
	token: string | null;
	userId: string | null;
	name: string | null;
}

function createAuthStore() {
	const stored = browser ? localStorage.getItem('auth') : null;
	const initial: AuthState = stored ? JSON.parse(stored) : { token: null, userId: null, name: null };

	const { subscribe, set, update } = writable<AuthState>(initial);

	return {
		subscribe,
		login: (token: string, userId: string, name: string) => {
			const state = { token, userId, name };
			if (browser) localStorage.setItem('auth', JSON.stringify(state));
			set(state);
		},
		logout: () => {
			if (browser) localStorage.removeItem('auth');
			set({ token: null, userId: null, name: null });
		}
	};
}

export const auth = createAuthStore();

export function getAuthHeaders(token: string) {
	return { Authorization: `Bearer ${token}` };
}
