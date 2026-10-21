import type { ConnectivityReport, GatewayConnectivity, GatewayRange, GatewayState } from '@/services/api/gatewayStatusApi';
import { DATA_AVAILABLE_FROM, GATEWAY_TIME_ZONE, MAX_RANGE_DAYS, addDays, daysBetween } from './gatewayStatusModel';

/**
 * The Gateway Uptime chart: for every gateway and every day, how long it was online (hours:minutes, or % of the day).
 *
 * The figures are the per-day online / offline seconds the gateway health service reports (the same numbers as the
 * Gateway Status table); this module only lays them out. A day's figure follows the reference charts:
 *  - a normal day shows whole minutes online (rounded down) out of 24:00, and its percentage is the exact online time
 *    over 24 hours, rounded DOWN to one decimal: an availability figure never rounds up to the next tenth (22:04:40 is
 *    91.9%, not 92.0%). This is exactly how the reference charts were made (checked on 42 cells);
 *  - a day with nothing recorded is "no data" ("–");
 *  - a day the gateway was only watched for part of (it started that day, or the day is still going) is "partial"
 *    ("*"): the hours are what was online, and the percentage is of the time it was watched;
 *  - the average over the days that have data is, in hours, the mean of the days' minutes (to the nearest minute), and,
 *    in percent, the time-weighted figure: all the online time over all the time watched (24 hours for a normal day, the
 *    watched time for a partial one), rounded down to a tenth like a day's. (Checked against the reference: 98.9, 97.4, 97.8.)
 */

export type Unit = 'hours' | 'percent';

/** A day counts as watched all day when at least this much of it was observed (the service leaves about a minute out). */
const FULL_DAY_SECONDS = 24 * 3600 - 10 * 60;
const DAY_SECONDS = 24 * 3600;

/** Rounds down to one decimal (the tiny addition keeps 99.7 from becoming 99.6 through floating-point noise). */
const truncTenth = (x: number): number => Math.floor(x * 10 + 1e-9) / 10;

export type CellKind = 'nodata' | 'full' | 'partial';

export interface UptimeCell {
  date: string;
  kind: CellKind;
  /** Whole minutes online that day, rounded down (0 for no data). */
  minutes: number;
  /** Percentage of the day (of the watched time on a partial day), rounded down to one decimal; null for no data. */
  percent: number | null;
  /** Exact online seconds, and the seconds the percentage is of (24 hours, or the watched time on a partial day). */
  onlineSeconds: number;
  basisSeconds: number;
}

export interface UptimeRow {
  gatewayId: string;
  address: string | null;
  status: GatewayState;
  cells: UptimeCell[];
  /** Mean minutes online over the days that have data; null when no day has data. */
  avgMinutes: number | null;
  avgPercent: number | null;
}

/** Every calendar day from start to end, inclusive ("2026-10-06" ...). */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start, n = 0; d <= end && n < 400; d = addDays(d, 1), n++) out.push(d);
  return out;
}

export function buildCell(day: { onlineSeconds: number; offlineSeconds: number } | undefined, date: string, today: string): UptimeCell {
  const observed = day ? day.onlineSeconds + day.offlineSeconds : 0;
  if (!day || observed <= 0) return { date, kind: 'nodata', minutes: 0, percent: null, onlineSeconds: 0, basisSeconds: 0 };
  const online = Math.max(0, day.onlineSeconds);
  const minutes = Math.floor(online / 60);
  const partial = date >= today || observed < FULL_DAY_SECONDS;
  if (!partial) return { date, kind: 'full', minutes, percent: truncTenth((online / DAY_SECONDS) * 100), onlineSeconds: online, basisSeconds: DAY_SECONDS };
  return { date, kind: 'partial', minutes, percent: Math.min(100, truncTenth((online / observed) * 100)), onlineSeconds: online, basisSeconds: observed };
}

export function buildRow(g: GatewayConnectivity, dates: string[], today: string): UptimeRow {
  const byDate = new Map(g.days.map((d) => [d.date, d]));
  const cells = dates.map((date) => buildCell(byDate.get(date), date, today));
  const withData = cells.filter((c) => c.kind !== 'nodata');
  const avgMinutes = withData.length ? withData.reduce((n, c) => n + c.minutes, 0) / withData.length : null;
  const basis = withData.reduce((n, c) => n + c.basisSeconds, 0);
  const avgPercent = withData.length && basis > 0 ? Math.min(100, truncTenth((withData.reduce((n, c) => n + c.onlineSeconds, 0) / basis) * 100)) : null;
  return { gatewayId: g.gatewayId, address: g.address, status: g.status, cells, avgMinutes, avgPercent };
}

export function buildUptime(report: ConnectivityReport, dates: string[], today: string): UptimeRow[] {
  return report.gateways.map((g) => buildRow(g, dates, today));
}

// --- Colour scale -------------------------------------------------------------------------------------------------

export type Bucket = 'b95' | 'b90' | 'b75' | 'b50' | 'b0' | 'none';

export const BUCKETS: Array<{ key: Exclude<Bucket, 'none'>; label: string; min: number; color: string }> = [
  { key: 'b95', label: '95–100%', min: 95, color: '#BBF7D0' },
  { key: 'b90', label: '90–95%', min: 90, color: '#DCFCE7' },
  { key: 'b75', label: '75–90%', min: 75, color: '#FEF9C3' },
  { key: 'b50', label: '50–75%', min: 50, color: '#FED7AA' },
  { key: 'b0', label: 'below 50%', min: -Infinity, color: '#FECACA' },
];
export const NO_DATA_COLOR = '#F8FAFC';

export function bucketOf(percent: number | null): Bucket {
  if (percent == null) return 'none';
  // the figure is judged as shown (one decimal), so 94.96 reads as 95.0 and is in the top band
  const p = Math.round(percent * 10) / 10;
  return BUCKETS.find((b) => p >= b.min)!.key;
}

export const colorOf = (bucket: Bucket): string => (bucket === 'none' ? NO_DATA_COLOR : BUCKETS.find((b) => b.key === bucket)!.color);

// --- Formatting ---------------------------------------------------------------------------------------------------

/** "23:18", "5:22", "0:00": whole minutes as hours:minutes. */
export function fmtMinutes(minutes: number): string {
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

export const fmtPct = (p: number): string => (Math.round(p * 10) / 10).toFixed(1);

/** What a cell shows: "23:18" or "97.1", "–" for no data, with a "*" on a partial day. */
export function cellText(c: UptimeCell, unit: Unit): string {
  if (c.kind === 'nodata') return '–';
  const body = unit === 'hours' ? fmtMinutes(c.minutes) : fmtPct(c.percent ?? 0);
  return c.kind === 'partial' ? `${body}*` : body;
}

export function avgText(r: UptimeRow, unit: Unit): string {
  if (r.avgMinutes == null || r.avgPercent == null) return '–';
  return unit === 'hours' ? fmtMinutes(r.avgMinutes) : `${fmtPct(r.avgPercent)}%`;
}

/** "6 Oct": the column heading of a day. */
export function dayHeading(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(Date.parse(`${date}T00:00:00Z`));
}

// --- Filtering and sorting ----------------------------------------------------------------------------------------

export type UptimeSort = 'average' | 'gatewayId' | 'address';
export type UptimeSortDir = 'asc' | 'desc';

/** Show only gateways whose average is below this many percent (null: all of them). */
export const THRESHOLD_CHOICES = [95, 90, 75, 50] as const;

export interface UptimeFilter {
  state: GatewayState | 'all';
  /** Matches the gateway ID or its address. */
  search: string;
  /** Only gateways whose average is below this (gateways without any data are kept out). */
  belowPercent: number | null;
}

export function filterRows(rows: UptimeRow[], f: UptimeFilter): UptimeRow[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.state !== 'all' && r.status !== f.state) return false;
    if (q && !r.gatewayId.toLowerCase().includes(q) && !(r.address ?? '').toLowerCase().includes(q)) return false;
    if (f.belowPercent != null && (r.avgPercent == null || Math.round(r.avgPercent * 10) / 10 >= f.belowPercent)) return false;
    return true;
  });
}

/** Sorts a copy. The default is the reference order: best average first. Rows with no data are always last. */
export function sortRows(rows: UptimeRow[], key: UptimeSort, dir: UptimeSortDir): UptimeRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  const value = (r: UptimeRow): string | number | null =>
    key === 'average' ? r.avgPercent : key === 'gatewayId' ? r.gatewayId : r.address?.trim().toLowerCase() || null;
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null && y === null) return a.gatewayId.localeCompare(b.gatewayId);
    if (x === null) return 1;
    if (y === null) return -1;
    const c = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : (x as number) - (y as number);
    return c !== 0 ? sign * c : a.gatewayId.localeCompare(b.gatewayId);
  });
}

// --- Day ranges ---------------------------------------------------------------------------------------------------

export type UptimePreset = '7D' | '15D' | '30D';
export const UPTIME_PRESETS: Array<{ key: UptimePreset; days: number }> = [
  { key: '7D', days: 7 },
  { key: '15D', days: 15 },
  { key: '30D', days: 30 },
];
export const DEFAULT_UPTIME_PRESET: UptimePreset = '15D';

const yesterdayOf = (today: string) => addDays(today, -1);

/** The last N whole days, ending yesterday (today is not over yet); never reaching back before the data begins. */
export function uptimePresetRange(preset: UptimePreset, today: string, timeZone = GATEWAY_TIME_ZONE): GatewayRange {
  const days = UPTIME_PRESETS.find((p) => p.key === preset)!.days;
  const end = yesterdayOf(today);
  const start = addDays(end, 1 - days);
  return { startDate: start < DATA_AVAILABLE_FROM ? DATA_AVAILABLE_FROM : start, endDate: end, timeZone };
}

export function uptimePresetOf(range: GatewayRange, today: string): UptimePreset | null {
  return UPTIME_PRESETS.find((p) => {
    const r = uptimePresetRange(p.key, today, range.timeZone);
    return r.startDate === range.startDate && r.endDate === range.endDate;
  })?.key ?? null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const realDate = (s: string | null): s is string => !!s && DATE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** The range kept in the address (?range=7D, or ?start=...&end=...); anything unusable falls back to the default preset. */
export function uptimeRangeFromParams(params: URLSearchParams, today: string): GatewayRange {
  const start = params.get('start');
  const end = params.get('end');
  if (realDate(start) && realDate(end) && start <= end && end <= today && end >= DATA_AVAILABLE_FROM && daysBetween(start, end) <= MAX_RANGE_DAYS) {
    return { startDate: start < DATA_AVAILABLE_FROM ? DATA_AVAILABLE_FROM : start, endDate: end, timeZone: GATEWAY_TIME_ZONE };
  }
  const preset = (params.get('range') ?? '').toUpperCase() as UptimePreset;
  return uptimePresetRange(UPTIME_PRESETS.some((p) => p.key === preset) ? preset : DEFAULT_UPTIME_PRESET, today);
}

export function uptimeRangeToParams(range: GatewayRange, today: string): Record<string, string> {
  const preset = uptimePresetOf(range, today);
  return preset ? (preset === DEFAULT_UPTIME_PRESET ? {} : { range: preset }) : { start: range.startDate, end: range.endDate };
}
