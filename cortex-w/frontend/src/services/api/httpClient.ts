import { runtimeConfig } from '@/config/runtimeConfig';
import { normalizeApiError, UiApiError } from './apiError';
import { getAuthToken, clearAuthState } from '@/modules/auth/repository/authTokenStore';

/**
 * Talks ONLY to the Cortex-W backend (the BFF), never directly to the
 * upstream water backend. The BFF is what applies every documented
 * inconsistency from spec section 28 (date param names, siteIds encoding,
 * billing trailing slash, 204 semantics, error body variants) — this file
 * stays deliberately dumb: base URL, auth header, 401 handling, parsing.
 */

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, unknown>;
  signal?: AbortSignal;
}

function getNormalizedBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // If running in browser on localhost or 127.0.0.1, use same-origin '/api/'
    // so Nginx reverse-proxies directly to backend container without cross-origin/PNA issues.
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return `${window.location.origin}/api/`;
    }
  }
  let base = (runtimeConfig.API_BASE_URL || 'https://cortex-w-backend.vercel.app/api').trim();
  if (base.startsWith('/')) {
    if (typeof window !== 'undefined') {
      base = `${window.location.origin}${base}`;
    }
  }
  if (!base.endsWith('/api') && !base.endsWith('/api/')) {
    base = base.replace(/\/+$/, '') + '/api';
  }
  return base.replace(/\/+$/, '') + '/';
}

function buildUrl(path: string, query?: Record<string, unknown>): string {
  const cleanPath = path.replace(/^\//, '').replace(/^api\//, '');
  const url = new URL(cleanPath, getNormalizedBaseUrl());
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          url.searchParams.set(key, value.join(','));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }
  }
  return url.toString();
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    signal: opts.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401) {
    clearAuthState();
    // Let the route guard redirect to /login rather than throwing inside
    // every call site.
    const err: UiApiError = { status: 401, operatorMessage: 'Your session has expired. Please sign in again.' };
    throw err;
  }

  if (res.status === 204) {
    // The BFF has already resolved the "204 can mean not-found" ambiguity
    // (spec 28.5) per-endpoint before it reaches the frontend, so here 204
    // always means "successful, no body."
    return undefined as T;
  }

  const contentType = res.headers.get('content-type') ?? '';
  const parsed = contentType.includes('application/json') ? await res.json().catch(() => undefined) : undefined;

  if (!res.ok) {
    throw normalizeApiError(res.status, parsed);
  }

  return parsed as T;
}
