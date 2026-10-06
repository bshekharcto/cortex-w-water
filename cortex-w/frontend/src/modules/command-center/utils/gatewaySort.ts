import type { GatewayItem, GatewayState } from '../types/commandCenter.types';

export type GatewaySortKey = 'severity' | 'lastFrame' | 'meters' | 'frames' | 'id';

export const GATEWAY_SORT_OPTIONS: Array<{ key: GatewaySortKey; label: string }> = [
  { key: 'severity', label: 'Status (problems first)' },
  { key: 'lastFrame', label: 'Last frame (oldest first)' },
  { key: 'meters', label: 'Unique meters' },
  { key: 'frames', label: 'Frames' },
  { key: 'id', label: 'Gateway ID' },
];

// Lower = needs attention sooner
const SEVERITY: Record<GatewayState, number> = {
  'never-observed': 0,
  'no-traffic': 0,
  stale: 1,
  degraded: 2,
  reporting: 3,
};

const lastFrameMs = (g: GatewayItem) => (g.lastFrameDecodedAt ? new Date(g.lastFrameDecodedAt).getTime() : -Infinity);

/**
 * Sorts gateways for the rail without mutating the input. Default ('severity') follows the spec:
 * problem gateways first, then oldest last frame first, then most unique meters.
 */
export function sortGateways(list: GatewayItem[], key: GatewaySortKey): GatewayItem[] {
  const byId = (a: GatewayItem, b: GatewayItem) => a.gatewayId.localeCompare(b.gatewayId);
  const cmp: Record<GatewaySortKey, (a: GatewayItem, b: GatewayItem) => number> = {
    severity: (a, b) =>
      SEVERITY[a.status] - SEVERITY[b.status] ||
      lastFrameMs(a) - lastFrameMs(b) ||
      b.uniqueMeters - a.uniqueMeters ||
      byId(a, b),
    lastFrame: (a, b) => lastFrameMs(a) - lastFrameMs(b) || byId(a, b),
    meters: (a, b) => b.uniqueMeters - a.uniqueMeters || byId(a, b),
    frames: (a, b) => b.frameCount - a.frameCount || byId(a, b),
    id: byId,
  };
  return [...list].sort(cmp[key]);
}
