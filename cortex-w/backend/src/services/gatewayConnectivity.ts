import { fetchUpstreamOrThrow } from './upstreamProxy.js';

/**
 * Gateway Status page: how reliably each gateway has been connected, straight from the upstream
 * `gateway-health` service (no Postgres involved yet). The upstream does the scoping: it only ever reports on the
 * gateways of the token's own client, and answers 403 for another client's gateway id.
 *
 * Upstream quirks absorbed here so the browser sees one clean contract:
 *  - the report is a POST (an empty JSON body) although it only reads; the timeline is a GET;
 *  - every timestamp is a zone-less "2026-10-15T03:15:29.557" that is really UTC (the 18:30 start of a segment is
 *    midnight in Asia/Kolkata); some carry nanoseconds. All are returned as ISO-8601 with a "Z";
 *  - nullable everything: a gateway that never reported has no uptime, counts or days at all.
 */

export type GatewayState = 'online' | 'offline' | 'no-data';
export type SegmentState = 'online' | 'offline';

export interface GatewayDay {
  date: string;
  onlineSeconds: number;
  offlineSeconds: number;
  outages: number;
  heartbeatsReceived: number;
  heartbeatsExpected: number;
}

export interface GatewayConnectivity {
  gatewayId: string;
  status: GatewayState;
  lastSeenAt: string | null;
  uptimePercent: number | null;
  onlineSeconds: number | null;
  /** Online + offline seconds over the range: what "online time" is measured against. */
  observedSeconds: number | null;
  downtimeEvents: number;
  heartbeatsReceived: number | null;
  heartbeatsExpected: number | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  days: GatewayDay[];
}

export interface ConnectivityReport {
  range: DateRange;
  generatedAt: string;
  counts: { online: number; offline: number; noData: number; total: number };
  historyAvailableFrom: string | null;
  gateways: GatewayConnectivity[];
}

export interface TimelineSegment {
  status: SegmentState;
  start: string;
  end: string;
  durationSeconds: number;
  /** SCHEDULED_REBOOT, KEEPALIVE_ONLY, ... or null. */
  reason: string | null;
}

export interface GatewayTimeline {
  gatewayId: string;
  status: GatewayState | null;
  lastSeenAt: string | null;
  historyAvailableFrom: string | null;
  /** The requested days as instants: from the first moment of startDate to the end of endDate in the zone. */
  range: DateRange & { startAt: string; endAt: string };
  generatedAt: string;
  segments: TimelineSegment[];
  heartbeatDays: Array<{ date: string; received: number; expected: number }>;
}

export interface DateRange {
  startDate: string;
  endDate: string;
  timeZone: string;
}

export class BadRangeError extends Error {}

/** The first day any data exists for. Nothing earlier can be asked for (the pages disable those days). */
export const DATA_AVAILABLE_FROM = '2026-10-01';

/** The quick ranges of the page, in days ending today. */
export const PRESET_DAYS = { '1D': 1, '3D': 3, '7D': 7, '14D': 14 } as const;
export type PresetKey = keyof typeof PRESET_DAYS;
export const PRESET_KEYS = Object.keys(PRESET_DAYS) as PresetKey[];

const MAX_RANGE_DAYS = 92;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// --- Dates -----------------------------------------------------------------------------------------------------

function parseDate(s: string): number | null {
  if (!DATE.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  // Date.parse accepts 2026-02-31 by rolling over; reject anything that does not round-trip.
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s ? null : t;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Validates the query; throws BadRangeError with a message fit for the user. */
export function parseRange(startDate: unknown, endDate: unknown, timeZone: unknown): DateRange {
  if (typeof startDate !== 'string' || typeof endDate !== 'string') throw new BadRangeError('startDate and endDate are required (YYYY-MM-DD)');
  const s = parseDate(startDate);
  const e = parseDate(endDate);
  if (s === null || e === null) throw new BadRangeError('startDate and endDate must be real dates written YYYY-MM-DD');
  if (e < s) throw new BadRangeError('endDate must not be before startDate');
  if (startDate < DATA_AVAILABLE_FROM) throw new BadRangeError(`There is no data before ${DATA_AVAILABLE_FROM}`);
  if ((e - s) / 86_400_000 + 1 > MAX_RANGE_DAYS) throw new BadRangeError(`The range can span at most ${MAX_RANGE_DAYS} days`);
  const tz = timeZone === undefined ? 'Asia/Kolkata' : timeZone;
  if (typeof tz !== 'string' || !isValidTimeZone(tz)) throw new BadRangeError('timeZone must be an IANA zone such as Asia/Kolkata');
  return { startDate, endDate, timeZone: tz };
}

/** Milliseconds the zone is ahead of UTC at the given instant. */
function zoneOffsetMs(ts: number, timeZone: string): number {
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
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** The instant a calendar day starts in the zone (midnight there). */
export function startOfDayUtc(date: string, timeZone: string): number {
  const guess = Date.parse(`${date}T00:00:00Z`);
  const first = guess - zoneOffsetMs(guess, timeZone);
  const second = guess - zoneOffsetMs(first, timeZone);
  return second; // equals `first` except across a DST change, where the offset at the result is the right one
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** "2026-10-15T03:15:29.557" or "...03.900518946" (UTC, no zone) -> "2026-10-15T03:15:29.557Z"; null when unusable. */
export function utcIso(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw === '') return null;
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$/.exec(raw);
  if (!m) return null;
  const ms = (m[2] ?? '').slice(0, 3).padEnd(3, '0');
  const t = Date.parse(`${m[1]}.${ms}${m[3] ?? 'Z'}`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// --- Normalising -----------------------------------------------------------------------------------------------

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

function gatewayState(v: unknown): GatewayState {
  return v === 'ONLINE' ? 'online' : v === 'OFFLINE' ? 'offline' : 'no-data';
}

function normalizeGateway(raw: unknown): GatewayConnectivity | null {
  const g = rec(raw);
  const gatewayId = str(g.gatewayId);
  if (!gatewayId) return null;
  const days: GatewayDay[] = (Array.isArray(g.days) ? g.days : []).map((d) => {
    const day = rec(d);
    return {
      date: str(day.date) ?? '',
      onlineSeconds: num(day.onlineSeconds) ?? 0,
      offlineSeconds: num(day.offlineSeconds) ?? 0,
      outages: num(day.outages) ?? 0,
      heartbeatsReceived: num(day.statsReceived) ?? 0,
      heartbeatsExpected: num(day.statsExpected) ?? 0,
    };
  });
  const onlineSeconds = num(g.onlineSeconds);
  return {
    gatewayId: gatewayId.toLowerCase(),
    status: gatewayState(g.currentStatus),
    lastSeenAt: utcIso(g.lastSeenAt),
    uptimePercent: num(g.uptimePercent),
    onlineSeconds,
    observedSeconds: days.length ? days.reduce((sum, d) => sum + d.onlineSeconds + d.offlineSeconds, 0) : null,
    downtimeEvents: num(g.downtimeEventCount) ?? 0,
    heartbeatsReceived: num(g.statsReceived),
    heartbeatsExpected: num(g.statsExpected),
    latitude: num(g.latitude),
    longitude: num(g.longitude),
    address: str(g.address),
    days,
  };
}

export function normalizeReport(raw: unknown, range: DateRange, now = Date.now()): ConnectivityReport {
  const body = rec(raw);
  const page = rec(body.gatewayConnectivityReportList);
  const gateways = (Array.isArray(page.content) ? page.content : [])
    .map(normalizeGateway)
    .filter((g): g is GatewayConnectivity => g !== null)
    .sort((a, b) => a.gatewayId.localeCompare(b.gatewayId));
  return {
    range,
    generatedAt: new Date(now).toISOString(),
    // Counted from the rows, so the chips always add up to the table (the upstream's own totals omit "no data").
    counts: {
      online: gateways.filter((g) => g.status === 'online').length,
      offline: gateways.filter((g) => g.status === 'offline').length,
      noData: gateways.filter((g) => g.status === 'no-data').length,
      total: gateways.length,
    },
    historyAvailableFrom: utcIso(body.historyAvailableFrom),
    gateways,
  };
}

export function normalizeTimeline(raw: unknown, gatewayId: string, range: DateRange, now = Date.now()): GatewayTimeline {
  const body = rec(raw);
  const segments: TimelineSegment[] = [];
  for (const s of Array.isArray(body.segments) ? body.segments : []) {
    const seg = rec(s);
    const start = utcIso(seg.startTime);
    const end = utcIso(seg.endTime);
    if (!start || !end) continue;
    segments.push({
      status: seg.status === 'OFFLINE' ? 'offline' : 'online',
      start,
      end,
      durationSeconds: num(seg.durationSeconds) ?? Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000)),
      reason: str(seg.reason),
    });
  }
  segments.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const startAt = startOfDayUtc(range.startDate, range.timeZone);
  const endAt = startOfDayUtc(addDays(range.endDate, 1), range.timeZone);
  return {
    gatewayId,
    status: body.currentStatus == null ? null : gatewayState(body.currentStatus),
    lastSeenAt: utcIso(body.lastSeenAt),
    historyAvailableFrom: utcIso(body.historyAvailableFrom),
    range: { ...range, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString() },
    generatedAt: new Date(now).toISOString(),
    segments,
    heartbeatDays: (Array.isArray(body.packetDays) ? body.packetDays : []).map((d) => {
      const day = rec(d);
      return { date: str(day.date) ?? '', received: num(day.statsReceived) ?? 0, expected: num(day.statsExpected) ?? 0 };
    }),
  };
}

// --- Slicing one answer into many ranges ----------------------------------------------------------------------
//
// The page shows 1D / 3D / 7D / 14D (and any chosen days). Asking the upstream once per range is slow (about a second
// and a half each) and the answers overlap completely, so one call covers them all and each range is cut from it:
// the per-day figures (`days`) and the segments are enough to rebuild what the upstream would have said for a sub-range.
// The one difference is a deliberate one: an outage that began before a range's first day is not counted as an event of
// that range (the upstream counts it when the range starts exactly there), so every range counts events the same way
// and a 1D count is never larger than the same day inside 14D. The call therefore starts one day before the earliest
// range, and that leading day is dropped when slicing.

/** "2026-10-15": the calendar day it is in the zone right now. */
export function todayInZone(timeZone: string, now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * The one range to ask the upstream for so that every range in `ranges` can be cut from it. It runs through `through`
 * (today) at least: the upstream reports a gateway's status as of the end of the range asked for, and "current status"
 * must be current even when the days being looked at are older.
 */
export function baseRangeFor(ranges: DateRange[], through?: string): DateRange {
  const start = ranges.map((r) => r.startDate).sort()[0];
  const end = [...ranges.map((r) => r.endDate), ...(through ? [through] : [])].sort().reverse()[0];
  const lead = addDays(start, -1);
  return { startDate: lead >= DATA_AVAILABLE_FROM ? lead : start, endDate: end, timeZone: ranges[0].timeZone };
}

/** The quick ranges ending on `endDate`; a range that would start before the data does is shortened to start there. */
export function presetRanges(endDate: string, timeZone: string): Record<PresetKey, DateRange> {
  const out = {} as Record<PresetKey, DateRange>;
  for (const key of PRESET_KEYS) {
    const start = addDays(endDate, 1 - PRESET_DAYS[key]);
    out[key] = { startDate: start < DATA_AVAILABLE_FROM ? DATA_AVAILABLE_FROM : start, endDate, timeZone };
  }
  return out;
}

const sum = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((n, r) => n + pick(r), 0);

function sliceGateway(g: GatewayConnectivity, range: DateRange): GatewayConnectivity {
  const days = g.days.filter((d) => d.date >= range.startDate && d.date <= range.endDate);
  if (days.length === 0) {
    // Nothing was reported on these days: whatever the gateway is now, it has no figures for them.
    return { ...g, days, uptimePercent: null, onlineSeconds: null, observedSeconds: null, downtimeEvents: 0, heartbeatsReceived: null, heartbeatsExpected: null };
  }
  const online = sum(days, (d) => d.onlineSeconds);
  const observed = online + sum(days, (d) => d.offlineSeconds);
  return {
    ...g,
    days,
    uptimePercent: observed > 0 ? (online / observed) * 100 : null,
    onlineSeconds: online,
    observedSeconds: observed,
    downtimeEvents: sum(days, (d) => d.outages),
    heartbeatsReceived: sum(days, (d) => d.heartbeatsReceived),
    heartbeatsExpected: sum(days, (d) => d.heartbeatsExpected),
  };
}

export function sliceReport(base: ConnectivityReport, range: DateRange): ConnectivityReport {
  return { ...base, range, gateways: base.gateways.map((g) => sliceGateway(g, range)) };
}

export function sliceTimeline(base: GatewayTimeline, range: DateRange): GatewayTimeline {
  const startAt = startOfDayUtc(range.startDate, range.timeZone);
  const endAt = startOfDayUtc(addDays(range.endDate, 1), range.timeZone);
  const segments: TimelineSegment[] = [];
  for (const s of base.segments) {
    const from = Date.parse(s.start);
    const to = Date.parse(s.end);
    if (to <= startAt || from >= endAt) continue;
    const clipped = from < startAt || to > endAt;
    const start = Math.max(from, startAt);
    const end = Math.min(to, endAt);
    segments.push(
      clipped
        ? { ...s, start: new Date(start).toISOString(), end: new Date(end).toISOString(), durationSeconds: Math.round((end - start) / 1000) }
        : s
    );
  }
  return {
    ...base,
    range: { ...range, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString() },
    segments,
    heartbeatDays: base.heartbeatDays.filter((d) => d.date >= range.startDate && d.date <= range.endDate),
  };
}

// --- Upstream calls --------------------------------------------------------------------------------------------

function query(range: DateRange): Record<string, string> {
  return { timeZone: range.timeZone, startDate: range.startDate, endDate: range.endDate };
}

async function fetchBaseReport(token: string, range: DateRange): Promise<ConnectivityReport> {
  const raw = await fetchUpstreamOrThrow('POST', '/api/gateway-health/gateway-connectivity-report', {
    query: query(range),
    headers: { Authorization: token },
    body: {},
  });
  return normalizeReport(raw, range);
}

async function fetchBaseTimeline(token: string, gatewayId: string, range: DateRange): Promise<GatewayTimeline> {
  const raw = await fetchUpstreamOrThrow('GET', `/api/gateway-health/gateway-connectivity-report/${encodeURIComponent(gatewayId)}/timeline`, {
    query: query(range),
    headers: { Authorization: token },
  });
  return normalizeTimeline(raw, gatewayId, range);
}

export interface PresetBundle<T> {
  generatedAt: string;
  ranges: Record<PresetKey, T>;
}

/** `token` is "Bearer <jwt>": the signed-in client's own, so upstream scopes the answer to that client. */
export async function fetchConnectivityReport(token: string, range: DateRange): Promise<ConnectivityReport> {
  return sliceReport(await fetchBaseReport(token, baseRangeFor([range], todayInZone(range.timeZone))), range);
}

/** 1D, 3D, 7D and 14D ending on `endDate`, from a single upstream call. */
export async function fetchReportPresets(token: string, endDate: string, timeZone: string): Promise<PresetBundle<ConnectivityReport>> {
  const ranges = presetRanges(endDate, timeZone);
  const base = await fetchBaseReport(token, baseRangeFor(Object.values(ranges), todayInZone(timeZone)));
  return { generatedAt: base.generatedAt, ranges: Object.fromEntries(PRESET_KEYS.map((k) => [k, sliceReport(base, ranges[k])])) as Record<PresetKey, ConnectivityReport> };
}

export async function fetchGatewayTimeline(token: string, gatewayId: string, range: DateRange): Promise<GatewayTimeline> {
  return sliceTimeline(await fetchBaseTimeline(token, gatewayId, baseRangeFor([range], todayInZone(range.timeZone))), range);
}

export async function fetchTimelinePresets(token: string, gatewayId: string, endDate: string, timeZone: string): Promise<PresetBundle<GatewayTimeline>> {
  const ranges = presetRanges(endDate, timeZone);
  const base = await fetchBaseTimeline(token, gatewayId, baseRangeFor(Object.values(ranges), todayInZone(timeZone)));
  return { generatedAt: base.generatedAt, ranges: Object.fromEntries(PRESET_KEYS.map((k) => [k, sliceTimeline(base, ranges[k])])) as Record<PresetKey, GatewayTimeline> };
}
