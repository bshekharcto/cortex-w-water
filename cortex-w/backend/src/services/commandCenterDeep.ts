import { pool } from '../db/pool.js';
import { networkHealthThresholds as T } from '../config/networkHealth.js';
import {
  dateRange,
  formatRelativeTime,
  getGatewayAlias,
  inWindow,
  safeZone,
  siteClause,
  toFrameItem,
  type DateWindow,
} from './telemetryDbService.js';

// The deeper Command Center views: server-paged frames (per gateway / meter / fleet), one meter by id, the fleet
// meter list, traffic over time and the radio analysis. They read water_meter_readings_v2 (one row per received
// frame: the best gateway in gateway_id, every gateway that heard it in gateway_list) and are cut in the same site
// time zone and day windows as the rest of the Command Center.

export interface WindowOpts {
  days: number;
  referenceDate?: string;
  custom?: DateWindow;
  siteIds?: number[] | null;
  zone?: string;
}

const TABLE = 'water_meter_readings_v2';
const EUI_PREFIX = '506f98000000'; // the 12 hex characters every gateway EUI shares; gateway_list keeps the last 4

/** Placeholders $1/$2 = the window's first and last day, $3 = the site ids when the view is limited to sites. */
function scope(opts: WindowOpts) {
  const zone = safeZone(opts.zone);
  const { fromDate, toDate } = dateRange(opts.days, opts.referenceDate, opts.custom, zone);
  const params: unknown[] = [fromDate, toDate];
  let where = `is_history = false AND ${inWindow(zone, '$1', '$2')}`;
  if (opts.siteIds) {
    params.push(opts.siteIds);
    where += siteClause(`$${params.length}`);
  }
  return { zone, fromDate, toDate, params, where };
}

const localTime = (zone: string) => `to_char(decoded_at AT TIME ZONE '${zone}', 'YYYY-MM-DD HH24:MI:SS') AS local_time`;

const FRAME_COLUMNS = `meter_id, gateway_id, dev_eui, decoded_at, rssi, snr, f_cnt, f_port, frequency, dr, adr, confirmed,
  checksum_status, meter_timestamp, gateway_count, gateway_list`;

// ---------------------------------------------------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------------------------------------------------

export interface FramesPage {
  total: number;
  limit: number;
  offset: number;
  items: Array<ReturnType<typeof toFrameItem> & { multiGateway: boolean }>;
}

async function framesPage(opts: WindowOpts & { gatewayId?: string; meterId?: string; limit: number; offset: number }): Promise<FramesPage> {
  const s = scope(opts);
  const params = [...s.params];
  let where = s.where;
  if (opts.gatewayId) {
    params.push(opts.gatewayId);
    where += ` AND gateway_id = $${params.length}`;
  }
  if (opts.meterId) {
    params.push(opts.meterId);
    where += ` AND meter_id = $${params.length}`;
  }
  params.push(opts.limit, opts.offset);
  const res = await pool.query(
    `SELECT ${FRAME_COLUMNS}, ${localTime(s.zone)}, COUNT(*) OVER()::int AS total
     FROM ${TABLE}
     WHERE ${where}
     ORDER BY decoded_at DESC, meter_id
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return {
    total: res.rows[0]?.total ?? 0,
    limit: opts.limit,
    offset: opts.offset,
    items: res.rows.map((r: any) => ({
      ...toFrameItem(r, `${r.meter_id}-${new Date(r.decoded_at).getTime()}-${r.gateway_id}`),
      multiGateway: (r.gateway_count ?? 1) > 1,
    })),
  };
}

/** Newest frames received through one gateway (newest first, paginated). */
export const getGatewayFrames = (opts: WindowOpts & { gatewayId: string; limit: number; offset: number }) => framesPage(opts);

/** Every frame from one meter, whichever gateway took it (newest first, paginated). */
export const getMeterFrames = (opts: WindowOpts & { meterId: string; limit: number; offset: number }) => framesPage(opts);

/** Newest frames across the fleet or the chosen sites, paginated ("Load more" in the live feed). */
export const getFleetFrames = (opts: WindowOpts & { limit: number; offset: number }) => framesPage(opts);

// ---------------------------------------------------------------------------------------------------------------------
// Meters
// ---------------------------------------------------------------------------------------------------------------------

/** "029c:-10.5,0262:-20.8" -> the gateways that heard one frame, with the SNR each reported. */
export function gatewaysFromList(list: string | null): Array<{ gatewayId: string; snr: number | null }> {
  return (list ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [id, snr] = part.split(':');
      const snrNum = snr === undefined || snr === '' ? NaN : Number(snr);
      return { gatewayId: id.length === 16 ? id : EUI_PREFIX + id, snr: Number.isFinite(snrNum) ? snrNum : null };
    });
}

/** The state of a meter by how long it has been silent: the limits of the shared thresholds (live < 24 h, stale < 48 h). */
export function freshness(decodedAt: string | Date): 'live' | 'stale' | 'silent' {
  const ageMin = (Date.now() - new Date(decodedAt).getTime()) / 60000;
  if (ageMin > T.meterCriticalHours * 60) return 'silent';
  return ageMin > T.meterStaleMinutes ? 'stale' : 'live';
}

function meterItem(m: any, heard: Array<{ gatewayId: string; rssi: number | null; snr: number | null }>) {
  const status = freshness(m.decoded_at);
  const diagnostics: string[] = [];
  if (m.rssi != null && m.rssi < T.rssiWeakDbm) diagnostics.push('weak-rssi');
  if (m.snr != null && m.snr < T.snrWeakDb) diagnostics.push('poor-snr');
  if ((m.gateway_count ?? 1) > 1) diagnostics.push('multi-gw');
  return {
    meterId: m.meter_id,
    devEui: m.dev_eui,
    lastSeenDate: m.decoded_at,
    lastSeenLocal: m.local_time ?? null,
    frameAge: formatRelativeTime(m.decoded_at),
    frames1H: m.frames_1h ?? 0,
    frames24H: m.frames_24h ?? 0,
    lastRssi: m.rssi,
    lastSnr: m.snr,
    fCnt: m.f_cnt,
    fPort: m.f_port,
    frequency: m.frequency == null ? null : Number(m.frequency),
    dr: m.dr,
    adr: m.adr,
    confirmed: m.confirmed,
    otherGatewaysCount: Math.max(0, heard.length - 1),
    checksumStatus: m.checksum_status,
    meterTimestamp: m.meter_timestamp,
    statusChips: [status, ...diagnostics],
    diagnostics,
    gatewaysHeard: heard.map((h) => ({
      gatewayId: h.gatewayId,
      alias: getGatewayAlias(h.gatewayId),
      rssi: h.rssi,
      snr: h.snr,
      lastSeenText: formatRelativeTime(m.decoded_at),
      isLatest: h.gatewayId === m.gateway_id,
    })),
    forwardFlowL: m.forward_flow_kl,
    reverseFlow: m.reverse_flow_m3,
  };
}

/** The latest frame's gateways: the one that took it (with its RSSI) first, the others with the SNR they reported. */
function heardOfFrame(m: any) {
  const heard: Array<{ gatewayId: string; rssi: number | null; snr: number | null }> = [
    { gatewayId: m.gateway_id, rssi: m.rssi, snr: m.snr },
  ];
  for (const g of gatewaysFromList(m.gateway_list)) {
    if (g.gatewayId !== m.gateway_id) heard.push({ gatewayId: g.gatewayId, rssi: null, snr: g.snr });
  }
  return heard;
}

/** Frames per meter over the last hour / day (relative to now), for the meters of one page. */
async function recentCounts(meterIds: string[]): Promise<Map<string, { f1h: number; f24h: number }>> {
  if (meterIds.length === 0) return new Map();
  const res = await pool.query(
    `SELECT meter_id,
            COUNT(*) FILTER (WHERE decoded_at > NOW() - INTERVAL '1 hour')::int AS f1h,
            COUNT(*)::int AS f24h
     FROM ${TABLE}
     WHERE is_history = false AND meter_id = ANY($1::text[])
       AND time > NOW() - INTERVAL '3 days' AND decoded_at > NOW() - INTERVAL '24 hours'
     GROUP BY meter_id`,
    [meterIds]
  );
  return new Map(res.rows.map((r: any) => [r.meter_id, { f1h: r.f1h, f24h: r.f24h }]));
}

/** One meter by exact Meter ID or DevEUI: its latest frame in the window, or null when it sent none there. */
export async function getMeterDetail(opts: WindowOpts & { idOrEui: string }) {
  const s = scope(opts);
  const params = [...s.params, opts.idOrEui];
  const res = await pool.query(
    `SELECT ${FRAME_COLUMNS}, forward_flow_kl, reverse_flow_m3, ${localTime(s.zone)}
     FROM ${TABLE}
     WHERE ${s.where} AND (meter_id = $${params.length} OR dev_eui = $${params.length})
     ORDER BY decoded_at DESC
     LIMIT 1`,
    params
  );
  const m = res.rows[0];
  if (!m) return null;

  // Every gateway that took a frame of this meter in the window, plus the others named on its latest frame
  const gw = await pool.query(
    `SELECT DISTINCT ON (gateway_id) gateway_id, rssi, snr
     FROM ${TABLE}
     WHERE ${s.where} AND meter_id = $${s.params.length + 1}
     ORDER BY gateway_id, decoded_at DESC`,
    [...s.params, m.meter_id]
  );
  const heard = heardOfFrame(m);
  for (const g of gw.rows as Array<{ gateway_id: string; rssi: number | null; snr: number | null }>) {
    const known = heard.find((h) => h.gatewayId === g.gateway_id);
    if (known) {
      known.rssi = known.rssi ?? g.rssi;
    } else {
      heard.push({ gatewayId: g.gateway_id, rssi: g.rssi, snr: g.snr });
    }
  }
  const counts = (await recentCounts([m.meter_id])).get(m.meter_id);
  return {
    gatewayId: m.gateway_id as string,
    meter: meterItem({ ...m, frames_1h: counts?.f1h ?? 0, frames_24h: counts?.f24h ?? 0 }, heard),
  };
}

export type MeterStatusFilter = 'live' | 'stale' | 'silent';

/**
 * Fleet-wide meter list: each meter's latest frame (through whichever gateway took it), optionally searched and
 * filtered by freshness / radio settings, paginated in SQL.
 */
export async function listFleetMeters(
  opts: WindowOpts & {
    q?: string;
    status?: MeterStatusFilter;
    dr?: number;
    frequency?: number;
    confirmed?: boolean;
    limit: number;
    offset: number;
  }
) {
  const s = scope(opts);
  const params = [...s.params];
  let inner = s.where;
  const q = (opts.q ?? '').trim().slice(0, 64);
  if (q) {
    params.push(`%${q}%`);
    inner += ` AND (meter_id ILIKE $${params.length} OR dev_eui ILIKE $${params.length})`;
  }

  const outer: string[] = [];
  const now = Date.now();
  const liveAfter = new Date(now - T.meterStaleMinutes * 60000).toISOString();
  const silentBefore = new Date(now - T.meterCriticalHours * 3600000).toISOString();
  if (opts.status === 'live') {
    params.push(liveAfter);
    outer.push(`decoded_at > $${params.length}`);
  } else if (opts.status === 'stale') {
    params.push(liveAfter, silentBefore);
    outer.push(`decoded_at <= $${params.length - 1} AND decoded_at > $${params.length}`);
  } else if (opts.status === 'silent') {
    params.push(silentBefore);
    outer.push(`decoded_at <= $${params.length}`);
  }
  if (opts.dr !== undefined) {
    params.push(opts.dr);
    outer.push(`dr = $${params.length}`);
  }
  if (opts.frequency !== undefined) {
    params.push(opts.frequency);
    outer.push(`frequency = $${params.length}`);
  }
  if (opts.confirmed !== undefined) {
    params.push(opts.confirmed);
    outer.push(`confirmed = $${params.length}`);
  }
  const mainParams = [...params, opts.limit, opts.offset];

  const [res, facetRes] = await Promise.all([
    pool.query(
      `WITH latest AS (
         SELECT DISTINCT ON (meter_id) ${FRAME_COLUMNS}, forward_flow_kl, reverse_flow_m3, ${localTime(s.zone)}
         FROM ${TABLE}
         WHERE ${inner}
         ORDER BY meter_id, decoded_at DESC
       )
       SELECT *, COUNT(*) OVER()::int AS total FROM latest
       ${outer.length ? 'WHERE ' + outer.join(' AND ') : ''}
       ORDER BY decoded_at DESC, meter_id
       LIMIT $${mainParams.length - 1} OFFSET $${mainParams.length}`,
      mainParams
    ),
    // the values present in the window, for the data-rate and frequency drop-downs (independent of the other filters)
    pool.query(
      `SELECT array_agg(DISTINCT dr ORDER BY dr) FILTER (WHERE dr IS NOT NULL) AS dr,
              array_agg(DISTINCT frequency ORDER BY frequency) FILTER (WHERE frequency IS NOT NULL) AS frequency
       FROM ${TABLE} WHERE ${s.where}`,
      s.params
    ),
  ]);
  const counts = await recentCounts(res.rows.map((r: any) => r.meter_id));
  const items = res.rows.map((m: any) => {
    const c = counts.get(m.meter_id);
    return meterItem({ ...m, frames_1h: c?.f1h ?? 0, frames_24h: c?.f24h ?? 0 }, heardOfFrame(m));
  });
  return {
    total: res.rows[0]?.total ?? 0,
    limit: opts.limit,
    offset: opts.offset,
    items,
    facets: {
      dr: (facetRes.rows[0]?.dr ?? []).map(Number) as number[],
      frequency: (facetRes.rows[0]?.frequency ?? []).map(Number) as number[],
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Traffic over time
// ---------------------------------------------------------------------------------------------------------------------

export type TrafficBucket = '1h' | '1d';

export interface TrafficPoint {
  /** Start of the bucket on the site clock, "YYYY-MM-DDTHH:MM". */
  t: string;
  frames: number;
  meters: number;
}

const BIN: Record<TrafficBucket, (local: string) => string> = {
  '1h': (l) => `date_trunc('hour', ${l})`,
  '1d': (l) => `date_trunc('day', ${l})`,
};
const STEP: Record<TrafficBucket, string> = { '1h': `interval '1 hour'`, '1d': `interval '1 day'` };

function shiftDay(day: string, delta: number): string {
  return new Date(Date.parse(day) + delta * 86400000).toISOString().slice(0, 10);
}

/** Frames and distinct meters per bucket for the days from..to, zero-filled so a quiet bucket reads 0, not a gap. */
async function series(
  bucket: TrafficBucket,
  zone: string,
  from: string,
  to: string,
  gatewayId: string | undefined,
  siteIds: number[] | null | undefined
): Promise<TrafficPoint[]> {
  const bin = BIN[bucket];
  const params: unknown[] = [from, to];
  let filter = '';
  if (gatewayId) {
    params.push(gatewayId);
    filter += ` AND gateway_id = $${params.length}`;
  }
  if (siteIds) {
    params.push(siteIds);
    filter += siteClause(`$${params.length}`);
  }
  const res = await pool.query(
    `WITH s AS (
       SELECT generate_series(
         ${bin(`($1::date)::timestamp`)},
         ${bin(`(($2::date + 1)::timestamp - interval '1 second')`)},
         ${STEP[bucket]}) AS t
     ), d AS (
       SELECT ${bin(`(decoded_at AT TIME ZONE '${zone}')`)} AS t,
              COUNT(*)::int AS frames, COUNT(DISTINCT meter_id)::int AS meters
       FROM ${TABLE}
       WHERE is_history = false AND ${inWindow(zone, '$1', '$2')}${filter}
       GROUP BY 1
     )
     SELECT to_char(s.t, 'YYYY-MM-DD"T"HH24:MI') AS t, COALESCE(d.frames, 0) AS frames, COALESCE(d.meters, 0) AS meters
     FROM s LEFT JOIN d ON d.t = s.t
     ORDER BY s.t`,
    params
  );
  return res.rows.map((r: any) => ({ t: r.t, frames: r.frames, meters: r.meters }));
}

async function totals(zone: string, from: string, to: string, gatewayId: string | undefined, siteIds: number[] | null | undefined) {
  const params: unknown[] = [from, to];
  let filter = '';
  if (gatewayId) {
    params.push(gatewayId);
    filter += ` AND gateway_id = $${params.length}`;
  }
  if (siteIds) {
    params.push(siteIds);
    filter += siteClause(`$${params.length}`);
  }
  const res = await pool.query(
    `SELECT COUNT(*)::int AS frames, COUNT(DISTINCT meter_id)::int AS meters
     FROM ${TABLE} WHERE is_history = false AND ${inWindow(zone, '$1', '$2')}${filter}`,
    params
  );
  return res.rows[0] ?? { frames: 0, meters: 0 };
}

/** Traffic over time for one gateway, the chosen sites or the fleet, with the equal period before it. */
export async function getTraffic(opts: WindowOpts & { gatewayId?: string }) {
  const zone = safeZone(opts.zone);
  const { fromDate, toDate } = dateRange(opts.days, opts.referenceDate, opts.custom, zone);
  const span = Math.round((Date.parse(toDate) - Date.parse(fromDate)) / 86400000) + 1;
  const bucket: TrafficBucket = span <= 2 ? '1h' : '1d';
  const prevFrom = shiftDay(fromDate, -span);
  const prevTo = shiftDay(fromDate, -1);

  const [current, previousRaw, cur, prev, earliest] = await Promise.all([
    series(bucket, zone, fromDate, toDate, opts.gatewayId, opts.siteIds),
    series(bucket, zone, prevFrom, prevTo, opts.gatewayId, opts.siteIds),
    totals(zone, fromDate, toDate, opts.gatewayId, opts.siteIds),
    totals(zone, prevFrom, prevTo, opts.gatewayId, opts.siteIds),
    pool.query(`SELECT (MIN(time) AT TIME ZONE '${zone}')::date::text AS d FROM ${TABLE} WHERE is_history = false`),
  ]);
  const previous = current.map((_, i) => previousRaw[i] ?? { t: '', frames: 0, meters: 0 });
  const earliestDate: string | null = earliest.rows[0]?.d ?? null;
  return {
    bucket,
    tz: zone,
    current,
    previous,
    totals: { frames: cur.frames, meters: cur.meters, prevFrames: prev.frames, prevMeters: prev.meters },
    comparable: earliestDate !== null && prevFrom >= earliestDate,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Radio analysis
// ---------------------------------------------------------------------------------------------------------------------

/** RSSI / SNR distributions, data rate and frequency use, and the weakest / strongest meters. */
export async function getRadioHealth(opts: WindowOpts & { gatewayId?: string }) {
  const s = scope(opts);
  const params = [...s.params];
  let where = s.where;
  if (opts.gatewayId) {
    params.push(opts.gatewayId);
    where += ` AND gateway_id = $${params.length}`;
  }
  const r = T.rssiBands;
  const b = T.snrBands;

  const [totRes, drRes, freqRes, meterRes] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS frames, COUNT(DISTINCT meter_id)::int AS meters,
              AVG(rssi)::numeric(10,1)::float AS avg_rssi, AVG(snr)::numeric(10,1)::float AS avg_snr,
              COUNT(*) FILTER (WHERE rssi >= ${r.strong})::int AS r_strong,
              COUNT(*) FILTER (WHERE rssi < ${r.strong} AND rssi >= ${r.good})::int AS r_good,
              COUNT(*) FILTER (WHERE rssi < ${r.good} AND rssi >= ${r.weak})::int AS r_weak,
              COUNT(*) FILTER (WHERE rssi < ${r.weak})::int AS r_very_weak,
              COUNT(*) FILTER (WHERE snr >= ${b.excellent})::int AS s_excellent,
              COUNT(*) FILTER (WHERE snr < ${b.excellent} AND snr >= ${b.good})::int AS s_good,
              COUNT(*) FILTER (WHERE snr < ${b.good} AND snr >= ${b.marginal})::int AS s_marginal,
              COUNT(*) FILTER (WHERE snr < ${b.marginal})::int AS s_poor
       FROM ${TABLE} WHERE ${where}`,
      params
    ),
    pool.query(`SELECT dr, COUNT(*)::int AS frames FROM ${TABLE} WHERE ${where} GROUP BY dr ORDER BY dr NULLS LAST`, params),
    pool.query(`SELECT frequency, COUNT(*)::int AS frames FROM ${TABLE} WHERE ${where} GROUP BY frequency ORDER BY frequency NULLS LAST`, params),
    pool.query(
      `WITH m AS (
         SELECT meter_id,
                AVG(rssi)::numeric(10,1)::float AS avg_rssi, AVG(snr)::numeric(10,1)::float AS avg_snr, COUNT(*)::int AS frames,
                COUNT(*) FILTER (WHERE rssi < ${T.rssiWeakDbm})::int AS weak_frames,
                (array_agg(rssi ORDER BY decoded_at DESC))[1] AS last_rssi,
                (array_agg(snr ORDER BY decoded_at DESC))[1] AS last_snr
         FROM ${TABLE} WHERE ${where} GROUP BY meter_id HAVING AVG(rssi) IS NOT NULL
       )
       SELECT (SELECT COUNT(*) FROM m WHERE last_rssi < ${T.rssiWeakDbm} OR last_snr < ${T.snrWeakDb})::int AS weak_link,
              (SELECT COUNT(*) FROM m WHERE weak_frames >= 2)::int AS repeat_weak,
              (SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT meter_id AS "meterId", avg_rssi AS "avgRssi", avg_snr AS "avgSnr", frames FROM m ORDER BY avg_rssi DESC, meter_id LIMIT 5) x) AS strongest,
              (SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT meter_id AS "meterId", avg_rssi AS "avgRssi", avg_snr AS "avgSnr", frames FROM m ORDER BY avg_rssi ASC, meter_id LIMIT 5) x) AS weakest`,
      params
    ),
  ]);

  const t = totRes.rows[0];
  const m = meterRes.rows[0];
  return {
    totals: { frames: t.frames, meters: t.meters, avgRssi: t.avg_rssi, avgSnr: t.avg_snr },
    rssiBuckets: { strong: t.r_strong, good: t.r_good, weak: t.r_weak, veryWeak: t.r_very_weak },
    snrBuckets: { excellent: t.s_excellent, good: t.s_good, marginal: t.s_marginal, poor: t.s_poor },
    byDr: drRes.rows.map((x: any) => ({ dr: x.dr, frames: x.frames })),
    byFrequency: freqRes.rows.map((x: any) => ({ frequencyHz: x.frequency == null ? null : Number(x.frequency), frames: x.frames })),
    weakLinkMeters: m.weak_link,
    repeatWeakMeters: m.repeat_weak,
    strongest: m.strongest,
    weakest: m.weakest,
  };
}
