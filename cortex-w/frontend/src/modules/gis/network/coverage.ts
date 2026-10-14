import type { NetMeterStatus } from '@/services/api/networkApi';
import type { MeterPoint } from './networkModel';

/** Great-circle distance in metres. */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface MeterDistance {
  meterId: string;
  distanceM: number;
}

export interface CoverageAt {
  /** Every meter within the radius, whichever gateway it reports through. */
  total: number;
  /** Of those, the ones that report through this gateway / through another one / through none. */
  onThisGateway: number;
  onOtherGateway: number;
  noGateway: number;
  connected: number;
  disconnected: number;
  never: number;
}

export interface GatewayReach {
  /** Meters that report through the gateway. */
  metersOnGateway: number;
  /** The closest and the farthest of them, null when the gateway has none with a position. */
  nearest: MeterDistance | null;
  farthest: MeterDistance | null;
  /** Counts for any radius, without looking at the meters again. */
  coverageAt: (radiusM: number) => CoverageAt;
}

const STATUS_INDEX: Record<NetMeterStatus, 0 | 1 | 2> = { connected: 0, disconnected: 1, never: 2 };

/**
 * What a gateway reaches: from the gateway's position, the distance to every meter (sorted once), then running totals so
 * that "how many meters would a radius of R cover" is a binary search. Moving the radius slider stays smooth with 28,000
 * meters on the map.
 */
export function computeGatewayReach(points: ReadonlyArray<MeterPoint>, gateway: { gatewayId: string; lat: number; lng: number }): GatewayReach {
  const rows = points
    .map((p) => ({
      meterId: p.meterId,
      d: distanceM(gateway.lat, gateway.lng, p.lat, p.lng),
      status: STATUS_INDEX[p.status] ?? 2,
      group: p.gatewayId === gateway.gatewayId ? 0 : p.gatewayId ? 1 : 2, // this / another / none
    }))
    .sort((a, b) => a.d - b.d);

  const n = rows.length;
  // cumulative[k] = counts among the k closest meters
  const byStatus = [new Int32Array(n + 1), new Int32Array(n + 1), new Int32Array(n + 1)];
  const byGroup = [new Int32Array(n + 1), new Int32Array(n + 1), new Int32Array(n + 1)];
  rows.forEach((r, i) => {
    for (let s = 0; s < 3; s++) byStatus[s][i + 1] = byStatus[s][i] + (r.status === s ? 1 : 0);
    for (let g = 0; g < 3; g++) byGroup[g][i + 1] = byGroup[g][i] + (r.group === g ? 1 : 0);
  });

  const own = rows.filter((r) => r.group === 0);

  /** How many meters are within `radius` metres (inclusive). */
  const countWithin = (radius: number) => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (rows[mid].d <= radius) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  return {
    metersOnGateway: own.length,
    nearest: own.length ? { meterId: own[0].meterId, distanceM: own[0].d } : null,
    farthest: own.length ? { meterId: own[own.length - 1].meterId, distanceM: own[own.length - 1].d } : null,
    coverageAt: (radius) => {
      const k = countWithin(radius);
      return {
        total: k,
        onThisGateway: byGroup[0][k],
        onOtherGateway: byGroup[1][k],
        noGateway: byGroup[2][k],
        connected: byStatus[0][k],
        disconnected: byStatus[1][k],
        never: byStatus[2][k],
      };
    },
  };
}

/** "19 m", "1.2 km", "545 km". */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  return `${km < 100 ? km.toFixed(1) : Math.round(km).toLocaleString()} km`;
}
