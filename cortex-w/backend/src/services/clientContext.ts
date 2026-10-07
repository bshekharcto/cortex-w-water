import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { proxyUpstream } from './upstreamProxy.js';
import { singleFlight } from './inflight.js';

/**
 * Who a request is acting for. A "client" is a customer organisation (e.g.
 * WATCO = 91, Ayodhya Nagar Nigam = 101) that owns a set of sites and the
 * meters under them. cog-core-api decides what a token may see; this module
 * asks it, then carries the answer through the whole request so that every
 * cache, snapshot and SQL filter downstream is keyed by the same client.
 *
 * Nothing here reads a client id from the browser: it is derived from the
 * sites the upstream returns for the caller's own token.
 */
export interface ClientCtx {
  /** Stable key for caches/tables: the sorted client ids ("91", or "91,101" for a multi-client user). 'seed' in demo mode. */
  key: string;
  clientIds: number[];
  /** "Bearer <jwt>", forwarded to upstream for every call made on this client's behalf. */
  token: string;
  /** Every site (at any depth) the client owns, as the upstream reports it. */
  sites: UpstreamSite[];
  siteIds: ReadonlySet<number>;
  /** True only in seed/demo mode, where there is no upstream to scope by. */
  unscoped: boolean;
}

export interface UpstreamSite {
  id: number;
  name: string;
  clientId: number;
  parentSite: number;
  [k: string]: unknown;
}

export class AuthUnavailableError extends Error {}

const als = new AsyncLocalStorage<ClientCtx>();

export function runWithClient<T>(ctx: ClientCtx, fn: () => T): T {
  return als.run(ctx, fn);
}

/** The client of the current request, or undefined outside one (background work). */
export function currentClient(): ClientCtx | undefined {
  return als.getStore();
}

/** Like currentClient, but fails closed: data access with no client is a bug, never "everything". */
export function requireClient(): ClientCtx {
  const ctx = als.getStore();
  if (!ctx) throw new Error('No client context: refusing to touch client data outside an authenticated request.');
  return ctx;
}

export const SEED_CLIENT: ClientCtx = {
  key: 'seed',
  clientIds: [],
  token: '',
  sites: [],
  siteIds: new Set(),
  unscoped: true,
};

// ---------------------------------------------------------------------------
// Token -> client resolution (validated by the upstream itself)
// ---------------------------------------------------------------------------

const VALID_TTL_MS = 5 * 60 * 1000;
const MAX_CACHED_TOKENS = 5000;

interface Resolved {
  ctx: ClientCtx;
  checkedAt: number;
  expiresAtMs: number;
}
const resolved = new Map<string, Resolved>();
const inflight = new Map<string, Promise<ClientCtx | null>>();

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

function tokenExpiryMs(jwt: string): number {
  try {
    const p = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
    return typeof p.exp === 'number' ? p.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Resolves a raw JWT to its client by asking cog-core-api for the sites that
 * token may see. Returns null if upstream rejects the token (401/403) or the
 * token has no client; throws AuthUnavailableError if upstream can't be
 * reached, so an outage is never mistaken for "logged out" (or for access).
 */
export async function resolveClient(rawJwt: string): Promise<ClientCtx | null> {
  const expiresAtMs = tokenExpiryMs(rawJwt);
  if (!expiresAtMs || expiresAtMs <= Date.now()) return null;

  const id = hash(rawJwt);
  const hit = resolved.get(id);
  if (hit && Date.now() - hit.checkedAt < VALID_TTL_MS && hit.expiresAtMs > Date.now()) return hit.ctx;

  return singleFlight(inflight, id, async () => {
    let res;
    try {
      res = await proxyUpstream('GET', '/api/site/', {
        query: { allSites: 'false' },
        headers: { Authorization: `Bearer ${rawJwt}` },
      });
    } catch (err: any) {
      throw new AuthUnavailableError(`upstream unreachable: ${err?.message || err}`);
    }
    if (res.status === 401 || res.status === 403) {
      resolved.delete(id);
      return null;
    }
    if (res.status !== 200 || !Array.isArray(res.data)) {
      throw new AuthUnavailableError(`upstream answered HTTP ${res.status}`);
    }

    const sites = (res.data as any[]).filter(
      (s): s is UpstreamSite => typeof s?.id === 'number' && typeof s?.clientId === 'number'
    );
    const clientIds = [...new Set(sites.map((s) => s.clientId))].sort((a, b) => a - b);
    if (clientIds.length === 0) return null; // authenticated but belongs to no client: nothing to show

    const ctx: ClientCtx = {
      key: clientIds.join(','),
      clientIds,
      token: `Bearer ${rawJwt}`,
      sites,
      siteIds: new Set(sites.map((s) => s.id)),
      unscoped: false,
    };
    if (resolved.size >= MAX_CACHED_TOKENS) {
      const oldest = resolved.keys().next().value;
      if (oldest) resolved.delete(oldest);
    }
    resolved.set(id, { ctx, checkedAt: Date.now(), expiresAtMs });
    noteActiveClient(ctx, expiresAtMs);
    return ctx;
  });
}

// ---------------------------------------------------------------------------
// Active clients (for background work)
// ---------------------------------------------------------------------------
//
// Background jobs (telemetry sync, inventory refresh) have no service account
// to run as. They run only for clients that currently have a live session,
// using that session's own token — so a client's data is fetched while that
// client is logged in, and not otherwise. The newest token seen per client is
// held in memory only (never persisted) and dropped when it expires or the
// client has been idle longer than ACTIVE_WINDOW_MS.

const ACTIVE_WINDOW_MS = (Number(process.env.CLIENT_ACTIVE_WINDOW_HOURS) || 12) * 60 * 60 * 1000;
const active = new Map<string, { ctx: ClientCtx; lastSeen: number; expiresAtMs: number }>();

function noteActiveClient(ctx: ClientCtx, expiresAtMs: number) {
  active.set(ctx.key, { ctx, lastSeen: Date.now(), expiresAtMs });
}

/** Marks the client as in use right now (called on every authenticated request). */
export function touchClient(ctx: ClientCtx) {
  const a = active.get(ctx.key);
  if (a && a.ctx.token === ctx.token) a.lastSeen = Date.now();
}

/** Clients with a live, recently-used session. */
export function activeClients(): ClientCtx[] {
  const now = Date.now();
  const out: ClientCtx[] = [];
  for (const [key, a] of active) {
    if (a.expiresAtMs <= now || now - a.lastSeen > ACTIVE_WINDOW_MS) active.delete(key);
    else out.push(a.ctx);
  }
  return out;
}

/** Forgets a client's session (logout). */
export function forgetToken(rawJwt: string) {
  const id = hash(rawJwt);
  const r = resolved.get(id);
  resolved.delete(id);
  if (r && active.get(r.ctx.key)?.ctx.token === r.ctx.token) active.delete(r.ctx.key);
}

// ---------------------------------------------------------------------------
// Scoping helpers
// ---------------------------------------------------------------------------

/**
 * Narrows a browser-supplied site selection to what the client owns.
 * Empty / "ALL" means "all of my sites". Returns null if the request named a
 * site the client does not own — callers answer 404 so ids can't be probed.
 * Always returns the client's roots for 'ALL' (not just any site) so callers
 * that need one site get a stable choice.
 */
export function scopeSiteIds(ctx: ClientCtx, requested: string | string[] | undefined | null): number[] | null {
  const all = [...ctx.siteIds];
  const raw = Array.isArray(requested) ? requested.join(',') : requested ?? '';
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  // Seed/demo mode has no upstream to scope by: pass numeric ids straight through.
  if (ctx.unscoped) return parts.map(Number).filter(Number.isInteger);
  if (parts.length === 0 || parts.some((p) => p.toUpperCase() === 'ALL')) return all;
  const ids = parts.map(Number);
  if (ids.some((n) => !Number.isInteger(n) || !ctx.siteIds.has(n))) return null;
  return ids;
}

/** The client's top-level sites (no parent, or whose parent isn't theirs). */
export function rootSites(ctx: ClientCtx): UpstreamSite[] {
  return ctx.sites.filter((s) => !s.parentSite || !ctx.siteIds.has(s.parentSite));
}
