import { fetchUpstreamOrThrow, UpstreamError } from './upstreamProxy.js';
import { getAuthToken } from '../routes/gis.js';

// The master meter inventory from cog-core-api: every Water Meter asset with
// the site it is attached to, its status and its household (consumer name,
// id, address). This is the same data the Cognecto web app's reports are
// built on, and it is the only upstream source that knows meters attached
// directly to a site (no zone/DMA) — GET /api/water/dma-report/zones/{id}
// only lists meters that sit under a child node.
//
// POST /api/asset/query is paged and slow (~9s per 2000 assets, ~28k assets),
// so pages are fetched in parallel, the result is held in memory, and it is
// refreshed in the background.
//
// Only meters with a mapped household are kept. The Cognecto "Water Executive
// Summary" reports 19,092 "Households Mapped" of 27,996 "Meters Configured",
// and that figure is exactly the number of assets whose `household` is set;
// meters without one (the other 8,904) are not part of the monitored estate
// and are left out of every dashboard total and list. A stale copy is served while a refresh runs;
// a failed refresh never replaces a good copy.

export interface InventoryMeter {
  meterId: string;
  assetId: number;
  siteId: number;
  status: string; // ACTIVE | INACTIVE | NOT_REPORTING
  consumerId?: string;
  consumerName?: string;
  address?: string;
}

export interface Inventory {
  byMeter: Map<string, InventoryMeter>;
  bySite: Map<number, string[]>;
  /** When this copy finished loading (ms since epoch) — the freshness of the membership data. */
  loadedAt: number;
}

const PAGE_SIZE = 2000;
const PAGE_CONCURRENCY = 6; // ~14 pages in total; don't open them all at once
const PAGE_ATTEMPTS = 3;
const PAGE_RETRY_BASE_MS = 500;
const TTL_MS = 15 * 60 * 1000;
// After a failed load, don't start another for this long — otherwise every
// request would kick off a fresh ~1 minute, 14-page load against a struggling
// upstream.
const FAILURE_COOLDOWN_MS = 60 * 1000;
const METER_CLASS = 'Water Meter';

let cache: { timestamp: number; inventory: Inventory } | null = null;
let inflight: Promise<Inventory> | null = null;
let lastFailure: { at: number; error: Error } | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPageOnce(page: number, authHeader?: string): Promise<any> {
  const token = await getAuthToken(authHeader);
  const headers: Record<string, string> = token ? { Authorization: token } : {};
  const data = (await fetchUpstreamOrThrow('POST', '/api/asset/query', {
    headers,
    body: { page, size: PAGE_SIZE },
  })) as any;
  if (!data || !Array.isArray(data.content)) {
    throw new UpstreamError('/api/asset/query', 200, `page ${page} had no content array`);
  }
  return data;
}

/** One page, retried with exponential backoff on network/timeout/5xx (a 4xx won't improve by retrying). */
async function fetchPage(page: number, authHeader?: string): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchPageOnce(page, authHeader);
    } catch (err) {
      const status = err instanceof UpstreamError ? err.upstreamStatus : null;
      const retryable = status === null || status >= 500;
      if (!retryable || attempt >= PAGE_ATTEMPTS) throw err;
      await sleep(PAGE_RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }
}

/** Runs `task(i)` for 0..count-1 with at most `limit` in flight; rejects on the first failure. */
async function mapLimited<T>(count: number, limit: number, task: (i: number) => Promise<T>): Promise<T[]> {
  const out = new Array<T>(count);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < count) {
      const i = next++;
      try {
        out[i] = await task(i);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, count) }, worker));
  return out;
}

async function loadInventory(authHeader?: string): Promise<Inventory> {
  const first = await fetchPage(0, authHeader);
  const totalPages: number = first.totalPages ?? 1;
  const rest = await mapLimited(Math.max(totalPages - 1, 0), PAGE_CONCURRENCY, (i) =>
    fetchPage(i + 1, authHeader)
  );

  const byMeter = new Map<string, InventoryMeter>();
  const bySite = new Map<number, string[]>();
  for (const page of [first, ...rest]) {
    for (const a of page.content as any[]) {
      if (a.assetClassName !== METER_CLASS || !a.name || typeof a.siteId !== 'number') continue;
      if (!a.household) continue; // unmapped meter: no household linked
      byMeter.set(a.name, {
        meterId: a.name,
        assetId: a.id,
        siteId: a.siteId,
        status: a.status,
        consumerId: a.household.customId || undefined,
        consumerName: a.household.name || undefined,
        address: a.household.location || undefined,
      });
      if (!bySite.has(a.siteId)) bySite.set(a.siteId, []);
      bySite.get(a.siteId)!.push(a.name);
    }
  }
  return { byMeter, bySite, loadedAt: Date.now() };
}

function refresh(authHeader?: string): Promise<Inventory> {
  if (!inflight) {
    inflight = loadInventory(authHeader)
      .then((inventory) => {
        if (inventory.byMeter.size === 0) {
          throw new UpstreamError('/api/asset/query', 200, 'returned no mapped meters');
        }
        cache = { timestamp: Date.now(), inventory };
        lastFailure = null;
        return inventory;
      })
      .catch((err) => {
        lastFailure = { at: Date.now(), error: err };
        throw err;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

function inCooldown(): boolean {
  return lastFailure !== null && Date.now() - lastFailure.at < FAILURE_COOLDOWN_MS;
}

/**
 * Returns the inventory. With a cached copy this never waits: a stale copy is
 * returned immediately and refreshed in the background (a failed refresh
 * keeps the stale copy and backs off for a minute). Only the very first load
 * (nothing cached yet) waits, and if that fails it throws — callers must not
 * present a missing inventory as "no meters". During the cooldown that throw
 * is immediate rather than another full load attempt.
 */
export async function getInventory(authHeader?: string): Promise<Inventory> {
  if (cache) {
    if (Date.now() - cache.timestamp > TTL_MS && !inCooldown()) {
      refresh(authHeader).catch((err) =>
        console.warn('[assetInventory] Background refresh failed, serving stale copy:', err?.message || err)
      );
    }
    return cache.inventory;
  }
  if (!inflight && inCooldown()) throw lastFailure!.error;
  return refresh(authHeader);
}
