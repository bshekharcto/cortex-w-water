import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickBucket } from './traffic.js';

const span = (hours: number) => ({ fromTs: '2026-10-06T00:00:00.000Z', toTs: new Date(Date.parse('2026-10-06T00:00:00.000Z') + hours * 3600000).toISOString() });

test('bucket size follows the window: 1H 5m, 6H 15m, 24H 1h, 7D and longer 1d', () => {
  assert.equal(pickBucket(span(1)), '5m');
  assert.equal(pickBucket(span(6)), '15m');
  assert.equal(pickBucket(span(24)), '1h');
  assert.equal(pickBucket(span(48)), '1h');
  assert.equal(pickBucket(span(24 * 7)), '1d');
  assert.equal(pickBucket(span(24 * 30)), '1d');
});

test('a custom range of up to two days still gets hourly buckets', () => {
  // 2026-10-01 .. 2026-10-02 inclusive = 48h
  assert.equal(pickBucket({ fromTs: '2026-10-01T00:00:00.000Z', toTs: '2026-10-02T23:59:59.999Z' }), '1h');
  assert.equal(pickBucket({ fromTs: '2026-10-01T00:00:00.000Z', toTs: '2026-10-03T23:59:59.999Z' }), '1d');
});
