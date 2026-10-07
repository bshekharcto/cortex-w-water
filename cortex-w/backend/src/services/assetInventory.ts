import { promisify } from 'node:util';
import { gzip, gunzip } from 'node:zlib';
import { pool } from '../db/pool.js';
import { fetchUpstreamOrThrow, UpstreamError } from './upstreamProxy.js';
import { singleFlight } from './inflight.js';
import { getAuthToken } from '../routes/gis.js';

// The master meter inventory from cog-core-api: every Water Meter asset with
// the site it is attached to, its status and its household (consumer name,
// id, address). This is the same data the Cognecto web app's reports are
// built on, and it is the only upstream source that knows meters attached
// directly to a site (no zone/DMA) — GET /api/water/dma-report/zones/{id}
// only lists meters that sit under a child node.
//
// Only meters with a mapped household are kept. The Cognecto "Water Executive
// Summary" reports 19,092 "Households Mapped" of 27,996 "Meters Configured",
// and that figure is exactly the number of assets whose `household` is set;
// meters without one (the other 8,904) are not part of the monitored estate
// and are left out of every dashboard total and list.
//
// HOW IT IS LOADED
// POST /api/asset/query is paged and slow (a page costs 7-17s whatever its
// size, ~28k assets), so the Dashboard never calls it on the request path.
// A background refresh copies it into Postgres (table asset_inventory), and
// requests read that copy in milliseconds — so restarts and serverless cold
// starts cost nothing. The refresh is resumable: it walks the pages in
// chunks, recording its position, so an invocation with a hard time limit
// (a Vercel function) can do part of a run and a later one finishes it.
// Stale rows are removed only when a run has completed, so readers always see
// a whole snapshot (the previous one until the new one is complete).

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
  /** When the snapshot this was read from was completed (ms since epoch) — the freshness of the membership data. */
  loadedAt: number;
}

const PAGE_SIZE = 2000; // must stay constant across a run: a run resumes by page number
const BATCH_PAGES = 7; // pages fetched in parallel (14 pages in total)
const PAGE_ATTEMPTS = 3;
const PAGE_RETRY_BASE_MS = 500;
const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // a snapshot older than this is refreshed
const LOCK_MS = 3 * 60 * 1000; // a crashed worker's lock expires after this
const MEMORY_CHECK_MS = 15 * 1000; // how often a request re-checks Postgres for a newer snapshot
const METER_CLASS = 'Water Meter';

// A serverless invocation must stop before its hard limit; a long-running
// server has none. Used when a request itself has to populate an empty table.
const REQUEST_PATH_BUDGET_MS = process.env.VERCEL ? 45_000 : Infinity;

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Upstream paging
// ---------------------------------------------------------------------------

async function fetchPageOnce(page: number): Promise<any> {
  // The shared snapshot always uses the service account, never one user's
  // token, which may expire mid-run.
  const token = await getAuthToken();
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
async function fetchPage(page: number): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchPageOnce(page);
    } catch (err) {
      const status = err instanceof UpstreamError ? err.upstreamStatus : null;
      const retryable = status === null || status >= 500;
      if (!retryable || attempt >= PAGE_ATTEMPTS) throw err;
      await sleep(PAGE_RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }
}

interface Row {
  meterId: string;
  assetId: number;
  siteId: number;
  status: string | null;
  consumerId: string | null;
  consumerName: string | null;
  address: string | null;
}

/** The mapped Water Meters in one upstream page. */
function mappedMeters(page: any): Row[] {
  const byId = new Map<string, Row>();
  for (const a of page.content as any[]) {
    if (a.assetClassName !== METER_CLASS || !a.name || typeof a.siteId !== 'number') continue;
    if (!a.household) continue; // unmapped meter: no household linked
    byId.set(a.name, {
      meterId: a.name,
      assetId: a.id,
      siteId: a.siteId,
      status: a.status ?? null,
      consumerId: a.household.customId || null,
      consumerName: a.household.name || null,
      address: a.household.location || null,
    });
  }
  return [...byId.values()];
}

async function upsertRows(rows: Row[], runId: number): Promise<void> {
  if (rows.length === 0) return;
  await pool.query(
    `INSERT INTO asset_inventory
       (meter_id, asset_id, site_id, status, consumer_id, consumer_name, address, run_id, refreshed_at)
     SELECT t.meter_id, t.asset_id, t.site_id, t.status, t.consumer_id, t.consumer_name, t.address, $8::bigint, NOW()
     FROM UNNEST($1::text[], $2::bigint[], $3::int[], $4::text[], $5::text[], $6::text[], $7::text[])
       AS t(meter_id, asset_id, site_id, status, consumer_id, consumer_name, address)
     ON CONFLICT (meter_id) DO UPDATE SET
       asset_id = EXCLUDED.asset_id, site_id = EXCLUDED.site_id, status = EXCLUDED.status,
       consumer_id = EXCLUDED.consumer_id, consumer_name = EXCLUDED.consumer_name,
       address = EXCLUDED.address, run_id = EXCLUDED.run_id, refreshed_at = EXCLUDED.refreshed_at`,
    [
      rows.map((r) => r.meterId),
      rows.map((r) => r.assetId),
      rows.map((r) => r.siteId),
      rows.map((r) => r.status),
      rows.map((r) => r.consumerId),
      rows.map((r) => r.consumerName),
      rows.map((r) => r.address),
      runId,
    ]
  );
}

// ---------------------------------------------------------------------------
// Background refresh (upstream -> Postgres)
// ---------------------------------------------------------------------------

export type RefreshOutcome = 'fresh' | 'busy' | 'in-progress' | 'completed';

interface RefreshState {
  run_id: string;
  next_page: number;
  total_pages: number | null;
  in_progress: boolean;
  completed_at: Date | null;
}

/**
 * Advances the inventory refresh, within `budgetMs`. Safe to call from
 * anywhere, at any time, from any number of processes:
 *  - 'fresh'       the snapshot is newer than the refresh interval; nothing to do
 *  - 'busy'        another worker holds the lock
 *  - 'in-progress' pages were copied but the run is not finished (call again)
 *  - 'completed'   a full new snapshot is now in place
 * Throws if upstream or Postgres fails; progress made so far is kept and the
 * next call resumes from it.
 */
export async function refreshInventory(opts: { budgetMs: number; force?: boolean }): Promise<RefreshOutcome> {
  const started = Date.now();

  const locked = await pool.query<RefreshState>(
    `UPDATE asset_inventory_refresh
        SET locked_until = NOW() + ($1 || ' milliseconds')::interval
      WHERE id = 1 AND (locked_until IS NULL OR locked_until < NOW())
      RETURNING run_id, next_page, total_pages, in_progress, completed_at`,
    [String(LOCK_MS)]
  );
  if (locked.rowCount === 0) return 'busy';

  try {
    const state = locked.rows[0];
    let runId = Number(state.run_id);
    let nextPage = state.next_page;
    let totalPages = state.total_pages;

    if (!state.in_progress) {
      const age = state.completed_at ? Date.now() - state.completed_at.getTime() : Infinity;
      if (!opts.force && age < REFRESH_INTERVAL_MS) return 'fresh';
      runId += 1;
      nextPage = 0;
      totalPages = null;
      await pool.query(
        `UPDATE asset_inventory_refresh SET run_id = $1, next_page = 0, total_pages = NULL, in_progress = TRUE WHERE id = 1`,
        [runId]
      );
    }

    let lastBatchMs = 0;
    while (totalPages === null || nextPage < totalPages) {
      // Always make some progress, but don't start a batch that would overrun the budget.
      if (nextPage > 0 && Date.now() - started + Math.max(lastBatchMs, 20_000) > opts.budgetMs) break;

      const batchStart = Date.now();
      const pages =
        totalPages === null
          ? [0] // learn the page count from the first page
          : Array.from({ length: Math.min(BATCH_PAGES, totalPages - nextPage) }, (_, i) => nextPage + i);

      const settled = await Promise.allSettled(pages.map((p) => fetchPage(p)));
      let firstFailure: unknown = null;
      for (const r of settled) {
        if (r.status === 'fulfilled') {
          if (totalPages === null) totalPages = r.value.totalPages ?? 1;
          await upsertRows(mappedMeters(r.value), runId);
        } else if (!firstFailure) {
          firstFailure = r.reason;
        }
      }
      if (firstFailure) throw firstFailure; // pages that succeeded were saved; the batch is retried next call

      nextPage = pages[pages.length - 1] + 1;
      lastBatchMs = Date.now() - batchStart;
      await pool.query(
        `UPDATE asset_inventory_refresh
            SET next_page = $1, total_pages = $2, locked_until = NOW() + ($3 || ' milliseconds')::interval
          WHERE id = 1`,
        [nextPage, totalPages, String(LOCK_MS)]
      );
    }

    if (totalPages === null || nextPage < totalPages) return 'in-progress';

    // Whole run done: drop meters upstream no longer returns, then publish.
    const counts = await pool.query<{ seen: string; total: string }>(
      `SELECT count(*) FILTER (WHERE run_id = $1) AS seen, count(*) AS total FROM asset_inventory`,
      [runId]
    );
    const seen = Number(counts.rows[0].seen);
    const total = Number(counts.rows[0].total);
    if (seen === 0) throw new UpstreamError('/api/asset/query', 200, 'run completed with no mapped meters');
    if (seen * 2 < total) {
      // Upstream returned under half of what we hold — more likely a partial
      // answer than half the estate vanishing. Keep the old rows.
      console.warn(`[assetInventory] Run ${runId} saw ${seen} of ${total} stored meters; keeping the rest.`);
    } else {
      await pool.query(`DELETE FROM asset_inventory WHERE run_id <> $1`, [runId]);
    }
    const completedAt = await publishSnapshot();
    await pool.query(
      `UPDATE asset_inventory_refresh SET in_progress = FALSE, completed_at = $1, locked_until = NULL WHERE id = 1`,
      [completedAt]
    );
    console.log(`[assetInventory] Refresh ${runId} complete: ${seen} mapped meters in ${Date.now() - started}ms.`);
    return 'completed';
  } finally {
    // Release the lock (a completed run already cleared it). An unfinished run
    // stays in_progress and is resumed by the next call.
    await pool
      .query(`UPDATE asset_inventory_refresh SET locked_until = NULL WHERE id = 1`)
      .catch(() => undefined);
  }
}

/** Row layout inside the snapshot document (arrays, not objects, to keep it small). */
type SnapshotRow = [meterId: string, assetId: number, siteId: number, status: string | null, consumerId: string | null, consumerName: string | null, address: string | null];

/** Builds the single-row gzipped copy of the table readers fetch; returns its completion time. */
async function publishSnapshot(): Promise<Date> {
  const rows = await pool.query(
    `SELECT meter_id, asset_id, site_id, status, consumer_id, consumer_name, address FROM asset_inventory`
  );
  const doc: SnapshotRow[] = rows.rows.map((r) => [
    r.meter_id, Number(r.asset_id), r.site_id, r.status, r.consumer_id, r.consumer_name, r.address,
  ]);
  const data = (await gzipAsync(Buffer.from(JSON.stringify(doc)))).toString('base64');
  const now = (await pool.query<{ now: Date }>(`SELECT NOW() AS now`)).rows[0].now;
  await pool.query(
    `INSERT INTO asset_inventory_snapshot (id, completed_at, row_count, data_gz_b64) VALUES (1, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET completed_at = EXCLUDED.completed_at, row_count = EXCLUDED.row_count, data_gz_b64 = EXCLUDED.data_gz_b64`,
    [now, doc.length, data]
  );
  return now;
}

// ---------------------------------------------------------------------------
// Reading (Postgres -> request)
// ---------------------------------------------------------------------------

let memory: { completedAt: number; checkedAt: number; inventory: Inventory } | null = null;
const loading = new Map<'snapshot', Promise<Inventory>>();

async function readSnapshot(): Promise<Inventory> {
  const state = await pool.query<{ completed_at: Date | null }>(
    `SELECT completed_at FROM asset_inventory_snapshot WHERE id = 1`
  );
  const completedAt = state.rows[0]?.completed_at ?? null;

  if (!completedAt) {
    // Nothing has ever been copied: populate it now (once, ever). On a server
    // this waits for the full load; on a serverless function it does what the
    // time limit allows and reports that the rest is still being prepared.
    const deadline = Date.now() + REQUEST_PATH_BUDGET_MS;
    for (;;) {
      // Someone (another worker) may have finished it while this one waited.
      const published = await pool.query(`SELECT 1 FROM asset_inventory_snapshot WHERE id = 1`);
      if (published.rowCount) return readSnapshot();
      // force: with no published snapshot, "fresh" state alone isn't enough.
      const outcome = await refreshInventory({ budgetMs: deadline - Date.now(), force: true });
      if (outcome === 'completed') return readSnapshot();
      if (Date.now() >= deadline) {
        throw new UpstreamError('asset inventory', null, 'is still being prepared for the first time; retry shortly');
      }
      // 'busy': another worker (a second server, the cron) is running the first
      // load — wait, and take over if its lock expires because it died.
      // 'in-progress': this call's budget ran out part-way; continue the run.
      await sleep(2000);
    }
  }

  // Due for a refresh? Start one without making this request wait for it.
  if (Date.now() - completedAt.getTime() > REFRESH_INTERVAL_MS) refreshInventoryInBackground();

  if (memory && memory.completedAt === completedAt.getTime()) {
    memory.checkedAt = Date.now();
    return memory.inventory;
  }

  const doc = await pool.query<{ completed_at: Date; data_gz_b64: string }>(
    `SELECT completed_at, data_gz_b64 FROM asset_inventory_snapshot WHERE id = 1`
  );
  const snapshot = doc.rows[0];
  if (!snapshot) return readSnapshot(); // replaced between the two reads; look again
  const rows: SnapshotRow[] = JSON.parse((await gunzipAsync(Buffer.from(snapshot.data_gz_b64, 'base64'))).toString());
  const byMeter = new Map<string, InventoryMeter>();
  const bySite = new Map<number, string[]>();
  for (const [meterId, assetId, siteId, status, consumerId, consumerName, address] of rows) {
    byMeter.set(meterId, {
      meterId,
      assetId,
      siteId,
      status: status as string,
      consumerId: consumerId ?? undefined,
      consumerName: consumerName ?? undefined,
      address: address ?? undefined,
    });
    if (!bySite.has(siteId)) bySite.set(siteId, []);
    bySite.get(siteId)!.push(meterId);
  }
  const loadedAt = snapshot.completed_at.getTime();
  const inventory: Inventory = { byMeter, bySite, loadedAt };
  memory = { completedAt: loadedAt, checkedAt: Date.now(), inventory };
  return inventory;
}

/**
 * The inventory snapshot. Answered from memory when it is current (re-checked
 * against Postgres every few seconds), otherwise read from Postgres in
 * milliseconds. If Postgres can't be reached, the last copy read is served
 * when there is one, otherwise this throws — callers must not present a
 * missing inventory as "no meters".
 */
export async function getInventory(): Promise<Inventory> {
  if (memory && Date.now() - memory.checkedAt < MEMORY_CHECK_MS) return memory.inventory;
  try {
    return await singleFlight(loading, 'snapshot', readSnapshot);
  } catch (err: any) {
    if (memory) {
      console.warn('[assetInventory] Could not check Postgres, serving the last snapshot:', err?.message || err);
      memory.checkedAt = Date.now();
      return memory.inventory;
    }
    throw err;
  }
}

/** Starts a refresh in the background if the snapshot is due; never throws, never blocks. */
export function refreshInventoryInBackground(): void {
  refreshInventory({ budgetMs: REQUEST_PATH_BUDGET_MS }).catch((err) =>
    console.warn('[assetInventory] Background refresh failed:', err?.message || err)
  );
}
