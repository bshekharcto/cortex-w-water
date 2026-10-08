import { ingestDateIntoPostgres, prewarmSummaries } from './telemetryDbService.js';
import { pool } from '../db/pool.js';
import { config } from '../config/env.js';
import { localDate } from './localDate.js';
import { refreshInventory } from './assetInventory.js';
import { syncClients, requireClient, runWithClient, type ClientCtx } from './clientContext.js';

let schedulerTimer: NodeJS.Timeout | null = null;

// Don't start a client's sync with less than this left of the budget: it would
// be cut off before a single page lands.
const MIN_SLICE_MS = 8_000;
// The cache pre-warm is heavy SQL; only do it when there is comfortably time.
const PREWARM_MIN_LEFT_MS = 12_000;

/** How long one sync run may take. A Vercel function is killed at 60s, so it stops at 45s; an always-on server is unlimited. */
export function syncBudgetMs(): number {
  if (config.SYNC_TIME_BUDGET_MS > 0) return config.SYNC_TIME_BUDGET_MS;
  return process.env.VERCEL ? 45_000 : Infinity;
}

export type ClientSyncStatus = 'complete' | 'partial' | 'skipped-no-time' | 'busy' | 'error';

export interface ClientSyncReport {
  client: string;
  status: ClientSyncStatus;
  packetsAdded: number;
  dates: string[];
  error?: string;
}

export interface SyncResult {
  success: boolean;
  /** True if any client was cut off by the time budget or skipped for lack of time; the next run continues. */
  incomplete: boolean;
  packetsAdded: number;
  syncedDates: string[];
  durationMs: number;
  timestamp: string;
  clients: ClientSyncReport[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Coordination across serverless instances (client_sync_state)
// ---------------------------------------------------------------------------

/** Least-recently-attempted first, so a slow client can't starve the rest. */
async function inRotationOrder(clients: ClientCtx[]): Promise<ClientCtx[]> {
  try {
    const r = await pool.query(
      'SELECT client_key, last_attempt_at FROM client_sync_state WHERE client_key = ANY($1::text[])',
      [clients.map((c) => c.key)]
    );
    const last = new Map<string, number>(r.rows.map((x: any) => [x.client_key, x.last_attempt_at ? new Date(x.last_attempt_at).getTime() : 0]));
    return [...clients].sort((a, b) => (last.get(a.key) ?? 0) - (last.get(b.key) ?? 0));
  } catch (err: any) {
    console.warn('[telemetrySync] could not read sync order, using default:', err?.message || err);
    return clients;
  }
}

/** Takes the client's lease; false if another run holds it. The lease expires on its own if that run dies. */
async function acquireLease(clientKey: string, leaseMs: number): Promise<boolean> {
  await pool.query('INSERT INTO client_sync_state (client_key) VALUES ($1) ON CONFLICT (client_key) DO NOTHING', [clientKey]);
  const r = await pool.query(
    `UPDATE client_sync_state
        SET lock_until = NOW() + ($2::float8 * INTERVAL '1 millisecond'), last_attempt_at = NOW()
      WHERE client_key = $1 AND (lock_until IS NULL OR lock_until < NOW())`,
    [clientKey, leaseMs]
  );
  return (r.rowCount ?? 0) > 0;
}

async function releaseLease(clientKey: string, status: ClientSyncStatus): Promise<void> {
  await pool
    .query(
      `UPDATE client_sync_state
          SET lock_until = NULL, last_status = $2,
              last_complete_at = CASE WHEN $2 = 'complete' THEN NOW() ELSE last_complete_at END
        WHERE client_key = $1`,
      [clientKey, status]
    )
    .catch((err) => console.warn('[telemetrySync] could not release lease:', err?.message || err));
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/**
 * Pulls raw telemetry from upstream for every client that has a valid session,
 * each with its OWN token, inside a time budget. Clients are taken in rotation
 * and each is leased while it runs, so overlapping invocations (several
 * serverless instances, or the scheduler and the cron) never double-sync one,
 * and a run that is cut off simply continues on the next tick: ingestion is
 * idempotent and already-filled past days are skipped.
 */
/**
 * Syncs ONE client now (used right after login so a lapsed client catches up
 * immediately instead of waiting for the next scheduled run). Honours the same
 * lease as the scheduled sync, so it never overlaps one. Never throws.
 */
export async function syncClientNow(client: ClientCtx, opts: { budgetMs?: number } = {}): Promise<ClientSyncReport> {
  const budget = opts.budgetMs ?? syncBudgetMs();
  const deadline = Date.now() + budget;
  try {
    const got = await acquireLease(client.key, Number.isFinite(budget) ? budget + 30_000 : 10 * 60_000);
    if (!got) return { client: client.key, status: 'busy', packetsAdded: 0, dates: [] };
    const report = await runWithClient(client, () => syncClientTelemetry(undefined, deadline));
    await releaseLease(client.key, report.status);
    console.log(`[telemetrySync] Post-login sync for client ${client.key}: ${report.status} (+${report.packetsAdded} packets)`);
    return report;
  } catch (err: any) {
    console.warn(`[telemetrySync] Post-login sync for client ${client.key} failed:`, err?.message || err);
    return { client: client.key, status: 'error', packetsAdded: 0, dates: [], error: err?.message || String(err) };
  }
}

export async function syncLatestTelemetry(customDates?: string[], opts: { budgetMs?: number } = {}): Promise<SyncResult> {
  const started = Date.now();
  const budget = opts.budgetMs ?? syncBudgetMs();
  const deadline = started + budget;
  const result: SyncResult = {
    success: true, incomplete: false, packetsAdded: 0, syncedDates: [], durationMs: 0,
    timestamp: new Date().toISOString(), clients: [],
  };

  const clients = await inRotationOrder(await syncClients());
  if (clients.length === 0) {
    console.log('[telemetrySync] No client has a valid session; nothing to sync.');
    return result;
  }

  const dates = new Set<string>();
  for (const client of clients) {
    if (deadline - Date.now() < MIN_SLICE_MS) {
      result.incomplete = true;
      result.clients.push({ client: client.key, status: 'skipped-no-time', packetsAdded: 0, dates: [] });
      continue;
    }
    const leaseMs = Number.isFinite(budget) ? budget + 30_000 : 10 * 60_000;
    let got = false;
    try {
      got = await acquireLease(client.key, leaseMs);
    } catch (err: any) {
      result.success = false;
      result.error = [result.error, `client ${client.key}: ${err?.message || err}`].filter(Boolean).join('; ');
      result.clients.push({ client: client.key, status: 'error', packetsAdded: 0, dates: [], error: err?.message || String(err) });
      continue;
    }
    if (!got) {
      result.clients.push({ client: client.key, status: 'busy', packetsAdded: 0, dates: [] });
      continue;
    }

    const report = await runWithClient(client, () => syncClientTelemetry(customDates, deadline));
    await releaseLease(client.key, report.status);
    result.clients.push(report);
    result.packetsAdded += report.packetsAdded;
    report.dates.forEach((d) => dates.add(d));
    if (report.status === 'partial') result.incomplete = true;
    if (report.status === 'error') {
      result.success = false;
      result.error = [result.error, `client ${report.client}: ${report.error}`].filter(Boolean).join('; ');
    }
  }

  result.syncedDates = [...dates];
  result.durationMs = Date.now() - started;
  console.log(
    `[telemetrySync] Run finished in ${result.durationMs}ms: ` +
      result.clients.map((c) => `${c.client}=${c.status}(+${c.packetsAdded})`).join(' ') +
      (result.incomplete ? ' — incomplete, the next run continues' : '')
  );
  return result;
}

async function syncClientTelemetry(customDates: string[] | undefined, deadline: number): Promise<ClientSyncReport> {
  const clientKey = requireClient().key;

  // Days are local-day keys (see localDate.ts). Using the UTC date here would
  // leave the new local day un-synced until 05:30 IST and skew "yesterday".
  const todayStr = localDate(0);
  // Today first, then back SYNC_BACKFILL_DAYS days (newest first), then the operational
  // baseline. A past day that already has data is skipped with one cheap count, so
  // checking the whole window every run costs little and heals any gap, e.g. after
  // the client's session lapsed. Budget-limited runs fill the newest gaps first.
  const recent = Array.from({ length: config.SYNC_BACKFILL_DAYS }, (_, i) => localDate(-i));
  const targetDates = Array.from(new Set([...recent, '2026-09-06', ...(customDates || [])]));

  let added = 0;
  const done: string[] = [];
  let partial = false;
  console.log(`[telemetrySync] Client ${clientKey}: target dates ${targetDates.join(', ')}`);

  try {
    for (const date of targetDates) {
      if (Date.now() >= deadline) { partial = true; break; }
      try {
        // Past dates already sufficiently filled for THIS client are skipped.
        if (date < todayStr && !customDates?.includes(date)) {
          const countRes = await pool.query(
            `SELECT COUNT(*)::int as count FROM raw_telemetry_packets
              WHERE date_key = $1
                AND meter_id IN (SELECT meter_id FROM client_meter_owner WHERE client_key = $2)`,
            [date, clientKey]
          );
          const existing = countRes.rows[0]?.count ?? 0;
          if (existing >= 200) {
            console.log(`[telemetrySync] Client ${clientKey}: ${date} already has ${existing} packets, skipping.`);
            done.push(date);
            continue;
          }
        }
        const n = await ingestDateIntoPostgres(date, deadline);
        added += n;
        console.log(`[telemetrySync] Client ${clientKey}: ${date} +${n} packets.`);
        // If the clock ran out while this day was being paged, it may be incomplete.
        if (Date.now() >= deadline) { partial = true; break; }
        done.push(date);
      } catch (dateErr: any) {
        console.warn(`[telemetrySync] Client ${clientKey}: warning syncing ${date}:`, dateErr.message);
      }
    }

    // Keep this client's site x window summaries warm (skips combinations that are still fresh and unchanged),
    // but only when there is comfortably time left in the run.
    if (!partial && deadline - Date.now() > PREWARM_MIN_LEFT_MS) {
      try {
        const warm = await prewarmSummaries(added > 0, deadline - PREWARM_MIN_LEFT_MS / 2);
        console.log(`[telemetrySync] Client ${clientKey}: cache pre-warm: ${warm.rebuilt} rebuilt, ${warm.skipped} still fresh.`);
      } catch (cacheErr: any) {
        console.warn(`[telemetrySync] Client ${clientKey}: cache pre-warm note:`, cacheErr.message);
      }
    }
    return { client: clientKey, status: partial ? 'partial' : 'complete', packetsAdded: added, dates: done };
  } catch (err: any) {
    console.error(`[telemetrySync] Client ${clientKey}: fatal error during sync:`, err);
    return { client: clientKey, status: 'error', packetsAdded: added, dates: done, error: err.message };
  }
}

/**
 * Starts a recurring in-process scheduler (for local development or persistent Node servers)
 */
export function startTelemetrySyncScheduler(intervalMs: number = 15 * 60 * 1000): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
  }

  console.log(
    `[telemetrySyncScheduler] Registered background telemetry scheduler (runs every ${Math.round(
      intervalMs / 1000 / 60
    )} mins)`
  );

  // A long-running server has no time limit, so it finishes a whole inventory
  // refresh in one go (a no-op when the stored snapshot is still fresh).
  const refreshInventoryNow = async () =>
    Promise.all(
      (await syncClients()).map((client) =>
        runWithClient(client, () =>
          refreshInventory({ budgetMs: Infinity }).catch((err) => {
            console.warn(`[telemetrySyncScheduler] Inventory refresh warning (client ${client.key}):`, err.message);
          })
        )
      )
    );

  // On startup, sync only if the store is stale. Restarting the dev server (tsx watch restarts on every
  // save) must not re-ingest each time; the interval below keeps data fresh otherwise.
  setTimeout(async () => {
    refreshInventoryNow();
    try {
      const res = await pool.query('SELECT MAX(decoded_at) AS latest FROM raw_telemetry_packets');
      const latest: Date | null = res.rows[0]?.latest ?? null;
      const ageMs = latest ? Date.now() - new Date(latest).getTime() : Infinity;
      if (ageMs < intervalMs) {
        console.log('[telemetrySyncScheduler] Store is fresh; skipping startup sync.');
        return;
      }
      console.log('[telemetrySyncScheduler] Store is stale; running startup telemetry sync...');
      await syncLatestTelemetry();
    } catch (err: any) {
      console.warn('[telemetrySyncScheduler] Startup sync check warning:', err.message);
    }
  }, 5000);

  // Recurring background interval
  schedulerTimer = setInterval(() => {
    console.log('[telemetrySyncScheduler] Firing scheduled telemetry sync...');
    syncLatestTelemetry().catch((err) => {
      console.warn('[telemetrySyncScheduler] Scheduled sync warning:', err.message);
    });
    refreshInventoryNow();
  }, intervalMs);
}
