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
  shortInterruptions: number | null;
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
    shortInterruptions: num(body.shortInterruptions),
    range: { ...range, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString() },
    generatedAt: new Date(now).toISOString(),
    segments,
    heartbeatDays: (Array.isArray(body.packetDays) ? body.packetDays : []).map((d) => {
      const day = rec(d);
      return { date: str(day.date) ?? '', received: num(day.statsReceived) ?? 0, expected: num(day.statsExpected) ?? 0 };
    }),
  };
}

// --- Upstream calls --------------------------------------------------------------------------------------------

function query(range: DateRange): Record<string, string> {
  return { timeZone: range.timeZone, startDate: range.startDate, endDate: range.endDate };
}

/** `token` is "Bearer <jwt>": the signed-in client's own, so upstream scopes the answer to that client. */
export async function fetchConnectivityReport(token: string, range: DateRange): Promise<ConnectivityReport> {
  const raw = await fetchUpstreamOrThrow('POST', '/api/gateway-health/gateway-connectivity-report', {
    query: query(range),
    headers: { Authorization: token },
    body: {},
  });
  return normalizeReport(raw, range);
}

export async function fetchGatewayTimeline(token: string, gatewayId: string, range: DateRange): Promise<GatewayTimeline> {
  const raw = await fetchUpstreamOrThrow('GET', `/api/gateway-health/gateway-connectivity-report/${encodeURIComponent(gatewayId)}/timeline`, {
    query: query(range),
    headers: { Authorization: token },
  });
  return normalizeTimeline(raw, gatewayId, range);
}
