import { config } from '../../config/env.js';

export interface TelemetryWindow {
  /** Stable cache key, e.g. h6 / d7 / c_2026-09-01_2026-09-05 (never contains "now"). */
  key: string;
  fromTs: string;
  toTs: string;
  /** Partition-pruning date_key bounds (inclusive). */
  fromDate: string;
  toDate: string;
  /** Number of calendar dates the window touches. */
  days: number;
  /** True for hour-based windows, where upstream day-level summaries cannot be used for counts. */
  subDay: boolean;
}

/** Inverse of TelemetryWindow.key, so background rebuilds re-resolve against the current clock. */
export function windowRequestFromKey(win: TelemetryWindow): { hours?: number; days?: number; from?: string; to?: string } {
  if (win.key.startsWith('h')) return { hours: Number(win.key.slice(1)) };
  if (win.key.startsWith('d')) return { days: Number(win.key.slice(1)) };
  const [, from, to] = win.key.split('_');
  return { from, to };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 90;
// TEMPORARY (for checking against the upstream report): Command Center windows use UTC days. Revert this line to
// `config.TELEMETRY_TIMEZONE` to go back to IST days. Sync and stored date_keys are unaffected.
const TZ = () => 'UTC';

/**
 * date_key on stored packets is the day in the telemetry timezone (see localDate.ts), so every date bound
 * built for a query must be a local day too. Using the UTC date hides the first hours of each local day.
 */
export function dateKeyOf(ts: string | number | Date, tz: string = TZ()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ts));
}

/** Local clock minus UTC clock at an instant, in ms (e.g. +19,800,000 for IST). */
function tzOffsetMs(at: Date, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(at).map((x) => [x.type, x.value])
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The UTC instant at which a local calendar day (YYYY-MM-DD) begins. */
export function localDayStartIso(day: string, tz: string = TZ()): string {
  const guess = Date.parse(`${day}T00:00:00Z`);
  const first = guess - tzOffsetMs(new Date(guess), tz);
  return new Date(guess - tzOffsetMs(new Date(first), tz)).toISOString();
}

/** Shifts a calendar date string by whole days (calendar arithmetic, DST-safe). */
export function shiftDay(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86400000).toISOString().slice(0, 10);
}

/**
 * Resolves a requested window against the SERVER clock (so a browser tab left open across midnight
 * never queries a stale date). Accepts {hours}, {days} or a custom {from,to} (YYYY-MM-DD, days in the telemetry timezone).
 */
export function resolveWindow(
  q: { hours?: number; days?: number; from?: string; to?: string },
  now: Date = new Date()
): TelemetryWindow {
  const DAY = 86400000;
  if (q.from && q.to) {
    if (!DATE_RE.test(q.from) || !DATE_RE.test(q.to) || q.from > q.to) throw new Error('Invalid custom date range');
    const span = Math.round((Date.parse(q.to) - Date.parse(q.from)) / DAY) + 1;
    if (span > MAX_DAYS) throw new Error(`Custom range cannot exceed ${MAX_DAYS} days`);
    return {
      key: `c_${q.from}_${q.to}`,
      fromTs: localDayStartIso(q.from),
      toTs: new Date(Date.parse(localDayStartIso(shiftDay(q.to, 1))) - 1).toISOString(),
      fromDate: q.from,
      toDate: q.to,
      days: span,
      subDay: false,
    };
  }
  if (q.hours && q.hours > 0) {
    const hours = Math.min(Math.floor(q.hours), 168);
    const from = new Date(now.getTime() - hours * 3600000);
    const fromDate = dateKeyOf(from);
    const toDate = dateKeyOf(now);
    return {
      key: `h${hours}`,
      fromTs: from.toISOString(),
      toTs: now.toISOString(),
      fromDate,
      toDate,
      days: Math.round((Date.parse(toDate) - Date.parse(fromDate)) / DAY) + 1,
      subDay: true,
    };
  }
  const days = Math.min(Math.max(Math.floor(q.days || 7), 1), MAX_DAYS);
  const toDate = dateKeyOf(now);
  const fromDate = shiftDay(toDate, -(days - 1));
  return {
    key: `d${days}`,
    fromTs: localDayStartIso(fromDate),
    toTs: now.toISOString(),
    fromDate,
    toDate,
    days,
    subDay: false,
  };
}

/** The window's end, capped at now: ages are measured against it so past custom ranges don't read as "silent". */
export function referenceMs(win: TelemetryWindow): number {
  return Math.min(Date.now(), Date.parse(win.toTs));
}
