const STORAGE_KEY = 'cortex-w.auth.token';

/**
 * Spec 4.4: "Store the bearer token using the Cortex-family standard. If
 * none exists, use in-memory + sessionStorage by default rather than
 * permanent localStorage." In-memory copy avoids a sessionStorage read on
 * every single request; sessionStorage survives a page refresh within the
 * same tab, satisfying the deep-link-survives-refresh requirement (spec 6)
 * without granting the token the lifetime of localStorage.
 */
let inMemoryToken: string | null = null;

export function setAuthToken(token: string): void {
  inMemoryToken = token;
  sessionStorage.setItem(STORAGE_KEY, token);
}

export function getAuthToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored) inMemoryToken = stored;
  return inMemoryToken;
}

export function clearAuthState(): void {
  inMemoryToken = null;
  sessionStorage.removeItem(STORAGE_KEY);
}
