import { pool } from '../../db/pool.js';
import { OPERATIONAL_TZ } from '../../config/networkHealth.js';
import { resolveSiteGateways } from './upstream.js';
import { dateKeyOf, type TelemetryWindow } from './windows.js';
import { clientKey, ownedMeters } from './scope.js';

export type TrafficBucket = '5m' | '15m' | '1h' | '1d';

export interface TrafficPoint {
  /** Start of the bucket in the operational timezone, "YYYY-MM-DDTHH:MM". */
  t: string;
  frames: number;
  meters: number;
}

export interface TrafficSeries {
  bucket: TrafficBucket;
  tz: string;
  current: TrafficPoint[];
  /** The previous equal-length period, aligned bucket-for-bucket with `current`. */
  previous: TrafficPoint[];
  totals: { frames: number; meters: number; prevFrames: number; prevMeters: number };
  /** False when the previous period reaches back before the first day we hold data for. */
  comparable: boolean;
}

/** Bucket size from the span: 1H -> 5 min, 6H -> 15 min, up to 2 days -> 1 hour, longer -> 1 day. */
export function pickBucket(win: Pick<TelemetryWindow, 'fromTs' | 'toTs'>): TrafficBucket {
  const spanH = (Date.parse(win.toTs) - Date.parse(win.fromTs)) / 3600000;
  if (spanH <= 1.01) return '5m';
  if (spanH <= 6.01) return '15m';
  if (spanH <= 48.01) return '1h';
  return '1d';
}

// SQL for bucketing a local (timezone-shifted) timestamp expression
const BIN: Record<TrafficBucket, (local: string) => string> = {
  '5m': (l) => `date_bin('5 minutes', ${l}, TIMESTAMP '2000-01-01')`,
  '15m': (l) => `date_bin('15 minutes', ${l}, TIMESTAMP '2000-01-01')`,
  '1h': (l) => `date_trunc('hour', ${l})`,
  '1d': (l) => `date_trunc('day', ${l})`,
};
const STEP: Record<TrafficBucket, string> = {
  '5m': `interval '5 minutes'`,
  '15m': `interval '15 minutes'`,
  '1h': `interval '1 hour'`,
  '1d': `interval '1 day'`,
};

const dayOf = (iso: string) => dateKeyOf(iso);

/**
 * Frames and distinct meters per time bucket for [fromTs, toTs), zero-filled so a quiet bucket is a 0 and not
 * a gap. Optionally limited to a set of gateways. Buckets are cut in the operational timezone.
 */
async function series(bucket: TrafficBucket, fromTs: string, toTs: string, gateways: string[] | null, ck: string): Promise<TrafficPoint[]> {
  const bin = BIN[bucket];
  const params: unknown[] = [fromTs, OPERATIONAL_TZ, toTs, dayOf(fromTs), dayOf(toTs), ck];
  let gwFilter = `AND ${ownedMeters(6)}`;
  if (gateways) {
    params.push(gateways);
    gwFilter += ' AND gateway_id = ANY($7::text[])';
  }
  const res = await pool.query(
    `WITH s AS (
       SELECT generate_series(
         ${bin(`($1::timestamptz AT TIME ZONE $2)`)},
         ${bin(`(($3::timestamptz - interval '1 millisecond') AT TIME ZONE $2)`)},
         ${STEP[bucket]}) AS t
     ), d AS (
       SELECT ${bin(`(decoded_at AT TIME ZONE $2)`)} AS t,
              COUNT(*)::int AS frames, COUNT(DISTINCT meter_id)::int AS meters
       FROM raw_telemetry_packets
       WHERE date_key >= $4 AND date_key <= $5 AND decoded_at >= $1::timestamptz AND decoded_at < $3::timestamptz ${gwFilter}
       GROUP BY 1
     )
     SELECT to_char(s.t, 'YYYY-MM-DD"T"HH24:MI') AS t, COALESCE(d.frames, 0) AS frames, COALESCE(d.meters, 0) AS meters
     FROM s LEFT JOIN d ON d.t = s.t
     ORDER BY s.t`,
    params
  );
  return res.rows.map((r: { t: string; frames: number; meters: number }) => ({ t: r.t, frames: r.frames, meters: r.meters }));
}

async function totals(fromTs: string, toTs: string, gateways: string[] | null, ck: string): Promise<{ frames: number; meters: number }> {
  const params: unknown[] = [dayOf(fromTs), dayOf(toTs), fromTs, toTs, ck];
  let gwFilter = `AND ${ownedMeters(5)}`;
  if (gateways) {
    params.push(gateways);
    gwFilter += ' AND gateway_id = ANY($6::text[])';
  }
  const res = await pool.query(
    `SELECT COUNT(*)::int AS frames, COUNT(DISTINCT meter_id)::int AS meters FROM raw_telemetry_packets
     WHERE date_key >= $1 AND date_key <= $2 AND decoded_at >= $3::timestamptz AND decoded_at < $4::timestamptz ${gwFilter}`,
    params
  );
  return res.rows[0] ?? { frames: 0, meters: 0 };
}

/** Traffic over time for one gateway, a site, or the fleet, with the previous equal period for comparison. */
export async function getTraffic(opts: { win: TelemetryWindow; gatewayId?: string; siteId?: string }): Promise<TrafficSeries> {
  const { win } = opts;
  const gateways = opts.gatewayId ? [opts.gatewayId] : await resolveSiteGateways(opts.siteId, win);
  const bucket = pickBucket(win);
  const ck = await clientKey();

  // "to" is exclusive in the queries; nudge the (inclusive) end of a custom range by 1 ms so it's covered
  const toTs = new Date(Date.parse(win.toTs) + 1).toISOString();
  const spanMs = Date.parse(toTs) - Date.parse(win.fromTs);
  const prevFromTs = new Date(Date.parse(win.fromTs) - spanMs).toISOString();

  const [current, previousRaw, cur, prev, earliest] = await Promise.all([
    series(bucket, win.fromTs, toTs, gateways, ck),
    series(bucket, prevFromTs, win.fromTs, gateways, ck),
    totals(win.fromTs, toTs, gateways, ck),
    totals(prevFromTs, win.fromTs, gateways, ck),
    pool.query(`SELECT MIN(date_key) AS d FROM raw_telemetry_packets WHERE ${ownedMeters(1)}`, [ck]),
  ]);

  // Align the previous period to the current one bucket for bucket (flooring can leave them one apart)
  const previous = current.map((_, i) => previousRaw[i] ?? { t: '', frames: 0, meters: 0 });
  const earliestDate: string | null = earliest.rows[0]?.d ?? null;
  return {
    bucket,
    tz: OPERATIONAL_TZ,
    current,
    previous,
    totals: { frames: cur.frames, meters: cur.meters, prevFrames: prev.frames, prevMeters: prev.meters },
    comparable: earliestDate !== null && dayOf(prevFromTs) >= earliestDate,
  };
}
