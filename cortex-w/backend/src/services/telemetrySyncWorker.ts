import { ingestDateIntoPostgres, getPostgresAggregatedSummary } from './telemetryDbService.js';
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

    // Pre-warm the cache for 7D and 30D fleet views using SQL aggregation ONLY (skip re-ingestion)
    for (const date of [todayStr, '2026-09-06']) {
      try {
        await getPostgresAggregatedSummary(7, date, true, 'ALL', true);
        await getPostgresAggregatedSummary(30, date, true, 'ALL', true);
      } catch (cacheErr: any) {
        console.warn(`[telemetrySync] Cache pre-warm note for ${date}:`, cacheErr.message);
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

  // Initial sync delayed by 5 seconds to let database migrations complete
  setTimeout(() => {
    console.log('[telemetrySyncScheduler] Running initial telemetry sync on startup...');
    syncLatestTelemetry().catch((err) => {
      console.warn('[telemetrySyncScheduler] Initial sync warning:', err.message);
    });
  }, 5000);

  // Recurring background interval
  schedulerTimer = setInterval(() => {
    console.log('[telemetrySyncScheduler] Firing scheduled telemetry sync...');
    syncLatestTelemetry().catch((err) => {
      console.warn('[telemetrySyncScheduler] Scheduled sync warning:', err.message);
    });
  }, intervalMs);
}
