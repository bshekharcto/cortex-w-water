import test from 'node:test';
import assert from 'node:assert/strict';
import { freshness, gatewaysFromList } from './commandCenterDeep.js';

test('gateway_list: short ids get the shared EUI prefix, the SNR each gateway reported is kept', () => {
  assert.deepEqual(gatewaysFromList('029c:-10.5,0262:-20.8'), [
    { gatewayId: '506f98000000029c', snr: -10.5 },
    { gatewayId: '506f980000000262', snr: -20.8 },
  ]);
});

test('gateway_list: full ids, empty, missing and malformed entries', () => {
  assert.deepEqual(gatewaysFromList('506f98000000029c:3.0'), [{ gatewayId: '506f98000000029c', snr: 3 }]);
  assert.deepEqual(gatewaysFromList(''), []);
  assert.deepEqual(gatewaysFromList(null), []);
  assert.deepEqual(gatewaysFromList('029c'), [{ gatewayId: '506f98000000029c', snr: null }]);
});

test('freshness: connected within 7 days of the last frame, disconnected after', () => {
  const ago = (h: number) => new Date(Date.now() - h * 3600000);
  assert.equal(freshness(ago(1)), 'connected');
  assert.equal(freshness(ago(100)), 'connected');
  assert.equal(freshness(ago(170)), 'disconnected');
});
