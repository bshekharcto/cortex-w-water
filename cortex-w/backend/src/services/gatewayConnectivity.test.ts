import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BadRangeError,
  DATA_AVAILABLE_FROM,
  addDays,
  baseRangeFor,
  normalizeReport,
  normalizeTimeline,
  parseRange,
  presetRanges,
  sliceReport,
  sliceTimeline,
  startOfDayUtc,
  todayInZone,
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
  assert.throws(() => parseRange('2026-10-01', '2027-01-15', 'UTC'), BadRangeError); // longer than 92 days
  assert.throws(() => parseRange('2026-09-30', '2026-10-15', 'UTC'), BadRangeError); // before the data begins
  assert.equal(parseRange('2026-10-01', '2026-10-15', 'UTC').startDate, DATA_AVAILABLE_FROM);
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

test('the quick ranges end on the given day, and never start before the data does', () => {
  const r = presetRanges('2026-10-15', 'Asia/Kolkata');
  assert.deepEqual(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.startDate])), { '1D': '2026-10-15', '3D': '2026-10-13', '7D': '2026-10-09', '14D': '2026-10-02' });
  const early = presetRanges('2026-10-04', 'Asia/Kolkata');
  assert.equal(early['14D'].startDate, '2026-10-01');
  assert.equal(early['3D'].startDate, '2026-10-02');
});

test('"today" is the calendar day in the zone, not in UTC', () => {
  assert.equal(todayInZone('Asia/Kolkata', Date.parse('2026-10-14T20:00:00Z')), '2026-10-15');
  assert.equal(todayInZone('UTC', Date.parse('2026-10-14T20:00:00Z')), '2026-10-14');
});

test('the call runs through today so a past range still sees the gateway\'s current status', () => {
  const past = { startDate: '2026-10-03', endDate: '2026-10-08', timeZone: 'Asia/Kolkata' };
  assert.deepEqual(baseRangeFor([past], '2026-10-15'), { startDate: '2026-10-02', endDate: '2026-10-15', timeZone: 'Asia/Kolkata' });
  assert.equal(baseRangeFor([past]).endDate, '2026-10-08');
  assert.equal(baseRangeFor([past], '2026-10-05').endDate, '2026-10-08'); // never shortens the range
});

test('one upstream call covers every range: it starts a day early so that day can be dropped', () => {
  const ranges = Object.values(presetRanges('2026-10-15', 'Asia/Kolkata'));
  assert.deepEqual(baseRangeFor(ranges), { startDate: '2026-10-01', endDate: '2026-10-15', timeZone: 'Asia/Kolkata' });
  // no day before the data begins to lead with
  assert.equal(baseRangeFor([{ startDate: '2026-10-01', endDate: '2026-10-03', timeZone: 'UTC' }]).startDate, '2026-10-01');
  assert.equal(baseRangeFor([{ startDate: '2026-10-05', endDate: '2026-10-05', timeZone: 'UTC' }]).startDate, '2026-10-04');
});

const day = (date: string, online: number, offline: number, outages: number, got: number, want: number) => ({
  date, onlineSeconds: online, offlineSeconds: offline, outages, statsReceived: got, statsExpected: want,
});
const BASE_RANGE = { startDate: '2026-10-13', endDate: '2026-10-15', timeZone: 'Asia/Kolkata' };
const baseReport = normalizeReport(
  {
    gatewayConnectivityReportList: {
      content: [
        {
          gatewayId: '506f980000000260', currentStatus: 'ONLINE', lastSeenAt: '2026-10-15T03:15:29.557', uptimePercent: 50, downtimeEventCount: 99,
          onlineSeconds: 1, statsReceived: 1, statsExpected: 1, latitude: 20.2, longitude: 85.8, address: 'Meusium',
          days: [
            day('2026-10-13', 86000, 400, 3, 2860, 2880), // the leading day: dropped from every slice
            day('2026-10-14', 85000, 1400, 5, 2800, 2880),
            day('2026-10-15', 31000, 500, 2, 1040, 1048),
          ],
        },
        { gatewayId: '506f9800000002a1', currentStatus: 'NO_DATA', days: [] },
      ],
    },
  },
  BASE_RANGE,
  Date.parse('2026-10-15T03:20:00Z')
);

test('a slice is rebuilt from the per-day figures of its own days only', () => {
  const [g, empty] = sliceReport(baseReport, { startDate: '2026-10-14', endDate: '2026-10-15', timeZone: 'Asia/Kolkata' }).gateways;
  assert.equal(g.onlineSeconds, 116000); // 85000 + 31000
  assert.equal(g.observedSeconds, 117900); // + 1400 + 500 offline
  assert.ok(Math.abs(g.uptimePercent! - (116000 / 117900) * 100) < 1e-9);
  assert.equal(g.downtimeEvents, 7); // 5 + 2: the leading day's 3 are not counted
  assert.equal(g.heartbeatsReceived, 3840);
  assert.equal(g.heartbeatsExpected, 3928);
  assert.deepEqual(g.days.map((d) => d.date), ['2026-10-14', '2026-10-15']);
  assert.equal(g.status, 'online'); // what the gateway is now does not depend on the range
  assert.equal(g.lastSeenAt, '2026-10-15T03:15:29.557Z');
  assert.equal(empty.status, 'no-data');
  assert.equal(empty.downtimeEvents, 0);
});

test('a slice is the same whichever range it is cut from, and a 1D count never exceeds the same day inside 7D', () => {
  const one = sliceReport(baseReport, { startDate: '2026-10-15', endDate: '2026-10-15', timeZone: 'Asia/Kolkata' }).gateways[0];
  const two = sliceReport(baseReport, { startDate: '2026-10-14', endDate: '2026-10-15', timeZone: 'Asia/Kolkata' }).gateways[0];
  assert.equal(one.downtimeEvents, 2);
  assert.ok(one.downtimeEvents <= two.downtimeEvents);
  assert.equal(sliceReport(baseReport, baseReport.range).gateways[0].downtimeEvents, 10);
});

test('a range with no reported days has no figures, even for a gateway that is online now', () => {
  const g = sliceReport(baseReport, { startDate: '2026-10-01', endDate: '2026-10-02', timeZone: 'Asia/Kolkata' }).gateways[0];
  assert.equal(g.status, 'online');
  assert.equal(g.uptimePercent, null);
  assert.equal(g.onlineSeconds, null);
  assert.equal(g.heartbeatsExpected, null);
  assert.equal(g.downtimeEvents, 0);
});

const baseTimeline = normalizeTimeline(
  {
    segments: [
      { status: 'ONLINE', startTime: '2026-10-12T18:30:00', endTime: '2026-10-14T18:29:40', durationSeconds: 172780, reason: null },
      { status: 'OFFLINE', startTime: '2026-10-14T18:29:40', endTime: '2026-10-14T18:32:09', durationSeconds: 149, reason: 'SCHEDULED_REBOOT' },
      { status: 'ONLINE', startTime: '2026-10-14T18:32:09', endTime: '2026-10-15T03:17:03.900518946', durationSeconds: 31494, reason: null },
    ],
    currentStatus: 'ONLINE',
    lastSeenAt: '2026-10-15T03:15:29.557',
    packetDays: [
      { date: '2026-10-13', statsReceived: 2800, statsExpected: 2880 },
      { date: '2026-10-14', statsReceived: 2850, statsExpected: 2880 },
      { date: '2026-10-15', statsReceived: 1044, statsExpected: 1048 },
    ],
  },
  '506f980000000260',
  BASE_RANGE,
  Date.parse('2026-10-15T03:20:00Z')
);

test('a timeline slice clips what straddles its edges, drops what is outside, and keeps the rest as it was', () => {
  const t = sliceTimeline(baseTimeline, { startDate: '2026-10-15', endDate: '2026-10-15', timeZone: 'Asia/Kolkata' });
  assert.equal(t.range.startAt, '2026-10-14T18:30:00.000Z');
  assert.equal(t.range.endAt, '2026-10-15T18:30:00.000Z');
  assert.deepEqual(t.segments.map((s) => [s.status, s.start, s.durationSeconds]), [
    ['offline', '2026-10-14T18:30:00.000Z', 129], // the reboot that began at 18:29:40 is cut to the part inside the day
    ['online', '2026-10-14T18:32:09.000Z', 31494], // untouched
  ]);
  assert.deepEqual(t.heartbeatDays, [{ date: '2026-10-15', received: 1044, expected: 1048 }]);
  assert.equal(t.status, 'online');
});

test('a timeline slice entirely before the data has no segments', () => {
  const t = sliceTimeline(baseTimeline, { startDate: '2026-10-01', endDate: '2026-10-02', timeZone: 'Asia/Kolkata' });
  assert.deepEqual(t.segments, []);
  assert.deepEqual(t.heartbeatDays, []);
});
