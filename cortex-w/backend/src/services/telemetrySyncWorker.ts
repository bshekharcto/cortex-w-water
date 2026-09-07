import { ingestDateIntoPostgres, getPostgresAggregatedSummary } from './telemetryDbService.js';

let isSyncing = false;
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
  if (isSyncing) {
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
  const startTime = Date.now();
  const todayStr = new Date().toISOString().slice(0, 10);
  
  // Default target dates: today and operational reference date 2026-09-06
  const targetDates = Array.from(
    new Set([
      todayStr,
      '2026-09-06',
      ...(customDates || []),
    ])
  );

  let totalAdded = 0;
  const syncedDates: string[] = [];

  console.log(`[telemetrySync] Starting telemetry ping for dates: ${targetDates.join(', ')}...`);

  try {
    for (const date of targetDates) {
      try {
        const added = await ingestDateIntoPostgres(date);
        totalAdded += added;
        syncedDates.push(date);
        console.log(`[telemetrySync] Date ${date}: +${added} packets.`);
      } catch (dateErr: any) {
        console.warn(`[telemetrySync] Warning syncing date ${date}:`, dateErr.message);
      }
    }

    // Pre-warm the cache for 7D and 30D fleet views
    for (const date of targetDates) {
      try {
        await getPostgresAggregatedSummary(7, date, true, 'ALL');
        await getPostgresAggregatedSummary(30, date, true, 'ALL');
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
