import type { GatewayConnectivity, GatewayRange, GatewayState, GatewayTimeline, TimelineSegment } from '@/services/api/gatewayStatusApi';

/** The zone the page reads in: the deployments are in India, and the beta page uses it too. */
export const GATEWAY_TIME_ZONE = 'Asia/Kolkata';

export type RangePreset = '1D' | '3D' | '7D' | '14D';
export const RANGE_PRESETS: RangePreset[] = ['1D', '3D', '7D', '14D'];
const PRESET_DAYS: Record<RangePreset, number> = { '1D': 1, '3D': 3, '7D': 7, '14D': 14 };
/** The backend refuses anything longer. */
export const MAX_RANGE_DAYS = 92;
/** The first day there is any data for: earlier days cannot be picked (and the backend refuses them). */
export const DATA_AVAILABLE_FROM = '2026-10-01';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

// --- Date ranges -------------------------------------------------------------------------------------------------

/** "2026-10-15": the calendar day it is in the zone right now. */
export function todayIn(timeZone: string, now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(startDate: string, endDate: string): number {
  return Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS) + 1;
}

/** 1D is today so far; 3D / 7D / 14D end today as well, and never reach back before the data begins. */
export function presetRange(preset: RangePreset, now = Date.now(), timeZone = GATEWAY_TIME_ZONE): GatewayRange {
  const endDate = todayIn(timeZone, now);
  const startDate = addDays(endDate, 1 - PRESET_DAYS[preset]);
  return { startDate: startDate < DATA_AVAILABLE_FROM ? DATA_AVAILABLE_FROM : startDate, endDate, timeZone };
}

/** The preset a range happens to be (so its button lights up), or null for a hand-picked one. */
export function presetOf(range: GatewayRange, now = Date.now()): RangePreset | null {
  return RANGE_PRESETS.find((p) => {
    const r = presetRange(p, now, range.timeZone);
    return r.startDate === range.startDate && r.endDate === range.endDate;
  }) ?? null;
}

function validDate(s: string | null): s is string {
  return !!s && DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
}

/** The range kept in the address (?range=7D or ?start=...&end=...); anything unusable falls back to 1D. */
export function rangeFromParams(params: URLSearchParams, now = Date.now()): GatewayRange {
  const start = params.get('start');
  const end = params.get('end');
  if (validDate(start) && validDate(end) && start <= end && end >= DATA_AVAILABLE_FROM && daysBetween(start, end) <= MAX_RANGE_DAYS) {
    return { startDate: start < DATA_AVAILABLE_FROM ? DATA_AVAILABLE_FROM : start, endDate: end, timeZone: GATEWAY_TIME_ZONE };
  }
  const preset = (params.get('range') ?? '').toUpperCase() as RangePreset;
  return presetRange(RANGE_PRESETS.includes(preset) ? preset : '1D', now);
}

export function rangeToParams(range: GatewayRange, now = Date.now()): Record<string, string> {
  const preset = presetOf(range, now);
  return preset ? (preset === '1D' ? {} : { range: preset }) : { start: range.startDate, end: range.endDate };
}

// --- Calendar ----------------------------------------------------------------------------------------------------

/** "2026-10" for a date. */
export const monthOf = (date: string): string => date.slice(0, 7);

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(Date.parse(`${month}-01T00:00:00Z`));
}

/** The month as weeks (Sunday first) of "YYYY-MM-DD" days; null pads the days that belong to the neighbouring months. */
export function monthGrid(month: string): Array<Array<string | null>> {
  const [y, m] = month.split('-').map(Number);
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: Array<string | null> = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

export interface DayPick {
  start: string;
  /** null while the second day is still to be picked. */
  end: string | null;
}

/** A click on a day: the first starts a range, the second ends it (either way round), the next starts afresh. */
export function pickDay(pick: DayPick | null, day: string): DayPick {
  if (!pick || pick.end !== null) return { start: day, end: null };
  return day < pick.start ? { start: day, end: pick.start } : { start: pick.start, end: day };
}

/** A day can be picked unless it is in the future, before the data begins, or would stretch a half-made range past the limit. */
export function dayPickable(day: string, pick: DayPick | null, today: string, min = DATA_AVAILABLE_FROM): boolean {
  if (day > today || day < min) return false;
  if (pick && pick.end === null) return daysBetween(day < pick.start ? day : pick.start, day < pick.start ? pick.start : day) <= MAX_RANGE_DAYS;
  return true;
}

// --- Formatting --------------------------------------------------------------------------------------------------

export const DASH = '—';

/** "15 Oct 2026" for a calendar day. */
export function fmtDay(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(Date.parse(`${date}T00:00:00Z`));
}

/** "15 Oct 2026, 08:41:26" in the page's zone. */
export function fmtDateTime(iso: string | null | undefined, timeZone = GATEWAY_TIME_ZONE): string {
  if (!iso) return DASH;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return DASH;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(t);
  const g = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${g('day')} ${g('month')} ${g('year')}, ${g('hour')}:${g('minute')}:${g('second')}`;
}

/** "8h 36m" / "5m" / "0m": whole minutes, for totals. */
export function fmtHm(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return DASH;
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
}

/** "2m 29s" / "8h 38m" / "9s": the two biggest units, for a single span. */
export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return DASH;
  const s = Math.round(Math.max(0, seconds));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}

export const fmtInt = (n: number | null | undefined): string => (n == null ? DASH : Math.round(n).toLocaleString('en-US'));
export const fmtPercent = (p: number | null | undefined, digits = 1): string => (p == null || !Number.isFinite(p) ? DASH : `${p.toFixed(digits)}%`);

/** Heartbeats ("1,036 / 1,040 (99.6%) · missed 4"); a gateway that never reported has none. */
export function fmtHeartbeats(g: Pick<GatewayConnectivity, 'heartbeatsReceived' | 'heartbeatsExpected'>): string {
  const { heartbeatsReceived: got, heartbeatsExpected: want } = g;
  if (got == null || want == null) return DASH;
  const pct = want > 0 ? ` (${((got / want) * 100).toFixed(1)}%)` : '';
  return `${fmtInt(got)} / ${fmtInt(want)}${pct} · missed ${fmtInt(Math.max(0, want - got))}`;
}

export const STATE_LABEL: Record<GatewayState, string> = { online: 'Online', offline: 'Offline', 'no-data': 'No data' };

export const REASON_LABEL: Record<string, string> = {
  SCHEDULED_REBOOT: 'Scheduled reboot',
  KEEPALIVE_ONLY: 'Keep-alive only',
};
export const reasonLabel = (reason: string | null): string => (reason ? REASON_LABEL[reason] ?? reason.replace(/_/g, ' ').toLowerCase() : DASH);

// --- Table sorting / filtering -----------------------------------------------------------------------------------

export type SortKey = 'gatewayId' | 'status' | 'lastSeenAt' | 'uptime' | 'onlineTime' | 'downtimeEvents' | 'heartbeats';
export type SortDir = 'asc' | 'desc';

const STATE_ORDER: Record<GatewayState, number> = { offline: 0, 'no-data': 1, online: 2 };

function sortValue(g: GatewayConnectivity, key: SortKey): string | number | null {
  switch (key) {
    case 'gatewayId': return g.gatewayId;
    case 'status': return STATE_ORDER[g.status];
    case 'lastSeenAt': return g.lastSeenAt ? Date.parse(g.lastSeenAt) : null;
    case 'uptime': return g.uptimePercent;
    case 'onlineTime': return g.onlineSeconds;
    case 'downtimeEvents': return g.downtimeEvents;
    case 'heartbeats':
      return g.heartbeatsReceived != null && g.heartbeatsExpected ? g.heartbeatsReceived / g.heartbeatsExpected : null;
  }
}

/** Sorts a copy; rows without a value always go last, whichever way it is sorted. */
export function sortGateways(rows: GatewayConnectivity[], key: SortKey, dir: SortDir): GatewayConnectivity[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    if (x === null && y === null) return a.gatewayId.localeCompare(b.gatewayId);
    if (x === null) return 1;
    if (y === null) return -1;
    const c = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : (x as number) - (y as number);
    return c !== 0 ? sign * c : a.gatewayId.localeCompare(b.gatewayId);
  });
}

export function filterGateways(rows: GatewayConnectivity[], state: GatewayState | 'all', search: string): GatewayConnectivity[] {
  const q = search.trim().toLowerCase();
  return rows.filter(
    (g) => (state === 'all' || g.status === state) && (!q || g.gatewayId.includes(q) || (g.address ?? '').toLowerCase().includes(q))
  );
}

// --- Timeline ----------------------------------------------------------------------------------------------------

export interface TimelineStats {
  /** Online + offline time actually observed. */
  observedSeconds: number;
  onlineSeconds: number;
  offlineSeconds: number;
  uptimePercent: number | null;
  downtimePercent: number | null;
  offlinePeriods: number;
  longestOutageSeconds: number;
  /** Time up to "now" (or the end of the range) that no segment covers. */
  noDataSeconds: number;
  heartbeatsReceived: number;
  heartbeatsExpected: number;
  heartbeatPercent: number | null;
}

const ms = (iso: string) => Date.parse(iso);

export function computeTimelineStats(t: GatewayTimeline): TimelineStats {
  const startAt = ms(t.range.startAt);
  const endAt = ms(t.range.endAt);
  const until = Math.min(endAt, ms(t.generatedAt));
  let online = 0;
  let offline = 0;
  let longest = 0;
  let periods = 0;
  for (const s of t.segments) {
    // Only what falls inside the range counts (the upstream can start a segment a moment before it).
    const secs = Math.max(0, Math.min(ms(s.end), endAt) - Math.max(ms(s.start), startAt)) / 1000;
    if (s.status === 'online') online += secs;
    else {
      offline += secs;
      periods += 1;
      longest = Math.max(longest, secs);
    }
  }
  const observed = online + offline;
  const received = t.heartbeatDays.reduce((n, d) => n + d.received, 0);
  const expected = t.heartbeatDays.reduce((n, d) => n + d.expected, 0);
  return {
    observedSeconds: observed,
    onlineSeconds: online,
    offlineSeconds: offline,
    uptimePercent: observed > 0 ? (online / observed) * 100 : null,
    downtimePercent: observed > 0 ? (offline / observed) * 100 : null,
    offlinePeriods: periods,
    longestOutageSeconds: longest,
    noDataSeconds: Math.max(0, Math.round((until - startAt) / 1000 - observed)),
    heartbeatsReceived: received,
    heartbeatsExpected: expected,
    heartbeatPercent: expected > 0 ? (received / expected) * 100 : null,
  };
}

export interface OfflinePeriod {
  index: number;
  segment: TimelineSegment;
  /** Still down: the period runs up to the moment the data was fetched. */
  ongoing: boolean;
}

export function offlinePeriods(t: GatewayTimeline): OfflinePeriod[] {
  const generated = ms(t.generatedAt);
  return t.segments
    .filter((s) => s.status === 'offline')
    .map((segment, i) => ({ index: i + 1, segment, ongoing: t.status === 'offline' && generated - ms(segment.end) < 120_000 }));
}

// --- Chart axis --------------------------------------------------------------------------------------------------

export interface View {
  from: number;
  to: number;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const TICK_STEPS = [MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY_MS, 2 * DAY_MS, 7 * DAY_MS];

/** Milliseconds the zone is ahead of UTC at an instant. */
export function zoneOffsetMs(ts: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(ts);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(ts / 1000) * 1000;
}

/** Tick instants (on round local times: whole hours, half days...) for a window, aiming at about `target` of them (5 for a day or less, else 8). */
export function axisTicks(view: View, timeZone: string, target?: number): { ticks: number[]; step: number } {
  const span = view.to - view.from;
  // A day reads best in 6-hour steps; longer windows can carry a tick per day.
  target ??= span <= DAY_MS * 1.1 ? 5 : 8;
  const step = TICK_STEPS.find((s) => span / s <= target) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const offset = zoneOffsetMs(view.from, timeZone);
  const first = Math.ceil((view.from + offset) / step) * step - offset;
  const ticks: number[] = [];
  for (let t = first; t <= view.to; t += step) ticks.push(t);
  return { ticks, step };
}

/** "06:00" inside a day, "15 Oct" on day steps, "15 Oct 06:00" for a window longer than a day. */
export function tickLabel(ts: number, step: number, spanMs: number, timeZone: string): string {
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', ...o }).format(ts);
  const time = fmt({ hour: '2-digit', minute: '2-digit' });
  if (step >= DAY_MS) return fmt({ day: '2-digit', month: 'short' });
  return spanMs > DAY_MS * 1.1 ? `${fmt({ day: '2-digit', month: 'short' })} ${time}` : time;
}

/** Clamps a window to the full range and keeps it at least `minMs` wide. */
export function clampView(view: View, full: View, minMs = 60_000): View {
  const width = Math.min(Math.max(view.to - view.from, minMs), full.to - full.from);
  const from = Math.min(Math.max(view.from, full.from), full.to - width);
  return { from, to: from + width };
}

/** Zoom around `anchor` (default: the window's centre): factor 2 doubles the width, 0.5 halves it. */
export function zoomView(view: View, full: View, factor: number, anchor?: number): View {
  const centre = anchor ?? (view.from + view.to) / 2;
  const half = ((view.to - view.from) * factor) / 2;
  return clampView({ from: centre - half, to: centre + half }, full);
}

/** The stretch of time the segments cover, or null when there are none. */
export function dataExtent(segments: Array<{ start: string; end: string }>): View | null {
  if (segments.length === 0) return null;
  return { from: Math.min(...segments.map((s) => ms(s.start))), to: Math.max(...segments.map((s) => ms(s.end))) };
}

/**
 * Where zooming in should look: the middle of the data that is on screen, so a day that has only reported for its first
 * hours does not zoom into the empty afternoon. With no data in view it is the window's own centre.
 */
export function zoomAnchor(view: View, extent: View | null): number {
  if (extent) {
    const from = Math.max(view.from, extent.from);
    const to = Math.min(view.to, extent.to);
    if (from < to) return (from + to) / 2;
  }
  return (view.from + view.to) / 2;
}

/** A window around one period, with room either side so it is not jammed against the edges. */
export function viewAround(seg: { start: string; end: string }, full: View): View {
  const from = ms(seg.start);
  const to = ms(seg.end);
  const pad = Math.max((to - from) * 2, 10 * MINUTE);
  return clampView({ from: from - pad, to: to + pad }, full);
}
