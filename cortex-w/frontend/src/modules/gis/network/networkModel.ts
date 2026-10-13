import type { NetGateway, NetMeter, NetMeterMapResponse, NetMeterStatus, NetGatewayStatus } from '@/services/api/networkApi';
import type { GisMeter } from '../shared/gisData';
import type { BoundingBox } from '../shared/spatialIndex';

/** A meter as the map draws it: the compact rows of /api/network/meters/map, decoded. */
export interface MeterPoint {
  meterId: string;
  assetId: number;
  lat: number;
  lng: number;
  status: NetMeterStatus;
  gatewayId: string | null;
  rssi: number | null;
  snr: number | null;
}

/** One scale for the whole page: pin colour, legend, table badge and filter all read from here. */
export const METER_STATUS_STYLE: Record<NetMeterStatus, { color: string; label: string; hint: string }> = {
  connected: { color: '#047857', label: 'Connected', hint: 'Reported in the last 7 days' },
  disconnected: { color: '#DC2626', label: 'Disconnected', hint: 'No report for more than 7 days' },
  never: { color: '#94A3B8', label: 'Never seen', hint: 'No frame received yet' },
};

export const GATEWAY_STATUS_LABEL: Record<NetGatewayStatus, string> = {
  reporting: 'Reporting',
  degraded: 'Degraded',
  stale: 'Stale',
  'no-traffic': 'No traffic',
};

export function decodeMeterRows(map: NetMeterMapResponse): MeterPoint[] {
  return map.rows.map((r) => ({
    meterId: r[0],
    assetId: r[1],
    lat: r[2],
    lng: r[3],
    status: map.statuses[r[4]] ?? 'never',
    gatewayId: r[5] >= 0 ? map.gatewayIds[r[5]] ?? null : null,
    rssi: r[6],
    snr: r[7],
  }));
}

/**
 * The box to fit the map to. A few meters with a wrong position must not decide the zoom, so with enough points the
 * outer 1% on each side is ignored.
 */
export function trimmedBounds(points: ReadonlyArray<{ lat: number; lng: number }>, trim = 0.01): BoundingBox | null {
  if (points.length === 0) return null;
  const lats = points.map((p) => p.lat).sort((a, b) => a - b);
  const lngs = points.map((p) => p.lng).sort((a, b) => a - b);
  const cut = points.length >= 100 ? Math.floor(points.length * trim) : 0;
  return { minLat: lats[cut], maxLat: lats[lats.length - 1 - cut], minLng: lngs[cut], maxLng: lngs[lngs.length - 1 - cut] };
}

export function unionBounds(a: BoundingBox | null, b: BoundingBox | null): BoundingBox | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minLat: Math.min(a.minLat, b.minLat),
    maxLat: Math.max(a.maxLat, b.maxLat),
    minLng: Math.min(a.minLng, b.minLng),
    maxLng: Math.max(a.maxLng, b.maxLng),
  };
}

/** The map search box: matches a meter id or the gateway it reports through. */
export function matchesSearch(p: Pick<MeterPoint, 'meterId' | 'gatewayId'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return p.meterId.toLowerCase().includes(q) || (p.gatewayId ?? '').includes(q);
}

/** What to show for a gateway: its stored name when it has one that is not just the id, else the address, else the id. */
export function gatewayLabel(g: { gatewayId: string; name?: string | null; address?: string | null }): string {
  const name = g.name?.trim();
  if (name && name.toLowerCase() !== g.gatewayId.toLowerCase()) return name;
  return g.address?.trim() || g.gatewayId;
}

/**
 * The meter in the shape the shared meter drawer expects. Only what is known is filled in: everything else stays
 * undefined/null so the drawer shows a dash, and `alerts` is an explicit empty list so the drawer does not make up
 * alerts from the status.
 */
export function toGisMeter(m: NetMeter, gateway?: Pick<NetGateway, 'gatewayId' | 'name' | 'address'> | null): GisMeter {
  const reading = m.currentReadingKl;
  return {
    id: m.meterId,
    assetId: m.assetId,
    meterId: m.meterId,
    devEui: m.devEui,
    householdId: m.householdId,
    householdShortId: m.householdId ? m.householdId.split('/').pop() : null,
    householdName: m.consumerName,
    locality: m.locality ?? m.siteName,
    lat: m.lat,
    lng: m.lng,
    gatewayId: m.gatewayId,
    gatewayAlias: gateway ? gatewayLabel(gateway) : m.gatewayId,
    distanceMeters: m.distanceToGatewayM,
    rssi: m.rssi,
    snr: m.snr,
    status: m.status,
    lastSeen: m.lastSeen,
    currentReadingM3: reading,
    alerts: [],
  } as unknown as GisMeter;
}
