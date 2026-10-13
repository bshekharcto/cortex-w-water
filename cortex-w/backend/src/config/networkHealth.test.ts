import { test } from 'node:test';
import assert from 'node:assert/strict';
import { networkHealthThresholds as T, OPERATIONAL_TZ } from './networkHealth.js';

test('a meter is connected for 7 days after its last frame; gateway freshness limits are ordered', () => {
  assert.equal(T.meterConnectedHours, 7 * 24);
  assert.ok(T.gatewayStaleMinutes < T.gatewayCriticalMinutes);
});

test('radio limits are ordered: critical is worse than weak', () => {
  assert.ok(T.rssiCriticalDbm < T.rssiWeakDbm);
  assert.ok(T.snrCriticalDb < T.snrWeakDb);
  assert.ok(T.rssiBands.strong > T.rssiBands.good && T.rssiBands.good > T.rssiBands.weak);
  assert.ok(T.snrBands.excellent > T.snrBands.good && T.snrBands.good > T.snrBands.marginal);
});

test('frame trends stay off until ingestion is fixed (see the comment in the config)', () => {
  assert.equal(T.trendsEnabled, false);
});

test('operators work in India time', () => {
  assert.equal(OPERATIONAL_TZ, 'Asia/Kolkata');
});
