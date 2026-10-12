import { networkHealthThresholds as T } from '../config/networkHealth.js';

// Pure rules for the Network Explorer (no database, no network), so they can be tested on their own.
// The limits are the Command Center's (config/networkHealth.ts), so a meter or gateway reads the same on every page.

export type MeterStatus = 'live' | 'stale' | 'silent' | 'never';
export type GatewayStatus = 'reporting' | 'degraded' | 'stale' | 'no-traffic';

/** Compact codes used in the map payload (an array index is far smaller than a string on 28,000 rows). */
export const METER_STATUS_CODES: readonly MeterStatus[] = ['live', 'stale', 'silent', 'never'];

/**
 * Live < 24 h since the last frame, stale up to 48 h (one missed daily report), silent beyond that. A meter that has
 * never sent a frame is `never`, not silent: nothing is known about it.
 */
export function meterStatus(lastFrame: Date | string | null | undefined, now: number = Date.now()): MeterStatus {
  if (lastFrame == null) return 'never';
  const ts = new Date(lastFrame).getTime();
  if (!Number.isFinite(ts)) return 'never';
  const ageMin = (now - ts) / 60000;
  if (ageMin > T.meterCriticalHours * 60) return 'silent';
  return ageMin > T.meterStaleMinutes ? 'stale' : 'live';
}


/** Same labels as the Command Center gateway rail, judged from the newest frames of the meters the gateway hears. */
export function gatewayStatus(
  g: { metersHeard: number; lastFrame: Date | string | null; avgRssi: number | null; avgSnr: number | null },
  now: number = Date.now()
): GatewayStatus {
  if (g.metersHeard === 0 || g.lastFrame == null) return 'no-traffic';
  const ts = new Date(g.lastFrame).getTime();
  if (!Number.isFinite(ts)) return 'no-traffic';
  if ((now - ts) / 60000 > T.gatewayStaleMinutes) return 'stale';
  if ((g.avgRssi != null && g.avgRssi < T.avgRssiDegradedDbm) || (g.avgSnr != null && g.avgSnr < T.avgSnrDegradedDb)) return 'degraded';
  return 'reporting';
}

/** Great-circle distance in metres. */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** A coordinate pair that can be drawn: finite, on Earth, and not the (0,0) a device reports when it has no fix. */
export function validCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** The requested sites plus everything below them, from the (id, parent) pairs the client may see. */
export function withDescendants(sites: ReadonlyArray<{ id: number; parentSite: number }>, ids: readonly number[]): number[] {
  const children = new Map<number, number[]>();
  for (const s of sites) {
    const list = children.get(s.parentSite);
    if (list) list.push(s.id);
    else children.set(s.parentSite, [s.id]);
  }
  const out = new Set<number>();
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const c of children.get(id) ?? []) stack.push(c);
  }
  return [...out].sort((a, b) => a - b);
}

/** Escapes % _ \ so a search term is matched literally by ILIKE. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, '\\$&')}%`;
}

export const round = (n: number | null | undefined, digits: number): number | null =>
  n == null || !Number.isFinite(n) ? null : Number(n.toFixed(digits));
