// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { ConnectivityReport, GatewayConnectivity } from '@/services/api/gatewayStatusApi';
import { BUCKETS, NO_DATA_COLOR, avgText, bucketOf, buildUptime, cellText, colorOf, datesBetween, dayHeading, filterRows, sortRows } from '../uptimeModel';
import { chartNotes, excelDate, minutesToDays, uptimeCsv, uptimeWorkbook } from '../uptimeExport';
import { readWorkbook, showNumber } from './xlsxReader';

const TODAY = '2026-10-21';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const day = (date: string, on: number, off: number) => ({ date, onlineSeconds: on, offlineSeconds: off, outages: 0, heartbeatsReceived: 0, heartbeatsExpected: 0 });
const gw = (id: string, address: string | null, days: ReturnType<typeof day>[], status: GatewayConnectivity['status'] = 'online'): GatewayConnectivity => ({
  gatewayId: id, status, lastSeenAt: null, uptimePercent: null, onlineSeconds: null, observedSeconds: null, downtimeEvents: 0,
  heartbeatsReceived: null, heartbeatsExpected: null, latitude: null, longitude: null, address, days,
});

/** A report with every kind of day in it: all five colour bands, no data, part-watched days, a gateway with nothing at all. */
function randomReport(seed: number, nGateways: number, dates: string[]): ConnectivityReport {
  const r = rng(seed);
  const gateways = Array.from({ length: nGateways }, (_, g) => {
    const days = dates.flatMap((d) => {
      const kind = r();
      if (kind < 0.12) return []; // nothing recorded
      if (kind < 0.18) return [day(d, 0, 0)]; // recorded as zero
      if (kind < 0.28) {
        // watched part of the day only
        const watched = Math.floor(600 + r() * 60_000);
        return [day(d, Math.floor(watched * r()), 0).onlineSeconds === 0 ? day(d, 0, watched) : day(d, Math.floor(watched * (0.3 + 0.7 * r())), 0)].map((x) => ({ ...x, offlineSeconds: watched - x.onlineSeconds }));
      }
      // a whole day, with any share online: bands from 0% to 100%
      const share = r() < 0.15 ? r() * 0.5 : r() < 0.5 ? 0.95 + r() * 0.05 : 0.5 + r() * 0.5;
      const online = Math.floor(86_340 * share);
      return [day(d, online, 86_340 - online)];
    });
    return gw(`506f98000000${String(g).padStart(4, '0')}`, g % 5 === 0 ? null : `Place ${g}, "Quote" & <tag>`, days, (['online', 'offline', 'no-data'] as const)[g % 3]);
  });
  gateways.push(gw('506f9800000009ff', 'Nothing at all', [], 'no-data'));
  return { gateways } as unknown as ConnectivityReport;
}

const metaFor = (dates: string[]) => ({ range: { startDate: dates[0], endDate: dates[dates.length - 1], timeZone: 'Asia/Kolkata' }, dates, generatedAt: '21 Oct 2026, 11:00:00' });

describe('the Excel file is the UI, cell for cell', () => {
  it('every cell shows what the page shows and has the page\'s colour (both units, random data, many seeds)', () => {
    let compared = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const dates = datesBetween('2026-10-06', seed % 2 ? '2026-10-20' : '2026-10-12');
      const rows = sortRows(buildUptime(randomReport(seed, 12, dates), dates, TODAY), 'average', 'desc');
      const [hours, percent] = readWorkbook(uptimeWorkbook(rows, metaFor(dates)));
      expect(hours.name).toBe('Uptime (hours)');
      expect(percent.name).toBe('Uptime (%)');
      for (const [sheet, unit] of [[hours, 'hours'], [percent, 'percent']] as const) {
        rows.forEach((r, i) => {
          const row = 4 + i; // title, subtitle, header, then the gateways in the page's order
          expect(sheet.cells.get(`A${row}`)?.value).toBe(r.gatewayId);
          expect(sheet.cells.get(`B${row}`)?.value ?? '').toBe(r.address ?? '');
          r.cells.forEach((c, k) => {
            const cell = sheet.cells.get(`${String.fromCharCode(67 + k)}${row}`)!;
            const where = `seed ${seed} ${unit} ${r.gatewayId} ${c.date}`;
            expect(cell.shown, where).toBe(cellText(c, unit));
            const want = c.kind === 'nodata' ? NO_DATA_COLOR : colorOf(bucketOf(c.percent));
            expect(cell.fill, where).toBe(want.slice(1).toUpperCase());
            compared++;
          });
          const avg = sheet.cells.get(`${String.fromCharCode(67 + dates.length)}${row}`)!;
          expect(avg.shown, `seed ${seed} ${unit} avg ${r.gatewayId}`).toBe(avgText(r, unit));
        });
      }
    }
    expect(compared).toBeGreaterThan(3000);
  });

  it('shows the same colours as the page legend, and never invents another', () => {
    const dates = datesBetween('2026-10-06', '2026-10-20');
    const rows = buildUptime(randomReport(7, 40, dates), dates, TODAY);
    const [hours] = readWorkbook(uptimeWorkbook(rows, metaFor(dates)));
    const allowed = new Set([...BUCKETS.map((b) => b.color), NO_DATA_COLOR, '#0F1F3D'].map((c) => c.slice(1).toUpperCase()));
    const used = new Set([...hours.cells.values()].map((c) => c.fill).filter(Boolean) as string[]);
    for (const f of used) expect(allowed.has(f), f).toBe(true);
    // every band the data has is present, so no band was dropped or merged into another
    const bandsInData = new Set(rows.flatMap((r) => r.cells.map((c) => (c.kind === 'nodata' ? NO_DATA_COLOR : colorOf(bucketOf(c.percent))).slice(1).toUpperCase())));
    for (const f of bandsInData) expect(used.has(f), f).toBe(true);
    expect(bandsInData.size).toBeGreaterThanOrEqual(5);
    // the legend row of the sheet carries the five colours with their names
    const legend = [...hours.cells.values()].filter((c) => BUCKETS.some((b) => b.label === c.value));
    expect(legend.map((c) => [c.value, c.fill])).toEqual(BUCKETS.map((b) => [b.label, b.color.slice(1).toUpperCase()]));
  });

  it('has the header row, day headings, filters, frozen panes and the notes', () => {
    const dates = datesBetween('2026-10-06', '2026-10-10');
    const rows = buildUptime(randomReport(3, 6, dates), dates, TODAY);
    const [hours, percent, data] = readWorkbook(uptimeWorkbook(rows, metaFor(dates)));
    expect([...Array(2 + dates.length + 1).keys()].map((i) => hours.cells.get(`${String.fromCharCode(65 + i)}3`)?.value)).toEqual([
      'Gateway ID', 'Address', ...dates.map(dayHeading), 'Avg per day',
    ]);
    expect(percent.cells.get(`${String.fromCharCode(65 + 2 + dates.length)}3`)?.value).toBe('Average');
    expect(hours.cells.get('A1')?.value).toMatch(/^Gateway Uptime \(hours\) - 06 Oct 2026 to 10 Oct 2026$/);
    expect(hours.autoFilter).toBe(`A3:H${3 + rows.length}`);
    expect(hours.frozen).toEqual({ x: 2, y: 3 });
    const text = [...hours.cells.values()].map((c) => String(c.value));
    for (const note of chartNotes('hours')) expect(text).toContain(note);
    expect(data.name).toBe('Data');
  });

  it('shows the right minute in a viewer that CUTS the seconds off (every minute of the day)', () => {
    for (let m = 0; m <= 2880; m++) {
      const shown = showNumber(minutesToDays(m), '[h]:mm');
      expect(shown).toBe(`${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);
    }
    // and it still shows the right minute in a viewer that ROUNDS to the nearest minute
    for (let m = 0; m <= 2880; m++) expect(Math.round(minutesToDays(m) * 1440)).toBe(m);
  });
});

describe('the Data sheet holds the same figures as plain numbers', () => {
  it('one row per gateway and day, real dates, minutes and percent as numbers, nothing for a day without data', () => {
    const dates = datesBetween('2026-10-06', '2026-10-12');
    const rows = buildUptime(randomReport(11, 8, dates), dates, TODAY);
    const data = readWorkbook(uptimeWorkbook(rows, metaFor(dates)))[2];
    let line = 2;
    for (const r of rows) {
      for (const c of r.cells) {
        const cell = (col: string) => data.cells.get(`${col}${line}`);
        expect(cell('A')?.value).toBe(r.gatewayId);
        expect(cell('C')?.value).toBe(excelDate(c.date));
        expect(cell('C')?.shown).toMatch(/^\d{2} Oct 2026$/);
        expect(cell('D')?.value).toBe(c.kind === 'nodata' ? 'No data' : c.kind === 'partial' ? 'Part of the day' : 'Full day');
        if (c.kind === 'nodata') {
          expect(cell('E')).toBeUndefined();
          expect(cell('F')).toBeUndefined();
          expect(cell('G')).toBeUndefined();
        } else {
          expect(cell('E')?.shown).toBe(cellText(c, 'hours').replace('*', ''));
          expect(cell('F')?.value).toBe(c.minutes);
          expect(cell('G')?.value).toBe(Math.round((c.percent ?? 0) * 10) / 10);
          expect(typeof cell('F')?.value).toBe('number');
        }
        line++;
      }
    }
    expect(data.autoFilter).toBe(`A1:G${line - 1}`);
  });

  it('turns dates into the numbers a spreadsheet uses (1 Jan 2026 is 46023)', () => {
    expect(excelDate('2026-01-01')).toBe(46023);
    expect(excelDate('2026-10-21') - excelDate('2026-10-20')).toBe(1);
  });
});

describe('the file follows what the page shows after filtering and sorting', () => {
  it('lists only the gateways left by the filters, in the order of the page', () => {
    const dates = datesBetween('2026-10-06', '2026-10-12');
    const all = buildUptime(randomReport(5, 15, dates), dates, TODAY);
    const shown = sortRows(filterRows(all, { state: 'online', search: 'place', belowPercent: null }), 'gatewayId', 'desc');
    const [hours] = readWorkbook(uptimeWorkbook(shown, { ...metaFor(dates), filtered: { shown: shown.length, total: all.length } }));
    const ids = [...hours.rows.keys()].filter((n) => n >= 4 && hours.cells.has(`A${n}`) && /^506f/.test(String(hours.cells.get(`A${n}`)?.value))).map((n) => hours.cells.get(`A${n}`)?.value);
    expect(ids).toEqual(shown.map((r) => r.gatewayId));
    expect(String(hours.cells.get('A2')?.value)).toContain(`Showing ${shown.length} of ${all.length} gateways (filtered)`);
  });
});

describe('CSV', () => {
  it('has the same text as the page, with the dash and star, and survives quotes, commas and line breaks', () => {
    const dates = datesBetween('2026-10-06', '2026-10-09');
    const rows = buildUptime(randomReport(2, 4, dates), dates, TODAY);
    rows[0] = { ...rows[0], address: 'Line one\nline "two", three' };
    for (const unit of ['hours', 'percent'] as const) {
      const csv = uptimeCsv(rows, unit, metaFor(dates)).replace('﻿', '');
      // read it back with a small CSV reader
      const table: string[][] = [];
      let cur = ''; let line: string[] = []; let q = false;
      for (let i = 0; i < csv.length; i++) {
        const ch = csv[i];
        if (q) { if (ch === '"') { if (csv[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
        else if (ch === '"') q = true;
        else if (ch === ',') { line.push(cur); cur = ''; }
        else if (ch === '\r') continue;
        else if (ch === '\n') { line.push(cur); table.push(line); line = []; cur = ''; }
        else cur += ch;
      }
      expect(table[0]).toEqual(['Gateway ID', 'Address', ...dates.map(dayHeading), unit === 'hours' ? 'Avg per day' : 'Average %']);
      expect(table).toHaveLength(rows.length + 1);
      rows.forEach((r, i) => {
        expect(table[i + 1].slice(0, 2)).toEqual([r.gatewayId, r.address ?? '']);
        expect(table[i + 1].slice(2, 2 + dates.length)).toEqual(r.cells.map((c) => cellText(c, unit)));
        expect(table[i + 1][2 + dates.length]).toBe(avgText(r, unit).replace('%', ''));
      });
    }
  });
});
