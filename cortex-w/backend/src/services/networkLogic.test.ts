import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gatewayStatus, haversineM, likePattern, meterStatus, round, validCoord, withDescendants } from './networkLogic.js';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000);

test('meter status follows the Command Center limits: live < 24 h, stale < 48 h, silent beyond', () => {
  assert.equal(meterStatus(hoursAgo(1), NOW), 'live');
  assert.equal(meterStatus(hoursAgo(23.9), NOW), 'live');
  assert.equal(meterStatus(hoursAgo(24.1), NOW), 'stale');
  assert.equal(meterStatus(hoursAgo(47.9), NOW), 'stale');
  assert.equal(meterStatus(hoursAgo(48.1), NOW), 'silent');
});

test('a meter with no frame is "never", not silent; bad dates do not crash', () => {
  assert.equal(meterStatus(null, NOW), 'never');
  assert.equal(meterStatus(undefined, NOW), 'never');
  assert.equal(meterStatus('not a date', NOW), 'never');
});

test('gateway status uses the rail labels', () => {
  const base = { metersHeard: 10, lastFrame: hoursAgo(2), avgRssi: -90, avgSnr: -5 };
  assert.equal(gatewayStatus(base, NOW), 'reporting');
  assert.equal(gatewayStatus({ ...base, avgRssi: -110 }, NOW), 'degraded');
  assert.equal(gatewayStatus({ ...base, avgSnr: -16 }, NOW), 'degraded');
  assert.equal(gatewayStatus({ ...base, lastFrame: hoursAgo(30) }, NOW), 'stale');
  assert.equal(gatewayStatus({ ...base, metersHeard: 0 }, NOW), 'no-traffic');
  assert.equal(gatewayStatus({ ...base, lastFrame: null }, NOW), 'no-traffic');
  assert.equal(gatewayStatus({ ...base, avgRssi: null, avgSnr: null }, NOW), 'reporting');
});

test('haversine: zero for the same point, ~111 km per degree of latitude', () => {
  assert.equal(haversineM(20.3, 85.8, 20.3, 85.8), 0);
  const d = haversineM(20, 85, 21, 85);
  assert.ok(Math.abs(d - 111195) < 200, `got ${d}`);
});

test('validCoord rejects what cannot be drawn', () => {
  assert.equal(validCoord(20.29, 85.82), true);
  assert.equal(validCoord(0, 0), false);
  assert.equal(validCoord(91, 10), false);
  assert.equal(validCoord(10, 181), false);
  assert.equal(validCoord(NaN, 10), false);
  assert.equal(validCoord('20', '85'), false);
  assert.equal(validCoord(null, null), false);
});

test('withDescendants returns the sites and everything below, and nothing else', () => {
  const sites = [
    { id: 1, parentSite: 0 },
    { id: 2, parentSite: 1 },
    { id: 3, parentSite: 2 },
    { id: 4, parentSite: 0 },
    { id: 5, parentSite: 4 },
  ];
  assert.deepEqual(withDescendants(sites, [1]), [1, 2, 3]);
  assert.deepEqual(withDescendants(sites, [2]), [2, 3]);
  assert.deepEqual(withDescendants(sites, [1, 4]), [1, 2, 3, 4, 5]);
  assert.deepEqual(withDescendants(sites, [3]), [3]);
});

test('withDescendants does not loop on a cycle', () => {
  const sites = [{ id: 1, parentSite: 2 }, { id: 2, parentSite: 1 }];
  assert.deepEqual(withDescendants(sites, [1]), [1, 2]);
});

test('likePattern escapes wildcards so a search is literal', () => {
  assert.equal(likePattern('abc'), '%abc%');
  assert.equal(likePattern('50%_x\\'), '%50\\%\\_x\\\\%');
});

test('round keeps null and rejects non-finite numbers', () => {
  assert.equal(round(null, 1), null);
  assert.equal(round(undefined, 1), null);
  assert.equal(round(NaN, 1), null);
  assert.equal(round(-91.449, 1), -91.4);
});
