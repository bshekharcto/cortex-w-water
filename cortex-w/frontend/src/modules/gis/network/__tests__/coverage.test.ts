import { describe, it, expect } from 'vitest';
import { computeGatewayReach, distanceM, formatDistance } from '../coverage';
import type { MeterPoint } from '../networkModel';

const gw = { gatewayId: 'g1', lat: 20, lng: 85 };
// about 111 m per 0.001 degree of latitude
const meter = (id: string, dLat: number, status: MeterPoint['status'], gatewayId: string | null): MeterPoint => ({
  meterId: id, assetId: 1, lat: 20 + dLat, lng: 85, status, gatewayId, rssi: null, snr: null,
});

describe('computeGatewayReach', () => {
  const points = [
    meter('near', 0.001, 'connected', 'g1'),
    meter('mid', 0.005, 'disconnected', 'g1'),
    meter('far', 0.02, 'connected', 'g1'),
    meter('other', 0.002, 'connected', 'g2'),
    meter('free', 0.003, 'never', null),
  ];
  const reach = computeGatewayReach(points, gw);

  it('finds the nearest and farthest meter of the gateway, and how many it has', () => {
    expect(reach.metersOnGateway).toBe(3);
    expect(reach.nearest?.meterId).toBe('near');
    expect(Math.round(reach.nearest!.distanceM)).toBe(111);
    expect(reach.farthest?.meterId).toBe('far');
  });

  it('counts what a radius covers, by gateway and by status', () => {
    expect(reach.coverageAt(50).total).toBe(0);
    const c = reach.coverageAt(400);
    expect(c.total).toBe(3); // near, other, free (0.003 deg = 333 m)
    expect(c).toMatchObject({ onThisGateway: 1, onOtherGateway: 1, noGateway: 1, connected: 2, disconnected: 0, never: 1 });
    expect(reach.coverageAt(100000).total).toBe(5);
  });

  it('a gateway with no meters has no nearest or farthest', () => {
    const r = computeGatewayReach([meter('x', 0.001, 'connected', 'g2')], gw);
    expect(r.nearest).toBeNull();
    expect(r.farthest).toBeNull();
    expect(r.metersOnGateway).toBe(0);
  });
});

describe('distance helpers', () => {
  it('zero for the same point, ~111 km per degree of latitude', () => {
    expect(distanceM(20, 85, 20, 85)).toBe(0);
    expect(Math.abs(distanceM(20, 85, 21, 85) - 111195)).toBeLessThan(200);
  });
  it('formats metres and kilometres', () => {
    expect(formatDistance(19.4)).toBe('19 m');
    expect(formatDistance(1234)).toBe('1.2 km');
    expect(formatDistance(545100)).toBe('545 km');
  });
});
