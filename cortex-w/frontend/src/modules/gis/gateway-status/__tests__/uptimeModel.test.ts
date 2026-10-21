import { describe, expect, it } from 'vitest';
import type { ConnectivityReport, GatewayConnectivity } from '@/services/api/gatewayStatusApi';
import {
  bucketOf,
  buildCell,
  buildRow,
  buildUptime,
  cellText,
  datesBetween,
  filterRows,
  sortRows,
  uptimePresetOf,
  uptimePresetRange,
  uptimeRangeFromParams,
  uptimeRangeToParams,
  avgText,
} from '../uptimeModel';
import { uptimeCsv, uptimeWorkbook, exportBaseName } from '../uptimeExport';

const TODAY = '2026-10-21';
const h = (hh: number, mm = 0) => (hh * 60 + mm) * 60;
const day = (date: string, online: number, offline: number) => ({ date, onlineSeconds: online, offlineSeconds: offline, outages: 0, heartbeatsReceived: 0, heartbeatsExpected: 0 });
// a normal fully-watched day: the service leaves about a minute out of 24:00
const full = (date: string, onlineSeconds: number) => day(date, onlineSeconds, 86_340 - onlineSeconds);

const gw = (id: string, days: ReturnType<typeof day>[], over: Partial<GatewayConnectivity> = {}): GatewayConnectivity => ({
  gatewayId: id, status: 'online', lastSeenAt: null, uptimePercent: null, onlineSeconds: null, observedSeconds: null, downtimeEvents: 0,
  heartbeatsReceived: null, heartbeatsExpected: null, latitude: null, longitude: null, address: null, days, ...over,
});

/** Online seconds that show as `hm` (whole minutes, rounded down) and as `pct` (rounded down to a tenth), as in the reference. */
const secondsFor = (hm: string, pct: number): number => {
  const [hh, mm] = hm.split(':').map(Number);
  const floorMin = (hh * 60 + mm) * 60;
  const s = Math.max(floorMin, Math.ceil(pct * 864));
  if (s >= floorMin + 60 || Math.floor((s / 864) * 10) / 10 !== pct) throw new Error(`no seconds give ${hm} and ${pct}`);
  return s;
};

describe('a day\'s cell (the figures of the reference charts)', () => {
  it('shows minutes rounded down, and the percentage of 24 hours rounded DOWN to a tenth: 22:04:40 is 91.9, never 92.0', () => {
    const a = buildCell(full('2026-10-06', h(23, 18) + 30), '2026-10-06', TODAY);
    expect(a).toMatchObject({ kind: 'full', minutes: 23 * 60 + 18 });
    expect(cellText(a, 'hours')).toBe('23:18');
    expect(cellText(a, 'percent')).toBe('97.1');
    const b = buildCell(full('2026-10-08', h(22, 4) + 40), '2026-10-08', TODAY);
    expect(cellText(b, 'hours')).toBe('22:04');
    expect(cellText(b, 'percent')).toBe('91.9');
    // 23:55 is 99.65%: it reads 99.6, not 99.7
    expect(cellText(buildCell(full('2026-10-07', h(23, 55)), '2026-10-07', TODAY), 'percent')).toBe('99.6');
    // a whole day online is 100.0
    expect(cellText(buildCell(day('2026-10-07', 86_400, 0), '2026-10-07', TODAY), 'percent')).toBe('100.0');
  });

  it('a day with nothing recorded is "–", and a gateway that was down all day is a real 0', () => {
    expect(cellText(buildCell(undefined, '2026-10-06', TODAY), 'hours')).toBe('–');
    expect(cellText(buildCell(day('2026-10-06', 0, 0), '2026-10-06', TODAY), 'percent')).toBe('–');
    const down = buildCell(day('2026-10-08', 0, 86_400), '2026-10-08', TODAY);
    expect(down.kind).toBe('full');
    expect(cellText(down, 'hours')).toBe('0:00');
    expect(cellText(down, 'percent')).toBe('0.0');
  });

  it('a day the gateway was watched for only part of is marked *, with the percentage of the time watched (10:50 of 10:53 = 99.5)', () => {
    const c = buildCell(day('2026-10-09', h(10, 50) + 10, h(0, 3) - 10), '2026-10-09', TODAY);
    expect(c.kind).toBe('partial');
    expect(cellText(c, 'hours')).toBe('10:50*');
    expect(cellText(c, 'percent')).toBe('99.5*');
  });

  it('today is always partial: the day is not over', () => {
    const c = buildCell(day(TODAY, h(9, 14), h(2, 14)), TODAY, TODAY);
    expect(c.kind).toBe('partial');
    expect(cellText(c, 'percent')).toBe('80.5*');
  });

  it('reproduces the reference chart cell for cell (gateway 02a2: hours and percent of the same day)', () => {
    const ref: Array<[string, number]> = [['23:48', 99.2], ['23:51', 99.4], ['23:16', 97.0], ['22:56', 95.5], ['23:23', 97.4], ['23:54', 99.6], ['23:55', 99.7], ['23:32', 98.0], ['23:55', 99.6], ['23:46', 99.0], ['21:41', 90.4]];
    ref.forEach(([hm, pct], i) => {
      const c = buildCell(full(`2026-10-${10 + i}`, secondsFor(hm, pct)), `2026-10-${10 + i}`, TODAY);
      expect([cellText(c, 'hours'), cellText(c, 'percent')]).toEqual([hm, pct.toFixed(1)]);
    });
  });
});

describe('average', () => {
  it('is the mean over the days with data, rounded: the reference gives 22:24 and 97.8% for 02a2, and 97.4% for 02a0', () => {
    const ref02a2: Array<[string, number]> = [['23:48', 99.2], ['23:51', 99.4], ['23:16', 97.0], ['22:56', 95.5], ['23:23', 97.4], ['23:54', 99.6], ['23:55', 99.7], ['23:32', 98.0], ['23:55', 99.6], ['23:46', 99.0], ['21:41', 90.4]];
    const days = [
      day('2026-10-06', 0, 0), day('2026-10-07', 0, 0), day('2026-10-08', 0, 0),
      day('2026-10-09', 650 * 60 + 25, 3 * 60 - 25 + 0), // started that day: 10:50 online of 10:53 watched = 99.5
      ...ref02a2.map(([hm, pct], i) => full(`2026-10-${10 + i}`, secondsFor(hm, pct))),
    ];
    const row = buildRow(gw('506f9800000002a2', days), datesBetween('2026-10-06', '2026-10-20'), TODAY);
    expect(avgText(row, 'hours')).toBe('22:24');
    expect(avgText(row, 'percent')).toBe('97.8%');

    const ref02a0: Array<[string, number]> = [['23:29', 97.8], ['23:12', 96.6], ['23:33', 98.1], ['23:35', 98.3], ['23:19', 97.1], ['23:31', 97.9], ['23:18', 97.1], ['22:54', 95.4], ['23:16', 97.0], ['23:28', 97.8], ['23:13', 96.7], ['23:10', 96.5], ['23:44', 98.9], ['23:29', 97.8], ['23:29', 97.9]];
    const row2 = buildRow(gw('506f9800000002a0', ref02a0.map(([hm, pct], i) => full(`2026-10-${String(6 + i).padStart(2, '0')}`, secondsFor(hm, pct)))), datesBetween('2026-10-06', '2026-10-20'), TODAY);
    expect(avgText(row2, 'hours')).toBe('23:23');
    expect(avgText(row2, 'percent')).toBe('97.4%');
  });

  it('is time-weighted: a short partial day weighs little (a plain mean of the daily figures would give 97.9 here)', () => {
    // the 02a2 case: a partial first day of 10:53 watched, then eleven full days
    const full11 = Array.from({ length: 11 }, (_, i) => full(`2026-10-${10 + i}`, h(23, 30) + 5));
    const row = buildRow(gw('x', [day('2026-10-09', h(10, 50) + 10, h(0, 3) - 10), ...full11]), datesBetween('2026-10-09', '2026-10-20'), TODAY);
    const dailyMean = row.cells.reduce((n, c) => n + (c.percent ?? 0), 0) / row.cells.length;
    expect(Math.round(dailyMean * 10) / 10).toBeGreaterThan(Number(avgText(row, 'percent').replace('%', '')) - 0.0001); // never above a plain mean here
    // the weighted figure is online time over watched time
    const online = (h(10, 50) + 10) + 11 * (h(23, 30) + 5);
    const watched = (h(10, 50) + 10 + h(0, 3) - 10) + 11 * 86_400;
    expect(avgText(row, 'percent')).toBe(`${(Math.floor((online / watched) * 1000) / 10).toFixed(1)}%`);
  });

  it('is empty for a gateway with no data at all', () => {
    const row = buildRow(gw('x', []), ['2026-10-06', '2026-10-07'], TODAY);
    expect(row.avgMinutes).toBeNull();
    expect(avgText(row, 'hours')).toBe('–');
    expect(row.cells.every((c) => c.kind === 'nodata')).toBe(true);
  });
});

describe('colours', () => {
  it('bands: 95-100, 90-95, 75-90, 50-75, below 50, judged as shown', () => {
    expect(['b95', 'b95', 'b90', 'b90', 'b75', 'b75', 'b50', 'b50', 'b0']).toEqual([100, 95, 94.9, 90, 89.9, 75, 74.9, 50, 49.9].map((p) => bucketOf(p)));
    expect(bucketOf(94.96)).toBe('b95'); // shows as 95.0
    expect(bucketOf(null)).toBe('none');
  });
});

describe('filter and sort', () => {
  const dates = ['2026-10-06'];
  const rows = [
    buildRow(gw('506f9800000002a6', [full('2026-10-06', h(23, 30))], { address: 'Nayapali' }), dates, TODAY),
    buildRow(gw('506f9800000002a7', [full('2026-10-06', h(12))], { address: 'Sadar', status: 'offline' }), dates, TODAY),
    buildRow(gw('506f9800000002a1', [], { address: null, status: 'no-data' }), dates, TODAY),
  ];
  it('sorts best average first by default, gateways without data last', () => {
    expect(sortRows(rows, 'average', 'desc').map((r) => r.gatewayId)).toEqual(['506f9800000002a6', '506f9800000002a7', '506f9800000002a1']);
    expect(sortRows(rows, 'average', 'asc').map((r) => r.gatewayId)).toEqual(['506f9800000002a7', '506f9800000002a6', '506f9800000002a1']);
  });
  it('sorts by id and by address, without an address last', () => {
    expect(sortRows(rows, 'gatewayId', 'asc')[0].gatewayId).toBe('506f9800000002a1');
    expect(sortRows(rows, 'address', 'asc').map((r) => r.address)).toEqual(['Nayapali', 'Sadar', null]);
  });
  it('filters by status, by id or address text, and by "average below"', () => {
    const none = { state: 'all' as const, search: '', belowPercent: null };
    expect(filterRows(rows, { ...none, state: 'offline' }).map((r) => r.gatewayId)).toEqual(['506f9800000002a7']);
    expect(filterRows(rows, { ...none, search: '  NAYA ' }).map((r) => r.gatewayId)).toEqual(['506f9800000002a6']);
    expect(filterRows(rows, { ...none, search: '2a7' }).map((r) => r.gatewayId)).toEqual(['506f9800000002a7']);
    expect(filterRows(rows, { ...none, belowPercent: 90 }).map((r) => r.gatewayId)).toEqual(['506f9800000002a7']);
    // no data is not "below 90": it has no average
    expect(filterRows(rows, { ...none, belowPercent: 100 }).map((r) => r.gatewayId)).not.toContain('506f9800000002a1');
  });
});

describe('day ranges', () => {
  it('the presets are the last 7 / 15 / 30 whole days, ending yesterday (6 to 20 Oct is 15 days when today is the 21st)', () => {
    expect(uptimePresetRange('15D', TODAY)).toMatchObject({ startDate: '2026-10-06', endDate: '2026-10-20' });
    expect(uptimePresetRange('7D', TODAY)).toMatchObject({ startDate: '2026-10-14', endDate: '2026-10-20' });
    // 30 days would reach before the data begins (1 Oct): it starts there
    expect(uptimePresetRange('30D', TODAY)).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-20' });
    expect(uptimePresetOf(uptimePresetRange('7D', TODAY), TODAY)).toBe('7D');
    expect(uptimePresetOf({ startDate: '2026-10-03', endDate: '2026-10-09', timeZone: 'Asia/Kolkata' }, TODAY)).toBeNull();
  });
  it('is kept in the address and read back; anything unusable falls back to 15 days', () => {
    const r = uptimePresetRange('7D', TODAY);
    expect(uptimeRangeToParams(r, TODAY)).toEqual({ range: '7D' });
    expect(uptimeRangeToParams(uptimePresetRange('15D', TODAY), TODAY)).toEqual({});
    expect(uptimeRangeFromParams(new URLSearchParams('range=7d'), TODAY)).toEqual(r);
    expect(uptimeRangeFromParams(new URLSearchParams('start=2026-10-03&end=2026-10-09'), TODAY)).toMatchObject({ startDate: '2026-10-03', endDate: '2026-10-09' });
    for (const bad of ['start=2026-10-09&end=2026-10-03', 'start=2026-02-31&end=2026-10-03', 'start=2026-10-01&end=2026-12-01', 'start=2026-09-01&end=2026-09-05', 'range=99D', 'start=x&end=y']) {
      expect(uptimeRangeFromParams(new URLSearchParams(bad), TODAY)).toEqual(uptimePresetRange('15D', TODAY));
    }
  });
  it('lists every day of a range', () => {
    expect(datesBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(datesBetween('2026-10-05', '2026-10-05')).toEqual(['2026-10-05']);
  });
});

describe('files', () => {
  const report = { gateways: [gw('506f9800000002a6', [full('2026-10-06', h(23, 18) + 20), day('2026-10-07', h(10, 50), 180)], { address: 'Nayapali, "Unit 1"' })] } as unknown as ConnectivityReport;
  const dates = ['2026-10-06', '2026-10-07', '2026-10-08'];
  const rows = buildUptime(report, dates, TODAY);
  const meta = { range: { startDate: '2026-10-06', endDate: '2026-10-08', timeZone: 'Asia/Kolkata' }, dates, generatedAt: '21 Oct 2026, 11:00:00' };

  it('the CSV has the shown unit, the dash and the star, and quotes what needs it', () => {
    const csv = uptimeCsv(rows, 'hours', meta).replace('﻿', '').split('\r\n');
    expect(csv[0]).toBe('Gateway ID,Address,6 Oct,7 Oct,8 Oct,Avg per day');
    expect(csv[1]).toBe('506f9800000002a6,"Nayapali, ""Unit 1""",23:18,10:50*,–,17:04');
    expect(uptimeCsv(rows, 'percent', meta)).toContain('97.1,99.5*,–,97.8');
    expect(uptimeCsv(rows, 'hours', meta).startsWith('﻿')).toBe(true);
  });

  it('the workbook builds (hours and percent sheets)', () => {
    const bytes = uptimeWorkbook(rows, meta);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(bytes)).toContain('Uptime (hours)');
  });

  it('names the files', () => {
    expect(exportBaseName('hours', meta.range)).toBe('Gateway_Uptime_hours_06Oct-08Oct2026');
    expect(exportBaseName('both', meta.range)).toBe('Gateway_Uptime_both_06Oct-08Oct2026');
  });
});
