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
const dayStr = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Resolves a requested window against the SERVER clock (so a browser tab left open across midnight
 * never queries a stale date). Accepts {hours}, {days} or a custom {from,to} (YYYY-MM-DD, UTC).
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
      fromTs: `${q.from}T00:00:00.000Z`,
      toTs: `${q.to}T23:59:59.999Z`,
      fromDate: q.from,
      toDate: q.to,
      days: span,
      subDay: false,
    };
  }
  if (q.hours && q.hours > 0) {
    const hours = Math.min(Math.floor(q.hours), 168);
    const from = new Date(now.getTime() - hours * 3600000);
    const fromDate = dayStr(from);
    const toDate = dayStr(now);
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
  const fromDate = dayStr(new Date(now.getTime() - (days - 1) * DAY));
  return {
    key: `d${days}`,
    fromTs: `${fromDate}T00:00:00.000Z`,
    toTs: now.toISOString(),
    fromDate,
    toDate: dayStr(now),
    days,
    subDay: false,
  };
}

/** The window's end, capped at now: ages are measured against it so past custom ranges don't read as "silent". */
export function referenceMs(win: TelemetryWindow): number {
  return Math.min(Date.now(), Date.parse(win.toTs));
}
