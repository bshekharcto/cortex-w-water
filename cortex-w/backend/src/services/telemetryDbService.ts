import { createHash } from 'node:crypto';
import { pool } from '../db/pool.js';

export interface TelemetrySummary {
  dateRange: { fromDate: string; toDate: string; days: number };
  generatedAt: string;
  source: 'postgresql';
  kpis: {
    gatewaysWithTraffic: number;
    totalConfiguredGateways: number;
    uniqueMetersSeen: number;
    configuredMeters: number;
    framesReceived: number;
    framesTrend: string;
    lastFrameAge: string;
    multiGatewayMeters: number;
    avgRssi: number;
    avgSnr: number;
    reverseFlowCount: number;
  };
  gateways: Array<{
    gatewayId: string;
    alias: string;
    uniqueMeters: number;
    frameCount: number;
    lastFrameText: string;
    lastFrameDecodedAt: string;
    avgRssi: number;
    avgSnr: number;
    trendText: string;
    status: 'reporting' | 'degraded' | 'stale' | 'no-traffic';
  }>;
  allMetersCount: number;
  recentFrames: any[];
  hourlyActivity: Array<{ hour: string; count: number }>;
  radioHealth: {
    avgRssi: number;
    avgSnr: number;
    rssiBuckets: { excellent: number; good: number; fair: number; poor: number };
    snrBuckets: { excellent: number; good: number; fair: number; poor: number };
  };
}

export function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'unknown';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  if (diffMs < 0) return 'just now';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDays = Math.floor(diffHour / 24);
  return `${diffDays}d ago`;
}

export function getGatewayAlias(id: string): string {
  if (!id) return 'GW-UNK';
  const suffix = id.slice(-3).toUpperCase();
  return `GW-${suffix}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Readings are stored in UTC and shown in the time zone of the site: every window, day and hour below is cut there.
// A zone is a name ("Asia/Kolkata") or the POSIX spelling the metadata sync stores ("UTC-05:30" = 5 h 30 min EAST of
// Greenwich). It is put into SQL text, so only plain zone characters are let through.
const SAFE_ZONE = /^[A-Za-z0-9_/+:-]+$/;
export function safeZone(zone?: string): string {
  return zone && SAFE_ZONE.test(zone) ? zone : 'UTC';
}

/** The date (YYYY-MM-DD) it is at `instant` in the zone. */
export function localDateIn(zone: string, instant: Date = new Date()): string {
  const posix = /^UTC([+-])(\d{2}):(\d{2})$/.exec(zone);
  if (posix) {
    const minutes = (posix[1] === '-' ? 1 : -1) * (Number(posix[2]) * 60 + Number(posix[3])); // UTC-05:30 is EAST
    return new Date(instant.getTime() + minutes * 60000).toISOString().slice(0, 10);
  }
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

/** The frames from the start of day `from` to the end of day `to`, days of the zone. */
export const inWindow = (zone: string, from: string, to: string) =>
  `time >= (${from}::date)::timestamp AT TIME ZONE '${zone}' AND time < ((${to}::date + 1)::timestamp AT TIME ZONE '${zone}')`;

const KNOWN_GATEWAY_DAYS = 30;                  // a gateway that sent a frame in this many days is "known"
const STALE_GATEWAY_AFTER_MS = 6 * 60 * 60 * 1000;
const DEGRADED_AVG_RSSI = -105;
const DEGRADED_AVG_SNR = -15;

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** "+6.5% vs prev 7d"; "no earlier data" when the window before had no frames. */
function trendText(current: number, previous: number, days: number): string {
  if (!previous) return 'no earlier data';
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs prev ${days}d`;
}

export interface DateWindow {
  fromDate: string;
  toDate: string;
}

/** The last `days` days ending today at the zone's site (or at `referenceDate`, never later than today), or a custom window. */
export function dateRange(days: number, referenceDate?: string, custom?: DateWindow, zone: string = 'UTC'): DateWindow {
  if (custom) return custom;
  const today = localDateIn(zone);
  const toDate = referenceDate && /^\d{4}-\d{2}-\d{2}$/.test(referenceDate) && referenceDate < today ? referenceDate : today;
  return { fromDate: shiftDate(toDate, -(days - 1)), toDate };
}

export type MeterFilter = 'ALL' | 'LIVE' | 'STALE' | 'WEAK_RSSI' | 'POOR_SNR' | 'MULTI_GW';

// The same limits the status chips use, so a filter and the chip on the row always agree.
const STALE_AFTER_MS = DAY_MS;
export const WEAK_RSSI_DBM = -95;
export const POOR_SNR_DB = -10;

function meterStatusChips(m: { decoded_at: string; rssi: number; snr: number; gateway_count: number }): string[] {
  const chips: string[] = [];
  const stale = Date.now() - new Date(m.decoded_at).getTime() > STALE_AFTER_MS;
  chips.push(stale ? 'stale' : 'live');
  if (m.rssi < WEAK_RSSI_DBM) chips.push('weak-rssi');
  if (m.snr < POOR_SNR_DB) chips.push('poor-snr');
  if (m.gateway_count > 1) chips.push('multi-gw');
  return chips;
}

// What a frame's link looks like: the same limits as the meter chips.
function frameStatus(r: { rssi: number | null; snr: number | null; gateway_count: number | null }): string {
  const weak = r.rssi != null && r.rssi < WEAK_RSSI_DBM;
  const poorSnr = r.snr != null && r.snr < POOR_SNR_DB;
  if (weak && poorSnr) return 'POOR_LINK';
  if (weak) return 'WEAK_RSSI';
  if (poorSnr) return 'DEGRADED';
  if ((r.gateway_count ?? 1) > 1) return 'MULTI_GW';
  return 'FRAME_RECEIVED';
}

/** A stored row as the Command Center frame item (recent frames, live feed). */
export function toFrameItem(r: any, id: string) {
  return {
    id,
    decodedAt: r.decoded_at,
    meterTimestamp: r.meter_timestamp || r.decoded_at,
    meterId: r.meter_id,
    devEui: r.dev_eui,
    gatewayId: r.gateway_id,
    gatewayAlias: getGatewayAlias(r.gateway_id),
    fCnt: r.f_cnt,
    fPort: r.f_port,
    frequency: r.frequency,
    dr: r.dr,
    rssi: r.rssi,
    snr: r.snr,
    confirmed: r.confirmed,
    adr: r.adr,
    checksumStatus: r.checksum_status,
    statusEvent: frameStatus(r),
    localTime: r.local_time ?? null, // decodedAt as clock time at the site: "2026-10-08 17:38:01"
  };
}

function toMeterItem(m: any, gatewayId: string) {
  return {
    meterId: m.meter_id,
    devEui: m.dev_eui,
    lastSeenDate: m.decoded_at,
    lastSeenLocal: m.local_time ?? null, // lastSeenDate as clock time at the site
    frameAge: formatRelativeTime(m.decoded_at),
    frames1H: m.frames_1h,
    frames24H: m.frames_24h,
    lastRssi: m.rssi,
    lastSnr: m.snr,
    fCnt: m.f_cnt,
    fPort: m.f_port,
    frequency: m.frequency,
    dr: m.dr,
    adr: m.adr,
    confirmed: m.confirmed,
    otherGatewaysCount: Math.max(0, (m.gateway_count ?? 1) - 1),
    statusChips: meterStatusChips(m),
    gatewaysHeard: [
      {
        gatewayId,
        alias: getGatewayAlias(gatewayId),
        rssi: m.rssi,
        snr: m.snr,
        lastSeenText: formatRelativeTime(m.decoded_at),
        isLatest: true,
      },
    ],
    forwardFlowL: m.forward_flow_kl,
    reverseFlow: m.reverse_flow_m3,
  };
}

// Each filter as a SQL condition on the per-meter row built in getGatewayMeters (same limits as meterStatusChips).
const FILTER_SQL: Record<MeterFilter, string> = {
  ALL: 'TRUE',
  LIVE: `decoded_at >= NOW() - INTERVAL '24 hours'`,
  STALE: `decoded_at < NOW() - INTERVAL '24 hours'`,
  WEAK_RSSI: `rssi < ${WEAK_RSSI_DBM}`,
  POOR_SNR: `snr < ${POOR_SNR_DB}`,
  MULTI_GW: 'gateway_count > 1',
};

// Limits a query to the meters of some sites; `param` is the placeholder holding the site ids (a bigint[]).
export const siteClause = (param: string) =>
  ` AND meter_id IN (SELECT meter_id FROM meter_metadata WHERE site_id = ANY(${param}::bigint[]))`;

const framesCte = (zone: string, sitesParam?: string) => `
  WITH frames AS (
    SELECT meter_id, gateway_id, dev_eui, decoded_at, rssi, snr, f_cnt, f_port, frequency, dr, adr, confirmed,
           forward_flow_kl, reverse_flow_m3,
           to_char(decoded_at AT TIME ZONE '${zone}', 'YYYY-MM-DD HH24:MI:SS') AS local_time
    FROM water_meter_readings_v2
    WHERE is_history = false AND ${inWindow(zone, '$1', '$2')}${sitesParam ? siteClause(sitesParam) : ''}
  )`;

/**
 * One page of the meters a gateway heard: the latest frame per meter, how many frames the gateway got from it in the
 * last hour / 24 hours, and how many gateways heard it. Filtering and paging happen in SQL, so the page only ever
 * receives `size` rows however many meters the gateway has.
 */
export async function getGatewayMeters(opts: {
  gatewayId: string;
  days: number;
  page: number;
  size: number;
  filter: MeterFilter;
  q?: string;
  referenceDate?: string;
  custom?: DateWindow;
  siteIds?: number[] | null;
  zone?: string;
}) {
  const zone = safeZone(opts.zone);
  const { fromDate, toDate } = dateRange(opts.days, opts.referenceDate, opts.custom, zone);
  const search = (opts.q || '').trim();
  const res = await pool.query(
    `${framesCte(zone, opts.siteIds ? '$7' : undefined)},
    mine AS (
      SELECT DISTINCT ON (meter_id) *
      FROM frames
      WHERE gateway_id = $3
      ORDER BY meter_id, decoded_at DESC
    ),
    stats AS (
      SELECT meter_id,
             COUNT(*) FILTER (WHERE gateway_id = $3 AND decoded_at >= NOW() - INTERVAL '1 hour')::int AS frames_1h,
             COUNT(*) FILTER (WHERE gateway_id = $3 AND decoded_at >= NOW() - INTERVAL '24 hours')::int AS frames_24h,
             COUNT(DISTINCT gateway_id)::int AS gateway_count
      FROM frames
      WHERE meter_id IN (SELECT meter_id FROM mine)
      GROUP BY meter_id
    ),
    per_meter AS (
      SELECT mine.*, stats.frames_1h, stats.frames_24h, stats.gateway_count
      FROM mine JOIN stats USING (meter_id)
    )
    SELECT *, COUNT(*) OVER()::int AS total
    FROM per_meter
    WHERE ${FILTER_SQL[opts.filter]}
      AND ($4 = '' OR meter_id ILIKE '%' || $4 || '%' OR dev_eui ILIKE '%' || $4 || '%')
    ORDER BY decoded_at DESC, meter_id
    LIMIT $5 OFFSET $6`,
    [fromDate, toDate, opts.gatewayId, search, opts.size, opts.page * opts.size, ...(opts.siteIds ? [opts.siteIds] : [])]
  );
  const total = res.rows[0]?.total ?? 0;
  return {
    content: res.rows.map((m: any) => toMeterItem(m, opts.gatewayId)),
    page: opts.page,
    size: opts.size,
    total,
    totalPages: Math.ceil(total / opts.size),
  };
}

/** Meters whose id or DevEUI contains `q`: the latest frame of each, and the gateway that heard it last. */
export async function searchMeters(
  q: string,
  days: number,
  limit = 10,
  referenceDate?: string,
  custom?: DateWindow,
  siteIds?: number[] | null,
  zone: string = 'UTC'
) {
  zone = safeZone(zone);
  const { fromDate, toDate } = dateRange(days, referenceDate, custom, zone);
  const res = await pool.query(
    `${framesCte(zone, siteIds ? '$5' : undefined)},
    latest AS (
      SELECT DISTINCT ON (meter_id) *
      FROM frames
      WHERE meter_id ILIKE '%' || $3 || '%' OR dev_eui ILIKE '%' || $3 || '%'
      ORDER BY meter_id, decoded_at DESC
    ),
    stats AS (
      SELECT meter_id,
             COUNT(*) FILTER (WHERE decoded_at >= NOW() - INTERVAL '1 hour')::int AS frames_1h,
             COUNT(*) FILTER (WHERE decoded_at >= NOW() - INTERVAL '24 hours')::int AS frames_24h,
             COUNT(DISTINCT gateway_id)::int AS gateway_count
      FROM frames
      WHERE meter_id IN (SELECT meter_id FROM latest)
      GROUP BY meter_id
    )
    SELECT latest.*, stats.frames_1h, stats.frames_24h, stats.gateway_count
    FROM latest JOIN stats USING (meter_id)
    ORDER BY (latest.meter_id = $3) DESC, latest.decoded_at DESC
    LIMIT $4`,
    [fromDate, toDate, q, limit, ...(siteIds ? [siteIds] : [])]
  );
  return res.rows.map((m: any) => ({ ...toMeterItem(m, m.gateway_id), gatewayId: m.gateway_id }));
}

/**
 * Aggregates telemetry across N days (default 7 or 30 days) directly in PostgreSQL. The rows are written by the
 * cortex scheduler WaterMeterHistoryToRdsScheduler (from iot.water_meter_readings_v2); this service only reads.
 * The traffic numbers (frames, gateways, radio health) count live frames only; stored days are excluded.
 */
export async function getPostgresAggregatedSummary(
  days: number = 7,
  referenceDate?: string,
  forceRefresh: boolean = false,
  siteId: string = 'ALL',
  custom?: DateWindow,
  siteIds?: number[] | null,
  zone: string = 'UTC'
): Promise<TelemetrySummary> {
  zone = safeZone(zone);
  const { fromDate, toDate } = dateRange(days, referenceDate, custom, zone);
  if (custom) {
    days = Math.round((Date.parse(toDate) - Date.parse(fromDate)) / DAY_MS) + 1;
  }

  // a list of sites would make a long key (the column holds 100 characters): a short hash stands for it
  const siteKey = !siteId || siteId === 'ALL' ? 'ALL' : siteId.length > 24 ? createHash('md5').update(siteId).digest('hex') : siteId;
  const cacheKey = custom
    ? `custom_${fromDate}_${toDate}_site_${siteKey}`
    : `${days}d_summary_${toDate}_site_${siteKey}`;

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
        // If cached within 2 minutes for current date, return cached
        if (ageMs < 120000) {
          return row.summary_json as TelemetrySummary;
        }
      }
    } catch {
      // ignore
    }
  }

  // a site filter limits every query below to the meters of those sites
  const SITE = siteIds ? siteClause('$3') : '';
  const RANGE_ARGS: unknown[] = siteIds ? [fromDate, toDate, siteIds] : [fromDate, toDate];

  // 2. PostgreSQL SQL Aggregation: Overall KPIs
  const kpiRes = await pool.query(`
    SELECT
      COUNT(DISTINCT gateway_id)::int as gateways_with_traffic,
      COUNT(DISTINCT meter_id)::int as unique_meters_seen,
      COUNT(*)::int as frames_received,
      COALESCE(AVG(rssi)::numeric(10,1), -90)::float as avg_rssi,
      COALESCE(AVG(snr)::numeric(10,1), -10)::float as avg_snr,
      COUNT(*) FILTER (WHERE reverse_flow_m3 > 0.05)::int as reverse_flow_count,
      MAX(decoded_at) as latest_frame_at
    FROM water_meter_readings_v2
    WHERE is_history = false AND ${inWindow(zone, '$1', '$2')}${SITE}
  `, RANGE_ARGS);

  const kpiRow = kpiRes.rows[0] || {};

  // meters that are set up (from the metadata mirror); falls back to the meters heard until the first sync has run
  const configuredRes = await pool.query(
    `SELECT COUNT(*)::int AS count FROM meter_metadata WHERE is_active${siteIds ? ' AND site_id = ANY($1::bigint[])' : ''}`,
    siteIds ? [siteIds] : []
  );
  const configuredMeters = configuredRes.rows[0]?.count || (kpiRow.unique_meters_seen ?? 0);

  // 4. Multi-Gateway Meters
  const multiGwRes = await pool.query(`
    SELECT COUNT(*)::int as count FROM (
      SELECT meter_id FROM water_meter_readings_v2
      WHERE is_history = false AND ${inWindow(zone, '$1', '$2')}${SITE}
      GROUP BY meter_id HAVING COUNT(DISTINCT gateway_id) > 1
    ) sub
  `, RANGE_ARGS);
  const multiGatewayMeters = multiGwRes.rows[0]?.count ?? 0;

  // 5. Gateways: every gateway heard in the last KNOWN_GATEWAY_DAYS days, with its frames in the window and in the
  //    window just before it (for the trend). One that sent nothing in the window shows as "no traffic".
  const prevToDate = shiftDate(fromDate, -1);
  const prevFromDate = shiftDate(prevToDate, -(days - 1));
  const knownFromDate = shiftDate(toDate, -(KNOWN_GATEWAY_DAYS - 1));
  const gwRes = await pool.query(`
    SELECT
      gateway_id,
      COUNT(DISTINCT meter_id) FILTER (WHERE ${inWindow(zone, '$1', '$2')})::int AS unique_meters,
      COUNT(*) FILTER (WHERE ${inWindow(zone, '$1', '$2')})::int AS frame_count,
      COUNT(*) FILTER (WHERE ${inWindow(zone, '$3', '$4')})::int AS prev_frame_count,
      MAX(decoded_at) AS latest_decoded_at,
      COALESCE((AVG(rssi) FILTER (WHERE ${inWindow(zone, '$1', '$2')}))::numeric(10,1), 0)::float AS avg_rssi,
      COALESCE((AVG(snr) FILTER (WHERE ${inWindow(zone, '$1', '$2')}))::numeric(10,1), 0)::float AS avg_snr
    FROM water_meter_readings_v2
    WHERE is_history = false AND gateway_id IS NOT NULL
      AND time >= (LEAST($3::date, $5::date))::timestamp AT TIME ZONE '${zone}'
      AND time < (($2::date + 1)::timestamp AT TIME ZONE '${zone}')${siteIds ? siteClause('$6') : ''}
    GROUP BY gateway_id
    ORDER BY unique_meters DESC, frame_count DESC, gateway_id
  `, [fromDate, toDate, prevFromDate, prevToDate, knownFromDate, ...(siteIds ? [siteIds] : [])]);

  const gateways = gwRes.rows.map((r: any) => {
    let status: 'reporting' | 'degraded' | 'stale' | 'no-traffic' = 'reporting';
    if (r.frame_count === 0) status = 'no-traffic';
    else if (Date.now() - new Date(r.latest_decoded_at).getTime() > STALE_GATEWAY_AFTER_MS) status = 'stale';
    else if (r.avg_rssi < DEGRADED_AVG_RSSI || r.avg_snr < DEGRADED_AVG_SNR) status = 'degraded';

    return {
      gatewayId: r.gateway_id,
      alias: getGatewayAlias(r.gateway_id),
      uniqueMeters: r.unique_meters,
      frameCount: r.frame_count,
      lastFrameText: formatRelativeTime(r.latest_decoded_at),
      lastFrameDecodedAt: r.latest_decoded_at,
      avgRssi: r.avg_rssi,
      avgSnr: r.avg_snr,
      trendText: trendText(r.frame_count, r.prev_frame_count, days),
      status,
    };
  });
  const previousFrames = gwRes.rows.reduce((sum: number, r: any) => sum + r.prev_frame_count, 0);

  // 7. Hourly Activity distribution across the 7 days (or 24 hours aggregated)
  const hourlyRes = await pool.query(`
    SELECT
      TO_CHAR(decoded_at AT TIME ZONE '${zone}', 'HH24:00') as hour_str,
      COUNT(*)::int as count
    FROM water_meter_readings_v2
    WHERE is_history = false AND ${inWindow(zone, '$1', '$2')}${SITE}
    GROUP BY hour_str
    ORDER BY hour_str ASC
  `, RANGE_ARGS);

  const hourlyActivityMap = new Map<string, number>();
  for (let h = 0; h < 24; h++) {
    hourlyActivityMap.set(`${String(h).padStart(2, '0')}:00`, 0);
  }
  for (const r of hourlyRes.rows) {
    hourlyActivityMap.set(r.hour_str, r.count);
  }
  const hourlyActivity = Array.from(hourlyActivityMap.entries()).map(([hour, count]) => ({
    hour,
    count,
  }));

  // 8. Radio Health Buckets
  const radioRes = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE rssi >= -80)::int as rssi_excellent,
      COUNT(*) FILTER (WHERE rssi < -80 AND rssi >= -95)::int as rssi_good,
      COUNT(*) FILTER (WHERE rssi < -95 AND rssi >= -105)::int as rssi_fair,
      COUNT(*) FILTER (WHERE rssi < -105)::int as rssi_poor,
      COUNT(*) FILTER (WHERE snr >= 0)::int as snr_excellent,
      COUNT(*) FILTER (WHERE snr < 0 AND snr >= -5)::int as snr_good,
      COUNT(*) FILTER (WHERE snr < -5 AND snr >= -12)::int as snr_fair,
      COUNT(*) FILTER (WHERE snr < -12)::int as snr_poor
    FROM water_meter_readings_v2
    WHERE is_history = false AND ${inWindow(zone, '$1', '$2')}${SITE}
  `, RANGE_ARGS);
  const radioRow = radioRes.rows[0] || {};

  // 9. Recent raw frames (last 100)
  const framesRes = await pool.query(`
    SELECT *, to_char(decoded_at AT TIME ZONE '${zone}', 'YYYY-MM-DD HH24:MI:SS') AS local_time
    FROM water_meter_readings_v2
    WHERE is_history = false${siteIds ? siteClause('$1') : ''}
    ORDER BY decoded_at DESC
    LIMIT 100
  `, siteIds ? [siteIds] : []);

  const recentFrames = framesRes.rows.map((r: any, idx: number) => toFrameItem(r, `pg-frame-${idx}-${r.meter_id}`));

  const summary: TelemetrySummary = {
    dateRange: { fromDate, toDate, days },
    generatedAt: new Date().toISOString(),
    source: 'postgresql',
    kpis: {
      gatewaysWithTraffic: kpiRow.gateways_with_traffic ?? gateways.length,
      totalConfiguredGateways: gateways.length,
      uniqueMetersSeen: kpiRow.unique_meters_seen ?? 0,
      configuredMeters,
      framesReceived: kpiRow.frames_received ?? 0,
      framesTrend: trendText(kpiRow.frames_received ?? 0, previousFrames, days),
      lastFrameAge: formatRelativeTime(kpiRow.latest_frame_at),
      multiGatewayMeters,
      avgRssi: kpiRow.avg_rssi ?? -90,
      avgSnr: kpiRow.avg_snr ?? -10,
      reverseFlowCount: kpiRow.reverse_flow_count ?? 0,
    },
    gateways,
    allMetersCount: kpiRow.unique_meters_seen ?? 0,
    recentFrames,
    hourlyActivity,
    radioHealth: {
      avgRssi: kpiRow.avg_rssi ?? -90,
      avgSnr: kpiRow.avg_snr ?? -10,
      rssiBuckets: {
        excellent: radioRow.rssi_excellent ?? 0,
        good: radioRow.rssi_good ?? 0,
        fair: radioRow.rssi_fair ?? 0,
        poor: radioRow.rssi_poor ?? 0,
      },
      snrBuckets: {
        excellent: radioRow.snr_excellent ?? 0,
        good: radioRow.snr_good ?? 0,
        fair: radioRow.snr_fair ?? 0,
        poor: radioRow.snr_poor ?? 0,
      },
    },
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

function windowArgs(opts: { days: number; referenceDate?: string; custom?: DateWindow; siteIds?: number[] | null; zone?: string }) {
  const zone = safeZone(opts.zone);
  const { fromDate, toDate } = dateRange(opts.days, opts.referenceDate, opts.custom, zone);
  return { zone, fromDate, toDate, site: opts.siteIds ? siteClause('$4') : '', extra: opts.siteIds ? [opts.siteIds] : [] };
}

/** How the frames one gateway received split into signal-quality bands (the Radio Health tab). */
export async function getGatewayRadioHealth(opts: {
  gatewayId: string;
  days: number;
  referenceDate?: string;
  custom?: DateWindow;
  siteIds?: number[] | null;
  zone?: string;
}) {
  const { zone, fromDate, toDate, site, extra } = windowArgs(opts);
  const res = await pool.query(
    `SELECT
       COUNT(*)::int AS frames,
       COUNT(*) FILTER (WHERE rssi >= -80)::int                      AS rssi_strong,
       COUNT(*) FILTER (WHERE rssi < -80 AND rssi >= -90)::int       AS rssi_good,
       COUNT(*) FILTER (WHERE rssi < -90 AND rssi >= -100)::int      AS rssi_weak,
       COUNT(*) FILTER (WHERE rssi < -100)::int                      AS rssi_critical,
       COUNT(*) FILTER (WHERE snr >= 5)::int                         AS snr_excellent,
       COUNT(*) FILTER (WHERE snr < 5 AND snr >= 0)::int             AS snr_good,
       COUNT(*) FILTER (WHERE snr < 0 AND snr >= -10)::int           AS snr_marginal,
       COUNT(*) FILTER (WHERE snr < -10)::int                        AS snr_poor
     FROM water_meter_readings_v2
     WHERE is_history = false AND gateway_id = $3 AND ${inWindow(zone, '$1', '$2')}${site}`,
    [fromDate, toDate, opts.gatewayId, ...extra]
  );
  const r = res.rows[0] || {};
  return {
    frames: r.frames ?? 0,
    rssi: { strong: r.rssi_strong ?? 0, good: r.rssi_good ?? 0, weak: r.rssi_weak ?? 0, critical: r.rssi_critical ?? 0 },
    snr: { excellent: r.snr_excellent ?? 0, good: r.snr_good ?? 0, marginal: r.snr_marginal ?? 0, poor: r.snr_poor ?? 0 },
  };
}

/** Frames one gateway received by hour of the day (display time zone); degraded = weak RSSI or poor SNR. */
export async function getGatewayHourly(opts: {
  gatewayId: string;
  days: number;
  referenceDate?: string;
  custom?: DateWindow;
  siteIds?: number[] | null;
  zone?: string;
}) {
  const { zone, fromDate, toDate, site, extra } = windowArgs(opts);
  const res = await pool.query(
    `SELECT TO_CHAR(decoded_at AT TIME ZONE '${zone}', 'HH24:00') AS hour,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE rssi < ${WEAK_RSSI_DBM} OR snr < ${POOR_SNR_DB})::int AS degraded
     FROM water_meter_readings_v2
     WHERE is_history = false AND gateway_id = $3 AND ${inWindow(zone, '$1', '$2')}${site}
     GROUP BY hour`,
    [fromDate, toDate, opts.gatewayId, ...extra]
  );
  const byHour = new Map<string, { total: number; degraded: number }>(
    res.rows.map((r: any) => [r.hour, { total: r.total, degraded: r.degraded }])
  );
  return Array.from({ length: 24 }, (_, h) => {
    const hour = `${String(h).padStart(2, '0')}:00`;
    const v = byHour.get(hour) ?? { total: 0, degraded: 0 };
    return { hour, normal: v.total - v.degraded, degraded: v.degraded };
  });
}
