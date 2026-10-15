import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BadRangeError,
  addDays,
  normalizeReport,
  normalizeTimeline,
  parseRange,
  startOfDayUtc,
  utcIso,
} from './gatewayConnectivity.js';

const RANGE = { startDate: '2026-10-15', endDate: '2026-10-15', timeZone: 'Asia/Kolkata' };

test('upstream timestamps are zone-less UTC: they get a Z, and nanoseconds are trimmed', () => {
  assert.equal(utcIso('2026-10-15T03:15:29.557'), '2026-10-15T03:15:29.557Z');
  assert.equal(utcIso('2026-10-15T03:17:03.900518946'), '2026-10-15T03:17:03.900Z');
  assert.equal(utcIso('2026-10-15T03:17:03'), '2026-10-15T03:17:03.000Z');
  assert.equal(utcIso(null), null);
  assert.equal(utcIso('yesterday'), null);
});

test('a day starts at local midnight in the zone (18:30 UTC the day before for Kolkata)', () => {
  assert.equal(new Date(startOfDayUtc('2026-10-15', 'Asia/Kolkata')).toISOString(), '2026-10-14T18:30:00.000Z');
  assert.equal(new Date(startOfDayUtc('2026-10-15', 'UTC')).toISOString(), '2026-10-15T00:00:00.000Z');
  // New York is on daylight time on 15 Oct (UTC-4) and on standard time on 15 Nov (UTC-5).
  assert.equal(new Date(startOfDayUtc('2026-10-15', 'America/New_York')).toISOString(), '2026-10-15T04:00:00.000Z');
  assert.equal(new Date(startOfDayUtc('2026-11-15', 'America/New_York')).toISOString(), '2026-11-15T05:00:00.000Z');
});

test('addDays crosses month ends', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('parseRange accepts a good range and defaults the zone', () => {
  assert.deepEqual(parseRange('2026-10-02', '2026-10-15', undefined), { startDate: '2026-10-02', endDate: '2026-10-15', timeZone: 'Asia/Kolkata' });
});

test('parseRange rejects bad input', () => {
  assert.throws(() => parseRange(undefined, '2026-10-15', 'UTC'), BadRangeError);
  assert.throws(() => parseRange('15-10-2026', '2026-10-15', 'UTC'), BadRangeError);
  assert.throws(() => parseRange('2026-02-31', '2026-03-01', 'UTC'), BadRangeError);
  assert.throws(() => parseRange('2026-10-16', '2026-10-15', 'UTC'), BadRangeError);
  assert.throws(() => parseRange('2026-01-01', '2026-10-15', 'UTC'), BadRangeError); // longer than 92 days
  assert.throws(() => parseRange('2026-10-01', '2026-10-15', 'Mars/Olympus'), BadRangeError);
  assert.throws(() => parseRange('2026-10-01', '2026-10-15', ['UTC']), BadRangeError);
});

const upstreamReport = {
  gatewayConnectivityReportList: {
    content: [
      {
        gatewayId: '506F980000000261',
        currentStatus: 'OFFLINE',
        lastSeenAt: null,
        uptimePercent: 0,
        downtimeEventCount: 1,
        onlineSeconds: 0,
        statsReceived: 0,
        statsExpected: 1048,
        latitude: 20.3,
        longitude: 85.8,
        address: 'Godakana 1',
        days: [{ date: '2026-10-15', onlineSeconds: 0, offlineSeconds: 31533, outages: 1, statsReceived: 0, statsExpected: 1048 }],
      },
      {
        gatewayId: '506f980000000260',
        currentStatus: 'ONLINE',
        lastSeenAt: '2026-10-15T03:15:29.557',
        uptimePercent: 99.1,
        downtimeEventCount: 2,
        onlineSeconds: 31255,
        statsReceived: 1044,
        statsExpected: 1048,
        latitude: 20.25,
        longitude: 85.84,
        address: 'Meusium',
        days: [{ date: '2026-10-15', onlineSeconds: 31255, offlineSeconds: 277, outages: 2, statsReceived: 1044, statsExpected: 1048 }],
      },
      { gatewayId: '506f9800000002a1', currentStatus: 'NO_DATA', lastSeenAt: null, uptimePercent: null, downtimeEventCount: 0, onlineSeconds: null, statsReceived: null, statsExpected: null, latitude: 20.27, longitude: 85.8, address: 'Unit 8', days: [] },
      { currentStatus: 'ONLINE' }, // no id: dropped
    ],
  },
  onlineCount: 1,
  offlineCount: 1,
};

test('the report is sorted, lower-cased and counted from its rows (no-data gateways included)', () => {
  const r = normalizeReport(upstreamReport, RANGE, Date.parse('2026-10-15T03:20:00Z'));
  assert.deepEqual(r.gateways.map((g) => g.gatewayId), ['506f980000000260', '506f980000000261', '506f9800000002a1']);
  assert.deepEqual(r.counts, { online: 1, offline: 1, noData: 1, total: 3 });
  assert.equal(r.generatedAt, '2026-10-15T03:20:00.000Z');
});

test('online time is measured against the observed time (online + offline), and missing data stays null', () => {
  const [online, , noData] = normalizeReport(upstreamReport, RANGE).gateways;
  assert.equal(online.status, 'online');
  assert.equal(online.observedSeconds, 31532);
  assert.equal(online.lastSeenAt, '2026-10-15T03:15:29.557Z');
  assert.equal(online.heartbeatsReceived, 1044);
  assert.equal(noData.status, 'no-data');
  assert.equal(noData.uptimePercent, null);
  assert.equal(noData.observedSeconds, null);
  assert.equal(noData.heartbeatsExpected, null);
  assert.deepEqual(noData.days, []);
});

test('an empty or malformed report is an empty fleet, not a crash', () => {
  for (const raw of [null, {}, 'oops', { gatewayConnectivityReportList: { content: 'x' } }]) {
    assert.equal(normalizeReport(raw, RANGE).counts.total, 0);
  }
});

test('the timeline keeps segments in order with Z timestamps and reports the whole requested range', () => {
  const t = normalizeTimeline(
    {
      segments: [
        { status: 'ONLINE', startTime: '2026-10-14T18:32:09', endTime: '2026-10-15T00:29:40', durationSeconds: 21451, reason: null },
        { status: 'OFFLINE', startTime: '2026-10-14T18:30:00', endTime: '2026-10-14T18:32:09', durationSeconds: 129, reason: 'SCHEDULED_REBOOT' },
        { status: 'ONLINE', startTime: 'bad', endTime: 'bad' },
      ],
      currentStatus: 'ONLINE',
      lastSeenAt: '2026-10-15T03:15:29.557',
      shortInterruptions: 0,
      packetDays: [{ date: '2026-10-15', statsReceived: 1044, statsExpected: 1048 }],
    },
    '506f980000000260',
    RANGE
  );
  assert.deepEqual(t.segments.map((s) => [s.status, s.start, s.reason]), [
    ['offline', '2026-10-14T18:30:00.000Z', 'SCHEDULED_REBOOT'],
    ['online', '2026-10-14T18:32:09.000Z', null],
  ]);
  assert.equal(t.range.startAt, '2026-10-14T18:30:00.000Z');
  assert.equal(t.range.endAt, '2026-10-15T18:30:00.000Z');
  assert.equal(t.status, 'online');
  assert.deepEqual(t.heartbeatDays, [{ date: '2026-10-15', received: 1044, expected: 1048 }]);
});
