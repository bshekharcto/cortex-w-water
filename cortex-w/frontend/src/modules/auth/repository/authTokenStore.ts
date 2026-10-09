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

/** localStorage keys holding per-user data (e.g. cached KPI summaries). */
const USER_DATA_PREFIX = 'cortex_w_';

export function clearAuthState(): void {
  inMemoryToken = null;
  sessionStorage.removeItem(STORAGE_KEY);
  // Cached data belongs to the account that fetched it; never let the next
  // login on this browser see it.
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(USER_DATA_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // storage unavailable
  }
}
