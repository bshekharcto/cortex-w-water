import test from 'node:test';
import assert from 'node:assert/strict';
import { gatewayFreshnessStatus } from './telemetryDbService.js';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000);
const base = { frameCount: 100, latestDecodedAt: hoursAgo(2), avgRssi: -90, avgSnr: -5 };

test('a gateway is stale only after 24 hours without a frame (the meters report once a day)', () => {
  assert.equal(gatewayFreshnessStatus({ ...base, latestDecodedAt: hoursAgo(7) }, NOW), 'reporting');
  assert.equal(gatewayFreshnessStatus({ ...base, latestDecodedAt: hoursAgo(23.9) }, NOW), 'reporting');
  assert.equal(gatewayFreshnessStatus({ ...base, latestDecodedAt: hoursAgo(24.1) }, NOW), 'stale');
});

test('no frames in the window means no traffic, whatever the other fields say', () => {
  assert.equal(gatewayFreshnessStatus({ ...base, frameCount: 0 }, NOW), 'no-traffic');
  assert.equal(gatewayFreshnessStatus({ ...base, latestDecodedAt: null }, NOW), 'no-traffic');
});

test('degraded when the average link is poor, but staleness wins', () => {
  assert.equal(gatewayFreshnessStatus({ ...base, avgRssi: -110 }, NOW), 'degraded');
  assert.equal(gatewayFreshnessStatus({ ...base, avgSnr: -16 }, NOW), 'degraded');
  assert.equal(gatewayFreshnessStatus({ ...base, avgRssi: -110, latestDecodedAt: hoursAgo(30) }, NOW), 'stale');
  assert.equal(gatewayFreshnessStatus({ ...base, avgRssi: null, avgSnr: null }, NOW), 'reporting');
});
