import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameStatusEvent, mapFrameRow } from './frames.js';
import type { PacketRow } from './types.js';

test('frame status follows the shared RSSI/SNR thresholds', () => {
  assert.equal(frameStatusEvent({ rssi: -80, snr: 5 }), 'FRAME_RECEIVED');
  assert.equal(frameStatusEvent({ rssi: -96, snr: 5 }), 'WEAK_RSSI'); // below -95
  assert.equal(frameStatusEvent({ rssi: -106, snr: 5 }), 'POOR_LINK'); // below -105
  assert.equal(frameStatusEvent({ rssi: -80, snr: -19 }), 'POOR_LINK'); // below -18
  assert.equal(frameStatusEvent({ rssi: null, snr: null }), 'FRAME_RECEIVED'); // unknown is not "bad"
});

const row: PacketRow = {
  id: 7, meter_id: '0025011333', gateway_id: '506f9800000002a0', dev_eui: 'abc', decoded_at: '2026-10-05T05:04:20Z',
  date_key: '2026-10-05', checksum_status: 'OK', status_byte: 168, rssi: -90, snr: -8, fcnt: 3, fport: 12,
  frequency: '865062500', dr: 0, adr: false, confirmed: true, meter_timestamp: '2037-08-05 10:01:00',
};

test('mapFrameRow: BIGINT frequency becomes a number, ids are stable, alias comes from the gateway id', () => {
  const f = mapFrameRow(row, 0, new Set());
  assert.equal(f.frequency, 865062500);
  assert.equal(f.id, 'pk-7');
  assert.equal(f.gatewayAlias, 'GW-02A0');
  assert.equal(f.multiGateway, false);
  assert.equal(f.meterTimestamp, '2037-08-05 10:01:00'); // the meter's own (wrong) clock is passed through untouched
});

test('mapFrameRow: the -1 "no FCnt" sentinel and missing values are reported as null, never invented', () => {
  const f = mapFrameRow({ ...row, fcnt: -1, frequency: null, rssi: null, snr: null, meter_timestamp: null }, 0, new Set(['0025011333']));
  assert.equal(f.fCnt, null);
  assert.equal(f.frequency, null);
  assert.equal(f.rssi, null);
  assert.equal(f.multiGateway, true);
  assert.equal(f.meterTimestamp, row.decoded_at); // falls back to the received time only for display
});
