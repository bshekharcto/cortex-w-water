import { pool } from '../../db/pool.js';
import { networkHealthThresholds as T } from '../../config/networkHealth.js';
import { resolveSiteGateways } from './upstream.js';
import type { TelemetryWindow } from './windows.js';

export interface RadioMeterStat {
  meterId: string;
  avgRssi: number;
  avgSnr: number | null;
  frames: number;
}

export interface RadioHealth {
  totals: { frames: number; meters: number; avgRssi: number | null; avgSnr: number | null };
  rssiBuckets: { strong: number; good: number; weak: number; veryWeak: number };
  snrBuckets: { excellent: number; good: number; marginal: number; poor: number };
  byDr: Array<{ dr: number | null; frames: number }>;
  byFrequency: Array<{ frequencyHz: number | null; frames: number }>;
  /** Meters whose latest frame in the window had RSSI or SNR below the weak thresholds. */
  weakLinkMeters: number;
  /** Meters with two or more weak-RSSI frames in the window. */
  repeatWeakMeters: number;
  strongest: RadioMeterStat[];
  weakest: RadioMeterStat[];
}

/**
 * Radio analysis over the stored frames for one gateway, a site, or the fleet. Everything is computed from
 * packets (not just each meter's latest frame), and the bands come from the shared configuration.
 */
export async function getRadioHealth(opts: { win: TelemetryWindow; gatewayId?: string; siteId?: string }): Promise<RadioHealth> {
  const { win } = opts;
  const gateways = opts.gatewayId ? [opts.gatewayId] : await resolveSiteGateways(opts.siteId, win);
  const params: unknown[] = [win.fromDate, win.toDate, win.fromTs, win.toTs];
  let gw = '';
  if (gateways) {
    params.push(gateways);
    gw = 'AND gateway_id = ANY($5::text[])';
  }
  const where = `date_key >= $1 AND date_key <= $2 AND decoded_at >= $3 AND decoded_at <= $4 ${gw}`;
  const r = T.rssiBands;
  const s = T.snrBands;

  const [totRes, drRes, freqRes, meterRes] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS frames, COUNT(DISTINCT meter_id)::int AS meters,
              AVG(rssi)::numeric(10,1)::float AS avg_rssi, AVG(snr)::numeric(10,1)::float AS avg_snr,
              COUNT(*) FILTER (WHERE rssi >= ${r.strong})::int AS r_strong,
              COUNT(*) FILTER (WHERE rssi < ${r.strong} AND rssi >= ${r.good})::int AS r_good,
              COUNT(*) FILTER (WHERE rssi < ${r.good} AND rssi >= ${r.weak})::int AS r_weak,
              COUNT(*) FILTER (WHERE rssi < ${r.weak})::int AS r_very_weak,
              COUNT(*) FILTER (WHERE snr >= ${s.excellent})::int AS s_excellent,
              COUNT(*) FILTER (WHERE snr < ${s.excellent} AND snr >= ${s.good})::int AS s_good,
              COUNT(*) FILTER (WHERE snr < ${s.good} AND snr >= ${s.marginal})::int AS s_marginal,
              COUNT(*) FILTER (WHERE snr < ${s.marginal})::int AS s_poor
       FROM raw_telemetry_packets WHERE ${where}`,
      params
    ),
    pool.query(`SELECT dr, COUNT(*)::int AS frames FROM raw_telemetry_packets WHERE ${where} GROUP BY dr ORDER BY dr NULLS LAST`, params),
    pool.query(`SELECT frequency, COUNT(*)::int AS frames FROM raw_telemetry_packets WHERE ${where} GROUP BY frequency ORDER BY frequency NULLS LAST`, params),
    pool.query(
      `WITH m AS (
         SELECT meter_id,
                AVG(rssi)::numeric(10,1)::float AS avg_rssi, AVG(snr)::numeric(10,1)::float AS avg_snr, COUNT(*)::int AS frames,
                COUNT(*) FILTER (WHERE rssi < ${T.rssiWeakDbm})::int AS weak_frames,
                (array_agg(rssi ORDER BY decoded_at DESC))[1] AS last_rssi,
                (array_agg(snr ORDER BY decoded_at DESC))[1] AS last_snr
         FROM raw_telemetry_packets WHERE ${where} GROUP BY meter_id HAVING AVG(rssi) IS NOT NULL
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
    byDr: drRes.rows.map((x: { dr: number | null; frames: number }) => ({ dr: x.dr, frames: x.frames })),
    byFrequency: freqRes.rows.map((x: { frequency: string | null; frames: number }) => ({
      frequencyHz: x.frequency == null ? null : Number(x.frequency),
      frames: x.frames,
    })),
    weakLinkMeters: m.weak_link,
    repeatWeakMeters: m.repeat_weak,
    strongest: m.strongest,
    weakest: m.weakest,
  };
}
