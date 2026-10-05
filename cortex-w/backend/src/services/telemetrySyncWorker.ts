import { ingestDateIntoPostgres, getPostgresAggregatedSummary, resolveWindow } from './telemetryDbService.js';
import { pool } from '../db/pool.js';

let isSyncing = false;
let lastSyncStartTime = 0;
const SYNC_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minute max lock
let schedulerTimer: NodeJS.Timeout | null = null;

export interface SyncResult {
  success: boolean;
  packetsAdded: number;
  syncedDates: string[];
  durationMs: number;
  timestamp: string;
  error?: string;
}

/**
 * Pings raw telemetry from Cognecto upstream for current and reference dates,
 * inserts new packets into PostgreSQL with deduplication, and pre-warms the summary cache.
 */
export async function syncLatestTelemetry(customDates?: string[]): Promise<SyncResult> {
  const nowMs = Date.now();
  if (isSyncing && (nowMs - lastSyncStartTime) < SYNC_LOCK_TIMEOUT_MS) {
    console.log('[telemetrySync] Sync already in progress, skipping duplicate call.');
    return {
      success: true,
      packetsAdded: 0,
      syncedDates: [],
      durationMs: 0,
      timestamp: new Date().toISOString(),
    };
  }

  isSyncing = true;
  lastSyncStartTime = Date.now();
  const startTime = Date.now();
  
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  
  // Yesterday (bridges UTC vs local IST rollover)
  const yesterday = new Date(now);
  yesterday.setUTCDate(now.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  // 2 days ago (resilience for weekend or delayed ingestion)
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setUTCDate(now.getUTCDate() - 2);
  const twoDaysAgoStr = twoDaysAgo.toISOString().slice(0, 10);

  // Default target dates: today, yesterday, 2-days-ago, and operational baseline 2026-09-06
  const targetDates = Array.from(
    new Set([
      todayStr,
      yesterdayStr,
      twoDaysAgoStr,
      '2026-09-06',
      ...(customDates || []),
    ])
  );

  let totalAdded = 0;
  const syncedDates: string[] = [];

  console.log(`[telemetrySync] Starting telemetry ping for target dates: ${targetDates.join(', ')}...`);

  try {
    for (const date of targetDates) {
      try {
        // For past dates: if already sufficiently backfilled in PostgreSQL, skip re-fetching
        if (date < todayStr && !customDates?.includes(date)) {
          const countRes = await pool.query(
            'SELECT COUNT(*)::int as count FROM raw_telemetry_packets WHERE date_key = $1',
            [date]
          );
          const existingCount = countRes.rows[0]?.count ?? 0;
          if (existingCount >= 200) {
            console.log(`[telemetrySync] Date ${date} already has ${existingCount} packets in PostgreSQL, skipping backfill.`);
            syncedDates.push(date);
            continue;
          }
        }

        const added = await ingestDateIntoPostgres(date);
        totalAdded += added;
        syncedDates.push(date);
        console.log(`[telemetrySync] Date ${date}: +${added} packets.`);
      } catch (dateErr: any) {
        console.warn(`[telemetrySync] Warning syncing date ${date}:`, dateErr.message);
      }
    }

    // Pre-warm the fleet-wide caches for the standard windows using SQL aggregation ONLY (skip re-ingestion)
    for (const req of [{ hours: 1 }, { hours: 6 }, { hours: 24 }, { days: 7 }, { days: 30 }]) {
      try {
        await getPostgresAggregatedSummary(resolveWindow(req), true, 'ALL', true);
      } catch (cacheErr: any) {
        console.warn(`[telemetrySync] Cache pre-warm note for ${JSON.stringify(req)}:`, cacheErr.message);
      }
    }

    const durationMs = Date.now() - startTime;
    console.log(
      `[telemetrySync] Sync finished successfully in ${durationMs}ms: +${totalAdded} packets across ${syncedDates.length} dates.`
    );

    return {
      success: true,
      packetsAdded: totalAdded,
      syncedDates,
      durationMs,
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    console.error('[telemetrySync] Fatal error during sync:', err);
    return {
      success: false,
      packetsAdded: totalAdded,
      syncedDates,
      durationMs,
      timestamp: new Date().toISOString(),
      error: err.message,
    };
  } finally {
    isSyncing = false;
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

  // On startup, sync only if the store is stale. Restarting the dev server (tsx watch restarts on every
  // save) must not re-ingest each time; the interval below keeps data fresh otherwise.
  setTimeout(async () => {
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
  }, intervalMs);
}
