import type { GatewayRange } from '@/services/api/gatewayStatusApi';
import { fmtDay } from './gatewayStatusModel';
import {
  BUCKETS,
  NO_DATA_COLOR,
  avgText,
  bucketOf,
  cellText,
  colorOf,
  dayHeading,
  fmtMinutes,
  type Unit,
  type UptimeRow,
} from './uptimeModel';
import { buildXlsx, type XlsxCell, type XlsxSheet, type XlsxStyle } from './xlsx';

/** What the downloaded files say about themselves. */
export interface ExportMeta {
  range: GatewayRange;
  dates: string[];
  /** When the data was loaded (already formatted for people). */
  generatedAt: string;
  /** How many gateways are in the file and how many the page has in all (the page may be filtered). */
  filtered?: { shown: number; total: number };
}

const NAVY = '#0F1F3D';

const header: XlsxStyle = { bold: true, fill: { color: NAVY }, textColor: '#FFFFFF', border: true };
const noDataStyle: XlsxStyle = { fill: { color: NO_DATA_COLOR }, align: 'center', textColor: '#94A3B8', border: true };

const unitTitle = (unit: Unit) => (unit === 'hours' ? 'Gateway Uptime (hours)' : 'Gateway Uptime (%)');
const rangeText = (r: GatewayRange) => `${fmtDay(r.startDate)} to ${fmtDay(r.endDate)}`;

/** The note under every chart, the same in the page and in the files. */
export function chartNotes(unit: Unit): string[] {
  return [
    unit === 'hours'
      ? 'Each cell = hours:minutes the gateway was online that day, out of 24:00 (IST). Colours = share of the day online.'
      : 'Each cell = % of the 24-hour day the gateway was online (IST, 00:00 to 24:00).',
    '"–" = no data recorded for that day.  * = the gateway was watched for only part of that day (it started that day, or the day is not over): the hours are what was online, and the percentage is of the time it was watched.',
    'Scheduled reboots (00:00, 06:00, 12:00, 18:00 IST) count as downtime. The average is over the days that have data.',
  ];
}

function sheetFor(rows: UptimeRow[], unit: Unit, meta: ExportMeta): XlsxSheet {
  const cols = 2 + meta.dates.length + 1;
  const pad = (cells: XlsxCell[]): XlsxCell[] => [...cells, ...Array.from({ length: Math.max(0, cols - cells.length) }, () => ({ v: null }))];
  const out: XlsxCell[][] = [];
  out.push(pad([{ v: `${unitTitle(unit)} - ${rangeText(meta.range)}`, style: { bold: true, size: 14 } }]));
  const sub = `Data loaded ${meta.generatedAt}.${meta.filtered && meta.filtered.shown < meta.filtered.total ? ` Showing ${meta.filtered.shown} of ${meta.filtered.total} gateways (filtered).` : ''}`;
  out.push(pad([{ v: sub, style: { textColor: '#64748B' } }]));
  out.push(
    pad([
      { v: 'Gateway ID', style: header },
      { v: 'Address', style: header },
      ...meta.dates.map((d) => ({ v: dayHeading(d), style: { ...header, align: 'center' as const } })),
      { v: unit === 'hours' ? 'Avg per day' : 'Average', style: { ...header, align: 'center' as const } },
    ])
  );
  for (const r of rows) {
    out.push([
      { v: r.gatewayId, style: { border: true } },
      { v: r.address ?? '', style: { border: true } },
      ...r.cells.map((c): XlsxCell => {
        if (c.kind === 'nodata') return { v: '–', style: noDataStyle };
        // The cell holds exactly the text the page shows ("23:18", "97.1", "10:50*"), as text: no number format that a
        // viewer could misread (some show a time format as a duration with seconds). The figures as numbers are on the Data sheet.
        return { v: cellText(c, unit), style: { fill: { color: colorOf(bucketOf(c.percent)) }, align: 'center', border: true } };
      }),
      r.avgMinutes == null || r.avgPercent == null
        ? { v: '–', style: noDataStyle }
        : { v: avgText(r, unit), style: { bold: true, align: 'center', border: true } },
    ]);
  }
  out.push(pad([]));
  out.push(pad([{ v: 'Colours', style: { bold: true } }, ...BUCKETS.map((b) => ({ v: b.label, style: { fill: { color: b.color }, align: 'center' as const, border: true } }))]));
  for (const note of chartNotes(unit)) out.push(pad([{ v: note, style: { textColor: '#64748B' } }]));
  return {
    name: unit === 'hours' ? 'Uptime (hours)' : 'Uptime (%)',
    rows: out,
    widths: [20, 26, ...meta.dates.map(() => 9.5), 13],
    freeze: { rows: 3, cols: 2 },
    // filter buttons on the header row, over the gateways only (not the legend and notes below)
    autoFilter: { headerRow: 3, toRow: 3 + rows.length },
    rowHeights: { 1: 24, 3: 24 },
    landscape: true,
    textIsText: true,
  };
}

/**
 * The same figures as plain numbers, one row per gateway and day, for sorting, pivots and formulas. Only the most basic
 * number formats are used (whole numbers, one decimal) so that every viewer shows them as they are; the date is the
 * ISO text "2026-10-06" (it sorts and filters correctly, and every tool reads it).
 */
function dataSheet(rows: UptimeRow[]): XlsxSheet {
  const head = (v: string): XlsxCell => ({ v, style: header });
  const out: XlsxCell[][] = [[head('Gateway ID'), head('Address'), head('Date'), head('Day'), head('Online (h:mm)'), head('Online (minutes)'), head('Uptime (%)')]];
  for (const r of rows) {
    for (const c of r.cells) {
      const none = c.kind === 'nodata';
      out.push([
        { v: r.gatewayId },
        { v: r.address ?? '' },
        { v: c.date, style: { align: 'left' } },
        { v: none ? 'No data' : c.kind === 'partial' ? 'Part of the day' : 'Full day' },
        none ? { v: null } : { v: fmtMinutes(c.minutes), style: { align: 'center' } },
        none ? { v: null } : { v: c.minutes, style: { numFmt: '0', align: 'center' } },
        none ? { v: null } : { v: Math.round((c.percent ?? 0) * 10) / 10, style: { numFmt: '0.0', align: 'center' } },
      ]);
    }
  }
  return {
    name: 'Data',
    rows: out,
    widths: [20, 26, 13, 16, 14, 17, 12],
    freeze: { rows: 1, cols: 0 },
    autoFilter: { headerRow: 1, toRow: out.length },
    rowHeights: { 1: 24 },
    textIsText: true,
  };
}

/** The workbook: one sheet in hours and one in percent, both in the order the page shows, and the figures as plain data. */
export function uptimeWorkbook(rows: UptimeRow[], meta: ExportMeta): Uint8Array {
  return buildXlsx([sheetFor(rows, 'hours', meta), sheetFor(rows, 'percent', meta), dataSheet(rows)], {
    title: `Gateway Uptime - ${rangeText(meta.range)}`,
  });
}

const csvCell = (v: string): string => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** A CSV of the table in the unit being looked at, with a byte-order mark so Excel reads the accents and dashes. */
export function uptimeCsv(rows: UptimeRow[], unit: Unit, meta: ExportMeta): string {
  const lines: string[][] = [
    ['Gateway ID', 'Address', ...meta.dates.map(dayHeading), unit === 'hours' ? 'Avg per day' : 'Average %'],
    ...rows.map((r) => [r.gatewayId, r.address ?? '', ...r.cells.map((c) => cellText(c, unit)), avgText(r, unit).replace('%', '')]),
  ];
  return '﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** "Gateway_Uptime_hours_06Oct-20Oct2026" */
export function exportBaseName(unit: Unit | 'both', range: GatewayRange): string {
  const short = (d: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' }).format(Date.parse(`${d}T00:00:00Z`)).replace(' ', '');
  const year = range.endDate.slice(0, 4);
  return `Gateway_Uptime_${unit}_${short(range.startDate)}-${short(range.endDate)}${year}`;
}
