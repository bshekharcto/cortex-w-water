import { describe, it, expect } from 'vitest';
import { sortGateways } from '../utils/gatewaySort';
import type { GatewayItem } from '../types/commandCenter.types';

const gw = (id: string, over: Partial<GatewayItem>): GatewayItem => ({
  gatewayId: id, alias: `GW-${id}`, uniqueMeters: 10, frameCount: 100, lastFrameDecodedAt: '2026-10-06T10:00:00Z',
  avgRssi: -90, avgSnr: -8, trendPct: null, status: 'reporting', ...over,
});

const list = [
  gw('a', { status: 'reporting', uniqueMeters: 500, lastFrameDecodedAt: '2026-10-06T10:00:00Z' }),
  gw('b', { status: 'stale', uniqueMeters: 5, lastFrameDecodedAt: '2026-10-05T01:00:00Z' }),
  gw('c', { status: 'degraded', uniqueMeters: 300, lastFrameDecodedAt: '2026-10-06T09:00:00Z' }),
  gw('d', { status: 'no-traffic', uniqueMeters: 1, lastFrameDecodedAt: null }),
  gw('e', { status: 'stale', uniqueMeters: 50, lastFrameDecodedAt: '2026-10-04T01:00:00Z' }),
];

describe('gateway rail sorting', () => {
  it('default: problem gateways first, then oldest last frame, then most meters', () => {
    expect(sortGateways(list, 'severity').map((g) => g.gatewayId)).toEqual(['d', 'e', 'b', 'c', 'a']);
  });

  it('a gateway with no frame at all counts as the oldest', () => {
    expect(sortGateways(list, 'lastFrame')[0].gatewayId).toBe('d');
  });

  it('other orders', () => {
    expect(sortGateways(list, 'meters').map((g) => g.gatewayId)).toEqual(['a', 'c', 'e', 'b', 'd']);
    expect(sortGateways(list, 'frames').every((g, i, arr) => i === 0 || arr[i - 1].frameCount >= g.frameCount)).toBe(true);
    expect(sortGateways(list, 'id').map((g) => g.gatewayId)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('never mutates its input', () => {
    const copy = [...list];
    sortGateways(list, 'meters');
    expect(list).toEqual(copy);
  });

  it('ties break on the gateway id so the order is stable', () => {
    const tied = [gw('z', {}), gw('y', {}), gw('x', {})];
    expect(sortGateways(tied, 'severity').map((g) => g.gatewayId)).toEqual(['x', 'y', 'z']);
  });
});
