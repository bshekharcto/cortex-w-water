import { describe, it, expect } from 'vitest';
import { deriveSiteView, siteWithDescendants } from '../networkScope';
import type { NetGateway, NetMeterMapResponse } from '@/services/api/networkApi';
import type { MeterPoint } from '../networkModel';

const sites = [
  { id: '1', parentId: null },
  { id: '2', parentId: '1' },
  { id: '3', parentId: '2' },
  { id: '4', parentId: null },
];

describe('siteWithDescendants', () => {
  it('is the site and everything below it', () => {
    expect([...siteWithDescendants(sites, '1')].sort()).toEqual([1, 2, 3]);
    expect([...siteWithDescendants(sites, '3')]).toEqual([3]);
    expect([...siteWithDescendants(sites, '4')]).toEqual([4]);
  });
});

const pt = (id: string, siteId: number, status: MeterPoint['status'], gatewayId: string | null, rssi: number | null = -90): MeterPoint => ({
  meterId: id, assetId: 1, lat: 20, lng: 85, status, gatewayId, rssi, snr: null, siteId,
});
const gw = (id: string, siteId: number | null): NetGateway => ({
  gatewayId: id, name: null, address: null, siteId, lat: 20, lng: 85, radiusM: 500, status: 'reporting',
  metersHeard: 99, liveMeters: 99, avgRssi: -50, avgSnr: null, lastFrameAt: null,
});

describe('deriveSiteView', () => {
  const points = [
    pt('a', 2, 'connected', 'g1', -100),
    pt('b', 2, 'disconnected', 'g1', -110),
    pt('c', 3, 'connected', 'g2'),
    pt('d', 4, 'connected', 'g3'),
  ];
  const all = {
    gateways: { gateways: [gw('g1', 1), gw('g2', null), gw('g3', 4), gw('g4', 2)], unplaced: [] },
    map: {
      statuses: ['connected', 'disconnected', 'never'],
      unpositioned: [[2, 2, 5], [4, 0, 7]],
    } as unknown as NetMeterMapResponse,
    points,
  };
  const view = deriveSiteView(all, siteWithDescendants(sites, '1'), { degradedRssi: -105, degradedSnr: -15 });

  it('keeps the meters of the site and the sites below it', () => {
    expect(view.points.map((p) => p.meterId)).toEqual(['a', 'b', 'c']);
  });
  it('keeps the gateways that stand in the site or hear its meters, with numbers counted from those meters', () => {
    expect(view.gateways.map((g) => g.gatewayId)).toEqual(['g1', 'g2', 'g4']);
    const g1 = view.gateways[0];
    expect(g1).toMatchObject({ metersHeard: 2, liveMeters: 1, avgRssi: -105 });
    expect(view.gateways[2]).toMatchObject({ metersHeard: 0, status: 'no-traffic' }); // g4: stands there, hears none
  });
  it('adds the meters without a position to the totals of the site', () => {
    expect(view.summary).toEqual({ total: 8, withCoordinates: 3, withoutCoordinates: 5, connected: 2, disconnected: 1, never: 5 });
  });
});
