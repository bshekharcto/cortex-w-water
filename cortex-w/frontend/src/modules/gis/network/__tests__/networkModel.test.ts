import { describe, it, expect } from 'vitest';
import { decodeMeterRows, gatewayLabel, matchesSearch, toGisMeter, trimmedBounds, unionBounds } from '../networkModel';
import type { NetMeter, NetMeterMapResponse } from '@/services/api/networkApi';

const map: NetMeterMapResponse = {
  latestFrameAt: null,
  coordinates: { status: 'fresh', fetchedAt: null },
  summary: { total: 3, withCoordinates: 2, withoutCoordinates: 1, connected: 1, disconnected: 1, never: 1 },
  statuses: ['connected', 'disconnected', 'never'],
  gatewayIds: ['506f980000000342', '506f9800000002a5'],
  columns: [],
  rows: [
    ['0000000001', 11, 20.3, 85.8, 0, 1, -90.5, -4],
    ['0000000002', 12, 20.4, 85.9, 1, -1, null, null],
  ],
};

describe('decodeMeterRows', () => {
  it('turns the compact rows into points, resolving status and gateway indexes', () => {
    const [a, b] = decodeMeterRows(map);
    expect(a).toEqual({ meterId: '0000000001', assetId: 11, lat: 20.3, lng: 85.8, status: 'connected', gatewayId: '506f9800000002a5', rssi: -90.5, snr: -4 });
    expect(b.status).toBe('disconnected');
    expect(b.gatewayId).toBeNull();
    expect(b.rssi).toBeNull();
  });
  it('an unknown status index is treated as never seen, not as healthy', () => {
    const [p] = decodeMeterRows({ ...map, rows: [['x', 1, 1, 1, 9, -1, null, null]] });
    expect(p.status).toBe('never');
  });
});

describe('trimmedBounds', () => {
  it('is null with no points', () => expect(trimmedBounds([])).toBeNull());
  it('uses the full extent for small sets', () => {
    expect(trimmedBounds([{ lat: 1, lng: 5 }, { lat: 3, lng: 2 }])).toEqual({ minLat: 1, maxLat: 3, minLng: 2, maxLng: 5 });
  });
  it('ignores a few far-away outliers in a large set', () => {
    const pts = Array.from({ length: 200 }, (_, i) => ({ lat: 20 + i / 1000, lng: 85 + i / 1000 }));
    pts.push({ lat: 0.5, lng: 0.5 }, { lat: 80, lng: 170 });
    const b = trimmedBounds(pts)!;
    expect(b.minLat).toBeGreaterThan(19);
    expect(b.maxLat).toBeLessThan(21);
  });
});

describe('unionBounds', () => {
  it('covers both boxes and tolerates null', () => {
    const a = { minLat: 1, maxLat: 2, minLng: 1, maxLng: 2 };
    const b = { minLat: 0, maxLat: 1.5, minLng: 1.5, maxLng: 3 };
    expect(unionBounds(a, b)).toEqual({ minLat: 0, maxLat: 2, minLng: 1, maxLng: 3 });
    expect(unionBounds(null, b)).toBe(b);
    expect(unionBounds(a, null)).toBe(a);
  });
});

describe('matchesSearch', () => {
  const p = { meterId: '0024005170', gatewayId: '506f9800000002a5' };
  it('matches a meter id or gateway id fragment, case-insensitively', () => {
    expect(matchesSearch(p, '5170')).toBe(true);
    expect(matchesSearch(p, '02A5')).toBe(true);
    expect(matchesSearch(p, 'nope')).toBe(false);
    expect(matchesSearch(p, '  ')).toBe(true);
  });
  it('a meter without a gateway never matches a gateway search', () => {
    expect(matchesSearch({ meterId: '1', gatewayId: null }, 'a')).toBe(false);
  });
});

describe('gatewayLabel', () => {
  it('shows a real name, else the address, else the id', () => {
    expect(gatewayLabel({ gatewayId: 'abc', name: 'Sector 11', address: 'x' })).toBe('Sector 11');
    expect(gatewayLabel({ gatewayId: 'abc', name: 'ABC', address: 'Old Town' })).toBe('Old Town');
    expect(gatewayLabel({ gatewayId: 'abc', name: 'abc', address: null })).toBe('abc');
  });
});

describe('toGisMeter', () => {
  const m: NetMeter = {
    meterId: '0000000001', assetId: 11, devEui: null, consumerName: null, householdId: 'WS/BMC/123', locality: null, ward: null, zone: null, dma: null,
    siteId: 6394, siteName: 'BHUBANESWAR', lat: 20.3, lng: 85.8, gatewayId: 'g', distanceToGatewayM: null, status: 'disconnected', rssi: null, snr: null,
    lastSeen: null, currentReadingKl: null,
  };
  it('keeps unknown values empty and never invents alerts', () => {
    const g = toGisMeter(m) as any;
    expect(g.householdShortId).toBe('123');
    expect(g.householdName).toBeNull();
    expect(g.distanceMeters).toBeNull();
    expect(g.rssi).toBeNull();
    expect(g.alerts).toEqual([]);
    expect(g.status).toBe('disconnected');
    expect(g.locality).toBe('BHUBANESWAR'); // falls back to the real site name, not a made-up zone
  });
});
