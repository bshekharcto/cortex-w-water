import { pool } from '../../db/pool.js';
import { networkHealthThresholds as T } from '../../config/networkHealth.js';
import { getGatewayAlias } from './labels.js';
import { resolveSiteGateways } from './upstream.js';
import { dateKeyOf, referenceMs, type TelemetryWindow } from './windows.js';
import type { MeterState, PacketRow } from './types.js';
import { clientKey, ownedMeters } from './scope.js';

export const LATEST_FRAME_COLUMNS = `meter_id, gateway_id, dev_eui, decoded_at, date_key, checksum_status, status_byte,
       rssi, snr, fcnt, fport, frequency, dr, adr, confirmed, meter_timestamp`;

/**
 * Turns each meter's latest frame (through a given gateway) into the Command Center meter item, with
 * real per-window frame counts, every gateway that heard the meter, and diagnostics from the shared thresholds.
 * `scope` decides what the frame counts mean: 'gateway' = frames through the row's gateway (per-gateway table),
 * 'meter' = frames from the meter through any gateway (fleet list, search).
 */
async function buildMeterItems(rows: PacketRow[], win: TelemetryWindow, scope: 'gateway' | 'meter' = 'gateway') {
  if (rows.length === 0) return [];
  const meterIds = rows.map((r) => r.meter_id);
  const refMs = referenceMs(win);
  const hourAgo = new Date(refMs - 3600000).toISOString();
  const dayAgo = new Date(refMs - 86400000).toISOString();
  const dayAgoDate = dateKeyOf(dayAgo);

  const [heardRes, countRes] = await Promise.all([
    // Every gateway that heard each meter in the window, with its latest frame there
    pool.query(
      `SELECT DISTINCT ON (meter_id, gateway_id) meter_id, gateway_id, rssi, snr, decoded_at
       FROM raw_telemetry_packets
       WHERE meter_id = ANY($1::text[]) AND date_key >= $2 AND date_key <= $3 AND decoded_at >= $4 AND decoded_at <= $5
       ORDER BY meter_id, gateway_id, decoded_at DESC`,
      [meterIds, win.fromDate, win.toDate, win.fromTs, win.toTs]
    ),
    // Frames per meter through each gateway over the trailing hour / day (relative to the window end)
    pool.query(
      `SELECT meter_id, gateway_id,
              COUNT(*) FILTER (WHERE decoded_at > $3)::int AS f1h,
              COUNT(*)::int AS f24h
       FROM raw_telemetry_packets
       WHERE meter_id = ANY($1::text[]) AND date_key >= $2 AND decoded_at > $4 AND decoded_at <= $5
       GROUP BY meter_id, gateway_id`,
      [meterIds, dayAgoDate, hourAgo, dayAgo, win.toTs]
    ),
  ]);

  const heard = new Map<string, Array<Pick<PacketRow, 'meter_id' | 'gateway_id' | 'rssi' | 'snr' | 'decoded_at'>>>();
  for (const h of heardRes.rows) {
    const list = heard.get(h.meter_id) ?? [];
    list.push(h);
    heard.set(h.meter_id, list);
  }
  const counts = new Map<string, { f1h: number; f24h: number }>();
  for (const c of countRes.rows) {
    const key = scope === 'gateway' ? `${c.meter_id}|${c.gateway_id}` : c.meter_id;
    const prev = counts.get(key) ?? { f1h: 0, f24h: 0 };
    counts.set(key, { f1h: prev.f1h + c.f1h, f24h: prev.f24h + c.f24h });
  }

  return rows.map((m) => {
    const paths = (heard.get(m.meter_id) ?? [{ meter_id: m.meter_id, gateway_id: m.gateway_id, rssi: m.rssi, snr: m.snr, decoded_at: m.decoded_at }])
      .slice()
      .sort((a, b) => +new Date(b.decoded_at) - +new Date(a.decoded_at));
    const latestGw = paths[0].gateway_id;
    const ageMin = (refMs - new Date(m.decoded_at).getTime()) / 60000;
    // Status is freshness only: live / stale / silent. Link-quality and reach go in `diagnostics`.
    const status: MeterState =
      ageMin > T.meterCriticalHours * 60 ? 'silent' : ageMin > T.meterStaleMinutes ? 'stale' : 'live';
    const diagnostics: MeterState[] = [];
    if (m.rssi != null && m.rssi < T.rssiWeakDbm) diagnostics.push('weak-rssi');
    if (m.snr != null && m.snr < T.snrWeakDb) diagnostics.push('poor-snr');
    if (paths.length > 1) diagnostics.push('multi-gw');
    const c = counts.get(scope === 'gateway' ? `${m.meter_id}|${m.gateway_id}` : m.meter_id);

    return {
      meterId: m.meter_id,
      devEui: m.dev_eui,
      lastSeenDate: m.decoded_at,
      frames1H: c?.f1h ?? 0,
      frames24H: c?.f24h ?? 0,
      lastRssi: m.rssi,
      lastSnr: m.snr,
      fCnt: m.fcnt === -1 ? null : m.fcnt,
      fPort: m.fport,
      frequency: m.frequency == null ? null : Number(m.frequency), // BIGINT arrives as a string
      dr: m.dr,
      adr: m.adr,
      confirmed: m.confirmed,
      otherGatewaysCount: paths.length - 1,
      checksumStatus: m.checksum_status,
      statusByte: m.status_byte,
      meterTimestamp: m.meter_timestamp,
      statusChips: [status],
      diagnostics,
      gatewaysHeard: paths.map((p) => ({
        gatewayId: p.gateway_id,
        alias: getGatewayAlias(p.gateway_id),
        rssi: p.rssi,
        snr: p.snr,
        lastSeenAt: p.decoded_at,
        isLatest: p.gateway_id === latestGw,
      })),
    };
  });
}

export async function getGatewayMeters(gatewayId: string, win: TelemetryWindow) {
  const res = await pool.query(
    `SELECT DISTINCT ON (meter_id) ${LATEST_FRAME_COLUMNS}
     FROM raw_telemetry_packets
     WHERE gateway_id = $1 AND date_key >= $2 AND date_key <= $3 AND decoded_at >= $4 AND decoded_at <= $5
       AND ${ownedMeters(6)}
     ORDER BY meter_id, decoded_at DESC`,
    [gatewayId, win.fromDate, win.toDate, win.fromTs, win.toTs, await clientKey()]
  );
  return buildMeterItems(res.rows, win);
}

/**
 * Find meters by Meter ID / DevEUI substring; returns the gateway each was last heard on.
 */
export async function searchMeters(q: string, win: TelemetryWindow) {
  const res = await pool.query(
    `SELECT DISTINCT ON (meter_id) ${LATEST_FRAME_COLUMNS}
     FROM raw_telemetry_packets
     WHERE date_key >= $2 AND date_key <= $3 AND decoded_at >= $4 AND decoded_at <= $5
       AND (meter_id ILIKE $1 OR dev_eui ILIKE $1) AND ${ownedMeters(6)}
     ORDER BY meter_id, decoded_at DESC
     LIMIT 20`,
    [`%${q}%`, win.fromDate, win.toDate, win.fromTs, win.toTs, await clientKey()]
  );
  const items = await buildMeterItems(res.rows, win, 'meter');
  return items.map((meter, i) => ({ gatewayId: res.rows[i].gateway_id, meter }));
}

/** One meter by exact Meter ID or DevEUI (its latest frame in the window), or null when it has none there. */
export async function getMeter(idOrEui: string, win: TelemetryWindow) {
  const res = await pool.query(
    `SELECT DISTINCT ON (meter_id) ${LATEST_FRAME_COLUMNS}
     FROM raw_telemetry_packets
     WHERE date_key >= $2 AND date_key <= $3 AND decoded_at >= $4 AND decoded_at <= $5
       AND (meter_id = $1 OR dev_eui = $1) AND ${ownedMeters(6)}
     ORDER BY meter_id, decoded_at DESC
     LIMIT 1`,
    [idOrEui, win.fromDate, win.toDate, win.fromTs, win.toTs, await clientKey()]
  );
  if (res.rows.length === 0) return null;
  const [meter] = await buildMeterItems(res.rows, win, 'meter');
  return { gatewayId: res.rows[0].gateway_id as string, meter };
}

export type MeterStatusFilter = 'live' | 'stale' | 'silent';

/**
 * Fleet-wide meter list for the Meters view: each meter's latest frame (via whichever gateway heard it last),
 * optionally scoped to a site, searched, filtered by freshness status, and paginated server-side.
 */
/**
 * Fleet-wide meter list for the Meters view: each meter's latest frame (via whichever gateway heard it last),
 * optionally scoped to a site, searched, filtered by freshness status, and paginated server-side.
 */
export async function listFleetMeters(opts: {
  win: TelemetryWindow;
  siteId: string;
  q?: string;
  status?: MeterStatusFilter;
  /** Filters on the meter's latest frame: data rate, frequency in Hz, confirmed uplink. */
  dr?: number;
  frequency?: number;
  confirmed?: boolean;
  limit: number;
  offset: number;
}) {
  const { win, siteId } = opts;
  const siteGateways = await resolveSiteGateways(siteId, win);

  const ck = await clientKey();
  const params: unknown[] = [win.fromDate, win.toDate, win.fromTs, win.toTs, ck];
  const inner: string[] = ['date_key >= $1', 'date_key <= $2', 'decoded_at >= $3', 'decoded_at <= $4', ownedMeters(5)];
  if (siteGateways) {
    params.push(siteGateways);
    inner.push(`gateway_id = ANY($${params.length}::text[])`);
  }
  const q = (opts.q ?? '').trim();
  if (q) {
    params.push(`%${q}%`);
    inner.push(`(meter_id ILIKE $${params.length} OR dev_eui ILIKE $${params.length})`);
  }

  // Freshness status is measured against the window's end (capped at now), same as the per-gateway tags
  const refMs = referenceMs(win);
  const outer: string[] = [];
  if (opts.status) {
    const dayAgo = new Date(refMs - T.meterStaleMinutes * 60000).toISOString();
    const silentAt = new Date(refMs - T.meterCriticalHours * 3600000).toISOString();
    if (opts.status === 'live') { params.push(dayAgo); outer.push(`decoded_at > $${params.length}`); }
    else if (opts.status === 'stale') { params.push(dayAgo, silentAt); outer.push(`decoded_at <= $${params.length - 1} AND decoded_at > $${params.length}`); }
    else { params.push(silentAt); outer.push(`decoded_at <= $${params.length}`); }
  }
  if (opts.dr !== undefined) { params.push(opts.dr); outer.push(`dr = $${params.length}`); }
  if (opts.frequency !== undefined) { params.push(opts.frequency); outer.push(`frequency = $${params.length}`); }
  if (opts.confirmed !== undefined) { params.push(opts.confirmed); outer.push(`confirmed = $${params.length}`); }
  const mainParams = [...params, opts.limit, opts.offset];

  // Values present in the window/site, for the DR and frequency dropdowns (independent of the other filters)
  const facetParams: unknown[] = [win.fromDate, win.toDate, win.fromTs, win.toTs, ck];
  let facetSite = `AND ${ownedMeters(5)}`;
  if (siteGateways) {
    facetParams.push(siteGateways);
    facetSite += ' AND gateway_id = ANY($6::text[])';
  }

  const [res, facetRes] = await Promise.all([
    pool.query(
      `WITH latest AS (
         SELECT DISTINCT ON (meter_id) ${LATEST_FRAME_COLUMNS}
         FROM raw_telemetry_packets
         WHERE ${inner.join(' AND ')}
         ORDER BY meter_id, decoded_at DESC
       )
       SELECT *, COUNT(*) OVER()::int AS total FROM latest
       ${outer.length ? 'WHERE ' + outer.join(' AND ') : ''}
       ORDER BY decoded_at DESC, meter_id
       LIMIT $${mainParams.length - 1} OFFSET $${mainParams.length}`,
      mainParams
    ),
    pool.query(
      `SELECT array_agg(DISTINCT dr ORDER BY dr) FILTER (WHERE dr IS NOT NULL) AS dr,
              array_agg(DISTINCT frequency ORDER BY frequency) FILTER (WHERE frequency IS NOT NULL) AS frequency
       FROM raw_telemetry_packets
       WHERE date_key >= $1 AND date_key <= $2 AND decoded_at >= $3 AND decoded_at <= $4 ${facetSite}`,
      facetParams
    ),
  ]);
  const items = await buildMeterItems(res.rows, win, 'meter');
  const facets = {
    dr: (facetRes.rows[0]?.dr ?? []).map(Number) as number[],
    frequency: (facetRes.rows[0]?.frequency ?? []).map(Number) as number[],
  };
  return { total: res.rows[0]?.total ?? 0, limit: opts.limit, offset: opts.offset, items, facets };
}
