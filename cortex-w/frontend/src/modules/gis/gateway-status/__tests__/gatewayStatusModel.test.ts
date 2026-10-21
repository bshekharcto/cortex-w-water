import { describe, expect, it } from 'vitest';
import type { GatewayConnectivity, GatewayTimeline } from '@/services/api/gatewayStatusApi';
import {
  addMonths,
  axisTicks,
  DATA_AVAILABLE_FROM,
  clampView,
  computeTimelineStats,
  dataExtent,
  filterGateways,
  fmtDateTime,
  fmtDuration,
  fmtHeartbeats,
  fmtHm,
  dayPickable,
  monthGrid,
  monthLabel,
  offlinePeriods,
  pickDay,
  presetOf,
  presetRange,
  rangeFromParams,
  rangeToParams,
  sortGateways,
  tickLabel,
  viewAround,
  zoomAnchor,
  zoomView,
} from '../gatewayStatusModel';

// 15 Oct 2026, 08:45 in Kolkata
const NOW = Date.parse('2026-10-15T03:15:00Z');

describe('ranges', () => {
  it('presets end today in Kolkata and reach back N-1 days', () => {
    expect(presetRange('1D', NOW)).toMatchObject({ startDate: '2026-10-15', endDate: '2026-10-15' });
    expect(presetRange('14D', NOW)).toMatchObject({ startDate: '2026-10-02', endDate: '2026-10-15' });
  });

  it('"today" follows the zone, not the browser: 23:00 UTC on the 14th is already the 15th in Kolkata', () => {
    expect(presetRange('1D', Date.parse('2026-10-14T23:00:00Z')).endDate).toBe('2026-10-15');
  });

  it('never reaches back before the data begins (1 Oct 2026)', () => {
    expect(DATA_AVAILABLE_FROM).toBe('2026-10-01');
    const early = Date.parse('2026-10-04T05:00:00Z');
    expect(presetRange('14D', early)).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-04' });
    expect(presetRange('3D', early)).toMatchObject({ startDate: '2026-10-02', endDate: '2026-10-04' });
    // (on those first days 7D and 14D are the same shortened range, so the buttons cannot tell them apart; not a concern from 14 Oct on)
    // an address reaching further back is cut to the data; one wholly before it is ignored
    expect(rangeFromParams(new URLSearchParams('start=2026-09-20&end=2026-10-05'), NOW)).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-05' });
    expect(rangeFromParams(new URLSearchParams('start=2026-09-01&end=2026-09-20'), NOW)).toEqual(presetRange('1D', NOW));
  });

  it('a range that matches a preset lights it up; a hand-picked one does not', () => {
    expect(presetOf(presetRange('7D', NOW), NOW)).toBe('7D');
    expect(presetOf({ startDate: '2026-10-01', endDate: '2026-10-09', timeZone: 'Asia/Kolkata' }, NOW)).toBeNull();
  });

  it('survives a round trip through the address, and bad addresses fall back to 1D', () => {
    for (const p of ['3D', '14D'] as const) {
      const r = presetRange(p, NOW);
      expect(rangeFromParams(new URLSearchParams(rangeToParams(r, NOW)), NOW)).toEqual(r);
    }
    const custom = { startDate: '2026-10-02', endDate: '2026-10-09', timeZone: 'Asia/Kolkata' };
    expect(rangeFromParams(new URLSearchParams(rangeToParams(custom, NOW)), NOW)).toEqual(custom);
    expect(rangeToParams(presetRange('1D', NOW), NOW)).toEqual({});
    expect(rangeFromParams(new URLSearchParams('start=nope&end=2026-10-01'), NOW)).toEqual(presetRange('1D', NOW));
    expect(rangeFromParams(new URLSearchParams('start=2026-10-09&end=2026-10-01'), NOW)).toEqual(presetRange('1D', NOW));
    expect(rangeFromParams(new URLSearchParams('start=2026-01-01&end=2026-10-01'), NOW)).toEqual(presetRange('1D', NOW));
  });
});

describe('formatting', () => {
  it('shows times in Kolkata, to the second', () => {
    expect(fmtDateTime('2026-10-15T03:11:26.000Z')).toBe('15 Oct 2026, 08:41:26');
    expect(fmtDateTime('2026-10-14T18:30:00.000Z')).toBe('15 Oct 2026, 00:00:00');
    expect(fmtDateTime(null)).toBe('—');
  });

  it('formats durations', () => {
    expect(fmtHm(31_000)).toBe('8h 36m');
    expect(fmtHm(0)).toBe('0m');
    expect(fmtHm(null)).toBe('—');
    expect(fmtDuration(149)).toBe('2m 29s');
    expect(fmtDuration(9)).toBe('9s');
    expect(fmtDuration(31_080)).toBe('8h 38m');
  });

  it('formats heartbeats like the beta, and never goes negative on a surplus', () => {
    expect(fmtHeartbeats({ heartbeatsReceived: 1036, heartbeatsExpected: 1040 })).toBe('1,036 / 1,040 (99.6%) · missed 4');
    expect(fmtHeartbeats({ heartbeatsReceived: 1042, heartbeatsExpected: 1040 })).toBe('1,042 / 1,040 (100.2%) · missed 0');
    expect(fmtHeartbeats({ heartbeatsReceived: 0, heartbeatsExpected: 1040 })).toBe('0 / 1,040 (0.0%) · missed 1,040');
    expect(fmtHeartbeats({ heartbeatsReceived: null, heartbeatsExpected: null })).toBe('—');
  });
});

const gw = (over: Partial<GatewayConnectivity>): GatewayConnectivity => ({
  gatewayId: '506f980000000260',
  status: 'online',
  lastSeenAt: '2026-10-15T03:11:26.000Z',
  uptimePercent: 99,
  onlineSeconds: 100,
  observedSeconds: 101,
  downtimeEvents: 1,
  heartbeatsReceived: 99,
  heartbeatsExpected: 100,
  latitude: 20,
  longitude: 85,
  address: 'Meusium',
  days: [],
  ...over,
});

describe('table', () => {
  const rows = [
    gw({ gatewayId: '506f980000000261', uptimePercent: 87, status: 'online' }),
    gw({ gatewayId: '506f980000000262', uptimePercent: 0, status: 'offline', lastSeenAt: null }),
    gw({ gatewayId: '506f9800000002a1', uptimePercent: null, status: 'no-data', lastSeenAt: null, heartbeatsReceived: null, heartbeatsExpected: null }),
  ];

  it('sorts by uptime either way, with rows lacking a value always last', () => {
    expect(sortGateways(rows, 'uptime', 'asc').map((g) => g.gatewayId)).toEqual(['506f980000000262', '506f980000000261', '506f9800000002a1']);
    expect(sortGateways(rows, 'uptime', 'desc').map((g) => g.gatewayId)).toEqual(['506f980000000261', '506f980000000262', '506f9800000002a1']);
  });

  it('sorts by status with the trouble first, and does not mutate its input', () => {
    const before = rows.map((g) => g.gatewayId);
    expect(sortGateways(rows, 'status', 'asc').map((g) => g.status)).toEqual(['offline', 'no-data', 'online']);
    expect(rows.map((g) => g.gatewayId)).toEqual(before);
  });

  it('filters by state and by gateway ID only (never by address)', () => {
    expect(filterGateways(rows, 'offline', '').map((g) => g.gatewayId)).toEqual(['506f980000000262']);
    expect(filterGateways(rows, 'all', '  2A1 ').map((g) => g.gatewayId)).toEqual(['506f9800000002a1']);
    expect(filterGateways(rows, 'all', 'meusium')).toHaveLength(0); // an address, not an ID
    expect(filterGateways(rows, 'all', 'zzz')).toHaveLength(0);
  });

  it('sorts by address, without an address always last', () => {
    const withAddress = [
      { ...rows[0], gatewayId: 'a', address: 'Sadar' },
      { ...rows[0], gatewayId: 'b', address: null },
      { ...rows[0], gatewayId: 'c', address: 'Khandagiri' },
    ];
    expect(sortGateways(withAddress, 'address', 'asc').map((g) => g.gatewayId)).toEqual(['c', 'a', 'b']);
    expect(sortGateways(withAddress, 'address', 'desc').map((g) => g.gatewayId)).toEqual(['a', 'c', 'b']);
  });
});

const timeline = (over: Partial<GatewayTimeline> = {}): GatewayTimeline => ({
  gatewayId: '506f980000000260',
  status: 'online',
  lastSeenAt: '2026-10-15T03:15:29.557Z',
  historyAvailableFrom: null,
  range: { startDate: '2026-10-15', endDate: '2026-10-15', timeZone: 'Asia/Kolkata', startAt: '2026-10-14T18:30:00.000Z', endAt: '2026-10-15T18:30:00.000Z' },
  generatedAt: '2026-10-15T03:17:03.000Z',
  segments: [
    { status: 'offline', start: '2026-10-14T18:30:00.000Z', end: '2026-10-14T18:32:09.000Z', durationSeconds: 129, reason: 'SCHEDULED_REBOOT' },
    { status: 'online', start: '2026-10-14T18:32:09.000Z', end: '2026-10-15T00:29:40.000Z', durationSeconds: 21451, reason: null },
    { status: 'offline', start: '2026-10-15T00:29:40.000Z', end: '2026-10-15T00:32:09.000Z', durationSeconds: 149, reason: 'SCHEDULED_REBOOT' },
    { status: 'online', start: '2026-10-15T00:32:09.000Z', end: '2026-10-15T03:15:33.000Z', durationSeconds: 9804, reason: null },
  ],
  heartbeatDays: [{ date: '2026-10-15', received: 1040, expected: 1044 }],
  ...over,
});

describe('timeline stats', () => {
  it('reproduces the beta: 99.1% up, 2 offline periods, 2m 29s longest, the gap to "now" is no data', () => {
    const s = computeTimelineStats(timeline());
    expect(s.offlinePeriods).toBe(2);
    expect(s.offlineSeconds).toBe(278);
    expect(s.longestOutageSeconds).toBe(149);
    expect(s.onlineSeconds).toBe(31255);
    expect(s.uptimePercent).toBeCloseTo(99.12, 1);
    expect(s.downtimePercent).toBeCloseTo(0.88, 1);
    // the data ends 03:15:33 and the report was made at 03:17:03: 90 s
    expect(s.noDataSeconds).toBe(90);
    expect(s.heartbeatPercent).toBeCloseTo(99.6, 1);
  });

  it('counts only what lies inside the range', () => {
    const s = computeTimelineStats(
      timeline({ segments: [{ status: 'offline', start: '2026-10-14T18:00:00.000Z', end: '2026-10-14T18:40:00.000Z', durationSeconds: 2400, reason: null }] })
    );
    expect(s.offlineSeconds).toBe(600);
  });

  it('no segments at all: no percentages, everything so far is no data', () => {
    const s = computeTimelineStats(timeline({ segments: [], heartbeatDays: [] }));
    expect(s.uptimePercent).toBeNull();
    expect(s.heartbeatPercent).toBeNull();
    expect(s.noDataSeconds).toBe(31623); // 18:30:00 -> 03:17:03
  });

  it('lists offline periods and marks one that is still going', () => {
    const t = timeline();
    expect(offlinePeriods(t).map((p) => [p.index, p.ongoing])).toEqual([[1, false], [2, false]]);
    const down = timeline({
      status: 'offline',
      segments: [{ status: 'offline', start: '2026-10-15T00:00:00.000Z', end: '2026-10-15T03:16:00.000Z', durationSeconds: 11760, reason: null }],
    });
    expect(offlinePeriods(down)[0].ongoing).toBe(true);
  });
});

describe('chart axis', () => {
  const full = { from: Date.parse('2026-10-14T18:30:00Z'), to: Date.parse('2026-10-15T18:30:00Z') };

  it('puts ticks on round local hours, 6 hours apart over a day', () => {
    const { ticks, step } = axisTicks(full, 'Asia/Kolkata');
    expect(step).toBe(6 * 3_600_000);
    expect(ticks.map((t) => tickLabel(t, step, full.to - full.from, 'Asia/Kolkata'))).toEqual(['00:00', '06:00', '12:00', '18:00', '00:00']);
  });

  it('labels with dates once the window is longer than a day', () => {
    const week = { from: full.from, to: full.from + 7 * 86_400_000 };
    const { ticks, step } = axisTicks(week, 'Asia/Kolkata');
    expect(step).toBe(86_400_000);
    expect(tickLabel(ticks[0], step, week.to - week.from, 'Asia/Kolkata')).toBe('15 Oct');
  });

  it('zooming keeps the window inside the range and never below a minute', () => {
    const zoomedIn = zoomView(full, full, 0.5);
    expect(zoomedIn.to - zoomedIn.from).toBe((full.to - full.from) / 2);
    expect(zoomView(full, full, 2)).toEqual(full);
    const tiny = clampView({ from: full.from, to: full.from + 1 }, full);
    expect(tiny.to - tiny.from).toBe(60_000);
    const outside = clampView({ from: full.to - 1000, to: full.to + 5000 }, full);
    expect(outside.to).toBe(full.to);
  });

  it('zooming in aims at the data on screen, not the empty rest of the day', () => {
    // reports cover 00:00-08:50 IST of a day shown 00:00-24:00
    const extent = dataExtent([{ start: '2026-10-14T18:30:00.000Z', end: '2026-10-15T03:20:00.000Z' }]);
    expect(extent).toEqual({ from: Date.parse('2026-10-14T18:30:00Z'), to: Date.parse('2026-10-15T03:20:00Z') });
    let view = full;
    for (let i = 0; i < 3; i++) view = zoomView(view, full, 0.5, zoomAnchor(view, extent));
    expect(view.from).toBeLessThan(extent!.to);
    expect(view.to).toBeGreaterThan(extent!.from);
    expect(view.to - view.from).toBe((full.to - full.from) / 8);
    // with the data out of view there is nothing to aim at: the window's own centre
    const away = { from: Date.parse('2026-10-15T10:00:00Z'), to: Date.parse('2026-10-15T12:00:00Z') };
    expect(zoomAnchor(away, extent)).toBe((away.from + away.to) / 2);
    expect(zoomAnchor(full, null)).toBe((full.from + full.to) / 2);
    expect(dataExtent([])).toBeNull();
  });

  it('jumps to a period with room around it', () => {
    const v = viewAround({ start: '2026-10-15T00:29:40.000Z', end: '2026-10-15T00:32:09.000Z' }, full);
    expect(v.from).toBeLessThan(Date.parse('2026-10-15T00:29:40Z'));
    expect(v.to).toBeGreaterThan(Date.parse('2026-10-15T00:32:09Z'));
    expect(v.to - v.from).toBeLessThan(3_600_000);
  });
});

describe('calendar', () => {
  it('lays a month out in Sunday-first weeks, padded with blanks', () => {
    const grid = monthGrid('2026-10'); // 1 Oct 2026 is a Thursday
    expect(grid[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid.flat().filter(Boolean)).toHaveLength(31);
    expect(grid[grid.length - 1].filter(Boolean).pop()).toBe('2026-10-31');
    expect(monthGrid('2026-02').flat().filter(Boolean)).toHaveLength(28);
  });

  it('moves between months across a year end and labels them', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthLabel('2026-10')).toBe('October 2026');
  });

  it('two clicks make a range, in either order, and a third starts over', () => {
    const first = pickDay(null, '2026-10-09');
    expect(first).toEqual({ start: '2026-10-09', end: null });
    expect(pickDay(first, '2026-10-12')).toEqual({ start: '2026-10-09', end: '2026-10-12' });
    expect(pickDay(first, '2026-10-02')).toEqual({ start: '2026-10-02', end: '2026-10-09' });
    expect(pickDay({ start: '2026-10-02', end: '2026-10-09' }, '2026-10-12')).toEqual({ start: '2026-10-12', end: null });
  });

  it('days before the data begins cannot be picked', () => {
    expect(dayPickable('2026-09-30', null, '2026-10-15')).toBe(false);
    expect(dayPickable('2026-10-01', null, '2026-10-15')).toBe(true);
    expect(dayPickable('2026-09-30', { start: '2026-10-05', end: null }, '2026-10-15')).toBe(false);
  });

  it('future days and days that would make the range too long cannot be picked', () => {
    expect(dayPickable('2026-10-16', null, '2026-10-15')).toBe(false);
    expect(dayPickable('2026-10-15', null, '2026-10-15')).toBe(true);
    const half = { start: '2026-10-15', end: null };
    const anyTime = '2000-01-01'; // the limit is tested apart from the start of the data
    expect(dayPickable('2026-07-16', half, '2026-10-15', anyTime)).toBe(true); // exactly 92 days
    expect(dayPickable('2026-07-15', half, '2026-10-15', anyTime)).toBe(false); // 93
    expect(dayPickable('2026-10-05', { start: '2026-10-15', end: '2026-10-15' }, '2026-10-15')).toBe(true); // a finished range: any day starts a new one
  });
});
