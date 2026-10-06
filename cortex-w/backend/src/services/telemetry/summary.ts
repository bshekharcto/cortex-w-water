import { pool } from '../../db/pool.js';
import { getRoots } from '../siteTree.js';
import { networkHealthThresholds as T } from '../../config/networkHealth.js';
import { getGatewayAlias } from './labels.js';
import { fetchGatewayMeterSummary } from './upstream.js';
import { ingestDateIntoPostgres } from './ingest.js';
import { findMultiGatewayMeters, mapFrameRow } from './frames.js';
import { referenceMs, resolveWindow, windowRequestFromKey, type TelemetryWindow } from './windows.js';
import type { PacketRow, TelemetrySummary } from './types.js';

const inflightRebuilds = new Map<string, Promise<unknown>>();

/**
 * Keeps the summary cache warm for every site x standard window, so no one waits for a cold build
 * (a 30-day single-site view takes ~10s cold, ~0.3s warm). A combination is rebuilt when new packets
 * arrived, when it has no cache yet, or when its cache is old enough that the serve-stale window
 * (1 hour) is about to lapse. Builds run one at a time to keep the database load gentle.
 */
export async function prewarmSummaries(newPackets: boolean): Promise<{ rebuilt: number; skipped: number }> {
  const roots = await getRoots().catch(() => []);
  const sites = ['ALL', ...roots.map((r) => String(r.id))];
  const requests = [{ hours: 1 }, { hours: 6 }, { hours: 24 }, { days: 7 }, { days: 30 }];
  const combos = sites.flatMap((siteId) => requests.map((req) => ({ siteId, win: resolveWindow(req) })));
  const keyOf = (c: { siteId: string; win: TelemetryWindow }) => `${c.win.key}_summary_site_${c.siteId}`;

  const ages = new Map<string, number>();
  try {
    const res = await pool.query(
      'SELECT cache_key, EXTRACT(EPOCH FROM (NOW() - updated_at))::int AS age FROM telemetry_aggregation_cache WHERE cache_key = ANY($1::text[])',
      [combos.map(keyOf)]
    );
    for (const r of res.rows) ages.set(r.cache_key, r.age);
  } catch {
    // no cache info: rebuild everything below
  }

  let rebuilt = 0;
  let skipped = 0;
  for (const c of combos) {
    const age = ages.get(keyOf(c));
    const needs = newPackets || age === undefined || age > 50 * 60;
    if (!needs) {
      skipped++;
      continue;
    }
    try {
      await getPostgresAggregatedSummary(c.win, true, c.siteId);
      rebuilt++;
    } catch (err: any) {
      console.warn(`[telemetryDb] Pre-warm note for ${keyOf(c)}:`, err.message);
    }
    // Leave a gap between rebuilds so someone's live request can slot in between them
    await new Promise((r) => setTimeout(r, 250));
  }
  return { rebuilt, skipped };
}

let activeRefreshJobs = 0;

/** True while a manual Refresh (pull today's packets, then rebuild the summary) is still running. */
export function isRefreshing(): boolean {
  return activeRefreshJobs > 0;
}

/**
 * Manual Refresh without making the user wait: pulls today's packets and then rebuilds this window/site's
 * summary in the background. Callers answer immediately from stored data and let the page poll
 * `isRefreshing()`. Only meaningful when the window includes today; one job runs at a time.
 */
export function startManualRefresh(win: TelemetryWindow, siteId: string): boolean {
  const todayUtc = new Date().toISOString().slice(0, 10);
  if (win.toDate !== todayUtc) return false;
  if (activeRefreshJobs > 0) return true; // already running; the caller just keeps polling
  activeRefreshJobs++;
  ingestDateIntoPostgres(todayUtc)
    .catch((err: any) => console.warn('[telemetryDb] Refresh ingestion warning:', err.message))
    .then(() => getPostgresAggregatedSummary(win, true, siteId))
    .catch((err: any) => console.warn('[telemetryDb] Refresh rebuild warning:', err.message))
    .finally(() => {
      activeRefreshJobs--;
      // The page is ready now. Bring the other windows/sites up to date too, quietly in the background, so
      // switching view after a Refresh doesn't show older numbers than the one you just refreshed.
      prewarmSummaries(true).catch((err: any) => console.warn('[telemetryDb] Post-refresh pre-warm note:', err.message));
    });
  return true;
}

/**
 * Aggregates telemetry across N days (default 7 or 30 days) directly in PostgreSQL!
 */
export async function getPostgresAggregatedSummary(
  win: TelemetryWindow,
  forceRefresh: boolean = false,
  siteId: string = 'ALL'
): Promise<TelemetrySummary> {
  const { fromDate, toDate, fromTs, toTs, days } = win;
  const cacheKey = `${win.key}_summary_site_${siteId || 'ALL'}`;

  // 1. Check cache table if not forcing refresh
  if (!forceRefresh) {
    try {
      const cacheRes = await pool.query(
        'SELECT summary_json, updated_at FROM telemetry_aggregation_cache WHERE cache_key = $1',
        [cacheKey]
      );
      if (cacheRes.rows.length > 0) {
        const row = cacheRes.rows[0];
        const ageMs = Date.now() - new Date(row.updated_at).getTime();
        // Fresh (< 2 min): serve as-is. Stale (< 1 h): serve instantly and rebuild in the background.
        if (ageMs < 120000) {
          return row.summary_json as TelemetrySummary;
        }
        if (ageMs < 3600000) {
          if (!inflightRebuilds.has(cacheKey)) {
            const rebuild = getPostgresAggregatedSummary(resolveWindow(windowRequestFromKey(win)), true, siteId)
              .catch((err) => console.warn('[telemetryDb] Background rebuild note:', err.message))
              .finally(() => inflightRebuilds.delete(cacheKey));
            inflightRebuilds.set(cacheKey, rebuild);
          }
          return row.summary_json as TelemetrySummary;
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Run all aggregations concurrently (each round trip to the remote DB is ~250ms)
  // Site scope comes from the upstream summary: packet stats are limited to the gateways that
  // hear this site's meters. A specific site with no upstream answer is an error, not fake data.
  const upstreamSummary = await fetchGatewayMeterSummary(siteId, fromDate, toDate);
  const scoped = !!siteId && siteId !== 'ALL';
  if (scoped && !upstreamSummary) {
    throw new Error('Site gateway summary is unavailable from the upstream API');
  }
  const siteGatewayIds = upstreamSummary?.perGateway.map((g) => g.gatewayId) ?? [];
  const siteFilter = scoped ? 'AND gateway_id = ANY($5::text[])' : '';
  const range: unknown[] = scoped ? [fromDate, toDate, fromTs, toTs, siteGatewayIds] : [fromDate, toDate, fromTs, toTs];

  const spanMs = Date.parse(toTs) - Date.parse(fromTs);
  const prevFromTs = new Date(Date.parse(fromTs) - spanMs).toISOString();
  const prevRange: unknown[] = scoped
    ? [prevFromTs.slice(0, 10), fromTs.slice(0, 10), prevFromTs, fromTs, siteGatewayIds]
    : [prevFromTs.slice(0, 10), fromTs.slice(0, 10), prevFromTs, fromTs];

  const [kpiRes, multiGwRes, gwRes, framesRes, prevRes, earliestRes, gwMultiRes] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(DISTINCT gateway_id)::int as gateways_with_traffic,
        COUNT(DISTINCT meter_id)::int as unique_meters_seen,
        COUNT(*)::int as frames_received,
        AVG(rssi)::numeric(10,1)::float as avg_rssi,
        AVG(snr)::numeric(10,1)::float as avg_snr,
        MAX(decoded_at) as latest_frame_at
      FROM raw_telemetry_packets
      WHERE date_key >= $1 AND date_key <= $2 AND decoded_at >= $3 AND decoded_at <= $4 ${siteFilter}
    `, range),
    pool.query(`
      SELECT COUNT(*)::int as count FROM (
        SELECT meter_id FROM raw_telemetry_packets
        WHERE date_key >= $1 AND date_key <= $2 AND decoded_at >= $3 AND decoded_at <= $4 ${siteFilter}
        GROUP BY meter_id HAVING COUNT(DISTINCT gateway_id) > 1
      ) sub
    `, range),
    pool.query(`
      SELECT
        gateway_id,
        COUNT(DISTINCT meter_id)::int as unique_meters,
        COUNT(*)::int as frame_count,
        MAX(decoded_at) as latest_decoded_at,
        AVG(rssi)::numeric(10,1)::float as avg_rssi,
        AVG(snr)::numeric(10,1)::float as avg_snr
      FROM raw_telemetry_packets
      WHERE date_key >= $1 AND date_key <= $2 AND decoded_at >= $3 AND decoded_at <= $4 ${siteFilter}
      GROUP BY gateway_id
      ORDER BY unique_meters DESC, frame_count DESC
    `, range),
    pool.query(`SELECT * FROM raw_telemetry_packets WHERE date_key >= $1 AND date_key <= $2 AND decoded_at >= $3 AND decoded_at <= $4 ${siteFilter} ORDER BY decoded_at DESC LIMIT 100`, range),
    // Previous equal-length period, for trends
    pool.query(`
      SELECT gateway_id, COUNT(*)::int AS frames
      FROM raw_telemetry_packets
      WHERE date_key >= $1 AND date_key <= $2 AND decoded_at >= $3 AND decoded_at < $4 ${siteFilter}
      GROUP BY gateway_id
    `, prevRange),
    pool.query(`SELECT MIN(date_key) AS d FROM raw_telemetry_packets`),
    // Per gateway: meters it heard that at least one other gateway also heard (the "other" gateway can be any)
    pool.query(`
      WITH multi AS (
        SELECT meter_id FROM raw_telemetry_packets
        WHERE date_key >= $1 AND date_key <= $2 AND decoded_at >= $3 AND decoded_at <= $4
        GROUP BY meter_id HAVING COUNT(DISTINCT gateway_id) > 1
      )
      SELECT p.gateway_id, COUNT(DISTINCT p.meter_id)::int AS n
      FROM raw_telemetry_packets p JOIN multi m ON m.meter_id = p.meter_id
      WHERE p.date_key >= $1 AND p.date_key <= $2 AND p.decoded_at >= $3 AND p.decoded_at <= $4 ${siteFilter}
      GROUP BY p.gateway_id
    `, range),
  ]);

  // A trend is only reported when the previous period lies entirely inside the data we hold;
  // otherwise "down 100%" would just mean "we hadn't ingested that far back".
  const earliestDate: string | null = earliestRes.rows[0]?.d ?? null;
  const prevComparable = earliestDate !== null && prevFromTs.slice(0, 10) >= earliestDate;
  const prevFrames = new Map<string, number>(prevRes.rows.map((r: any) => [r.gateway_id, r.frames]));
  const pctChange = (cur: number, prev: number | undefined): number | null =>
    T.trendsEnabled && prevComparable && prev && prev >= T.trendMinPrevFrames ? Math.round(((cur - prev) / prev) * 100) : null;

  const kpiRow = kpiRes.rows[0] || {};

  const multiGatewayMeters = multiGwRes.rows[0]?.count ?? 0;

  const gwMulti = new Map<string, number>(gwMultiRes.rows.map((r: any) => [r.gateway_id, r.n]));
  const pgByGateway = new Map<string, any>(gwRes.rows.map((r: any) => [r.gateway_id, r]));
  // Upstream is the source of truth for which gateways hear this site and how many unique meters;
  // packet rows add frame counts / radio stats / last-seen where we have them.
  const gatewayIds = upstreamSummary
    ? upstreamSummary.perGateway.map((g) => g.gatewayId)
    : gwRes.rows.map((r: any) => r.gateway_id);
  const upstreamMeters = new Map(upstreamSummary?.perGateway.map((g) => [g.gatewayId, g.uniqueMeterCount]) ?? []);

  const gateways = gatewayIds
    .map((gatewayId) => {
      const r = pgByGateway.get(gatewayId);
      const trendPct = r ? pctChange(r.frame_count, prevFrames.get(gatewayId)) : null;
      const ageMin = r ? (referenceMs(win) - new Date(r.latest_decoded_at).getTime()) / 60000 : Infinity;
      let status: 'reporting' | 'degraded' | 'stale' | 'no-traffic';
      if (!r) status = win.subDay ? 'no-traffic' : 'stale'; // heard meters upstream, but no packets stored for this window
      else if (ageMin > T.gatewayCriticalMinutes) status = 'no-traffic';
      else if (ageMin > T.gatewayStaleMinutes) status = 'stale';
      else if (
        r.avg_rssi < T.rssiCriticalDbm ||
        r.avg_snr < T.snrCriticalDb ||
        (trendPct !== null && trendPct <= -T.gatewayTrafficDropWarningPct)
      ) status = 'degraded';
      else status = 'reporting';

      return {
        gatewayId,
        alias: getGatewayAlias(gatewayId),
        // Sub-day windows can't use the upstream (day-granular) counts, so count from packets
        uniqueMeters: win.subDay ? r?.unique_meters ?? 0 : upstreamMeters.get(gatewayId) ?? r?.unique_meters ?? 0,
        frameCount: r?.frame_count ?? 0,
        lastFrameDecodedAt: (r?.latest_decoded_at ?? null) as string | null,
        avgRssi: r?.avg_rssi ?? null,
        avgSnr: r?.avg_snr ?? null,
        trendPct,
        multiGatewayMeters: gwMulti.get(gatewayId) ?? 0,
        status,
      };
    })
    .sort((a, b) => b.uniqueMeters - a.uniqueMeters || b.frameCount - a.frameCount);

  const feedMulti = await findMultiGatewayMeters(framesRes.rows.map((r: any) => r.meter_id), win);
  const recentFrames = framesRes.rows.map((r: PacketRow, idx: number) => mapFrameRow(r, idx, feedMulti));

  const summary: TelemetrySummary = {
    dateRange: { fromDate, toDate, days, fromTs, toTs, window: win.key },
    generatedAt: new Date().toISOString(),
    source: 'postgresql',
    thresholds: T,
    kpis: {
      gatewaysWithTraffic: gateways.filter((g) => g.status !== 'stale' && g.status !== 'no-traffic').length,
      totalConfiguredGateways: gateways.length,
      noRecentTrafficGateways: gateways.filter((g) => g.status === 'stale' || g.status === 'no-traffic').length,
      uniqueMetersSeen: (win.subDay ? undefined : upstreamSummary?.totalUniqueMeters) ?? kpiRow.unique_meters_seen ?? 0,
      framesReceived: kpiRow.frames_received ?? 0,
      framesTrendPct: pctChange(kpiRow.frames_received ?? 0, prevRes.rows.reduce((a: number, r: any) => a + r.frames, 0)),
      lastFrameAt: (kpiRow.latest_frame_at ?? null) as string | null,
      multiGatewayMeters: (win.subDay ? undefined : upstreamSummary?.metersOnMultipleGateways) ?? multiGatewayMeters,
      avgRssi: kpiRow.avg_rssi ?? null,
      avgSnr: kpiRow.avg_snr ?? null,
    },
    gateways,
    recentFrames,
  };

  // 10. Cache in PostgreSQL
  try {
    await pool.query(`
      INSERT INTO telemetry_aggregation_cache (cache_key, from_date, to_date, summary_json, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (cache_key) DO UPDATE SET summary_json = $4, updated_at = NOW()
    `, [cacheKey, fromDate, toDate, summary]);
  } catch (err: any) {
    console.warn('[telemetryDb] Cache save note:', err.message);
  }

  return summary;
}
