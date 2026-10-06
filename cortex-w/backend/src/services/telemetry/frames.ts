import { pool } from '../../db/pool.js';
import { networkHealthThresholds as T } from '../../config/networkHealth.js';
import { getGatewayAlias } from './labels.js';
import { resolveSiteGateways } from './upstream.js';
import type { TelemetryWindow } from './windows.js';
import type { FrameDto, PacketRow } from './types.js';

/** Frame-level link quality from the shared thresholds (not water flow). */
export function frameStatusEvent(r: { rssi: number | null; snr: number | null }): FrameDto['statusEvent'] {
  if ((r.rssi != null && r.rssi < T.rssiCriticalDbm) || (r.snr != null && r.snr < T.snrCriticalDb)) return 'POOR_LINK';
  if (r.rssi != null && r.rssi < T.rssiWeakDbm) return 'WEAK_RSSI';
  return 'FRAME_RECEIVED';
}

/** One raw packet row -> the frame shape the Command Center renders. */
export function mapFrameRow(r: PacketRow, idx: number, multi: Set<string>): FrameDto {
  return {
    multiGateway: multi.has(r.meter_id),
    id: r.id != null ? `pk-${r.id}` : `pg-frame-${idx}-${r.meter_id}`,
    decodedAt: r.decoded_at,
    meterTimestamp: r.meter_timestamp || r.decoded_at,
    meterId: r.meter_id,
    devEui: r.dev_eui,
    gatewayId: r.gateway_id,
    gatewayAlias: getGatewayAlias(r.gateway_id),
    fCnt: r.fcnt === -1 ? null : r.fcnt,
    fPort: r.fport,
    frequency: r.frequency == null ? null : Number(r.frequency),
    dr: r.dr,
    rssi: r.rssi,
    snr: r.snr,
    confirmed: r.confirmed,
    adr: r.adr,
    checksumStatus: r.checksum_status,
    statusByte: r.status_byte,
    statusEvent: frameStatusEvent(r),
  };
}

/** Of these meters, the ones that more than one gateway heard in the window (any gateway, not site-scoped). */
export async function findMultiGatewayMeters(meterIds: string[], win: TelemetryWindow): Promise<Set<string>> {
  if (meterIds.length === 0) return new Set();
  const res = await pool.query(
    `SELECT meter_id FROM raw_telemetry_packets
     WHERE meter_id = ANY($1::text[]) AND date_key >= $2 AND date_key <= $3 AND decoded_at >= $4 AND decoded_at <= $5
     GROUP BY meter_id HAVING COUNT(DISTINCT gateway_id) > 1`,
    [[...new Set(meterIds)], win.fromDate, win.toDate, win.fromTs, win.toTs]
  );
  return new Set<string>(res.rows.map((r: { meter_id: string }) => r.meter_id));
}

export interface FramesPage {
  total: number;
  limit: number;
  offset: number;
  items: FrameDto[];
}

async function page(rows: Array<PacketRow & { total: number }>, win: TelemetryWindow, limit: number, offset: number): Promise<FramesPage> {
  const multi = await findMultiGatewayMeters(rows.map((r) => r.meter_id), win);
  return { total: rows[0]?.total ?? 0, limit, offset, items: rows.map((r, i) => mapFrameRow(r, i, multi)) };
}

/** Newest frames received through one gateway in the window (newest first, paginated). */
export async function getGatewayFrames(gatewayId: string, win: TelemetryWindow, limit: number, offset: number): Promise<FramesPage> {
  const res = await pool.query(
    `SELECT *, COUNT(*) OVER()::int AS total FROM raw_telemetry_packets
     WHERE gateway_id = $1 AND date_key >= $2 AND date_key <= $3 AND decoded_at >= $4 AND decoded_at <= $5
     ORDER BY decoded_at DESC
     LIMIT $6 OFFSET $7`,
    [gatewayId, win.fromDate, win.toDate, win.fromTs, win.toTs, limit, offset]
  );
  return page(res.rows, win, limit, offset);
}

/** Every frame from one meter in the window, across all gateways (newest first, paginated). */
export async function getMeterFrames(meterId: string, win: TelemetryWindow, limit: number, offset: number): Promise<FramesPage> {
  const res = await pool.query(
    `SELECT *, COUNT(*) OVER()::int AS total FROM raw_telemetry_packets
     WHERE meter_id = $1 AND date_key >= $2 AND date_key <= $3 AND decoded_at >= $4 AND decoded_at <= $5
     ORDER BY decoded_at DESC
     LIMIT $6 OFFSET $7`,
    [meterId, win.fromDate, win.toDate, win.fromTs, win.toTs, limit, offset]
  );
  const gateways = new Set<string>(res.rows.map((r: PacketRow) => r.gateway_id));
  const multi = gateways.size > 1 ? new Set([meterId]) : new Set<string>();
  return {
    total: res.rows[0]?.total ?? 0,
    limit,
    offset,
    items: res.rows.map((r: PacketRow, i: number) => mapFrameRow(r, i, multi)),
  };
}

/** Newest frames across the fleet (or one site), paginated: backs "Load more" in the live feed. */
export async function getFleetFrames(win: TelemetryWindow, siteId: string, limit: number, offset: number): Promise<FramesPage> {
  const gateways = await resolveSiteGateways(siteId, win);
  const params: unknown[] = [win.fromDate, win.toDate, win.fromTs, win.toTs];
  let siteFilter = '';
  if (gateways) {
    params.push(gateways);
    siteFilter = 'AND gateway_id = ANY($5::text[])';
  }
  params.push(limit, offset);
  const res = await pool.query(
    `SELECT *, COUNT(*) OVER()::int AS total FROM raw_telemetry_packets
     WHERE date_key >= $1 AND date_key <= $2 AND decoded_at >= $3 AND decoded_at <= $4 ${siteFilter}
     ORDER BY decoded_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return page(res.rows, win, limit, offset);
}
