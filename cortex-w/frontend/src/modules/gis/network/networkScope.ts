import type { NetGateway, NetGatewaysResponse, NetMeterMapResponse, NetSiteOption, NetUnplacedGateway } from '@/services/api/networkApi';
import { METER_STATUS_STYLE, type MeterPoint } from './networkModel';
import type { NetMeterStatus } from '@/services/api/networkApi';

/** The site and every site below it, from the area list the page already has (parentId links, ids as text). */
export function siteWithDescendants(sites: ReadonlyArray<Pick<NetSiteOption, 'id' | 'parentId'>>, siteId: string): Set<number> {
  const children = new Map<string, string[]>();
  for (const s of sites) {
    if (s.parentId == null) continue;
    const list = children.get(s.parentId);
    if (list) list.push(s.id);
    else children.set(s.parentId, [s.id]);
  }
  const out = new Set<number>();
  const stack = [siteId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = Number(id);
    if (Number.isFinite(n)) out.add(n);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

export interface SiteView {
  gateways: NetGateway[];
  unplaced: NetUnplacedGateway[];
  points: MeterPoint[];
  summary: NetMeterMapResponse['summary'];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The numbers of one gateway worked out from the meters that report through it. */
function gatewayStats(points: ReadonlyArray<MeterPoint>) {
  let rssiSum = 0, rssiN = 0, snrSum = 0, snrN = 0, live = 0;
  for (const p of points) {
    if (p.status === 'connected') live++;
    if (p.rssi != null) { rssiSum += p.rssi; rssiN++; }
    if (p.snr != null) { snrSum += p.snr; snrN++; }
  }
  return {
    metersHeard: points.length,
    liveMeters: live,
    avgRssi: rssiN ? round1(rssiSum / rssiN) : null,
    avgSnr: snrN ? round1(snrSum / snrN) : null,
  };
}

/** Same rule as the server's gatewayStatus, except that the newest frame is the one it already knows (the whole area's). */
function statusFor(
  g: { status: NetGateway['status'] },
  s: { metersHeard: number; avgRssi: number | null; avgSnr: number | null },
  degradedRssi: number,
  degradedSnr: number
): NetGateway['status'] {
  if (s.metersHeard === 0) return 'no-traffic';
  if (g.status === 'stale') return 'stale';
  if ((s.avgRssi != null && s.avgRssi < degradedRssi) || (s.avgSnr != null && s.avgSnr < degradedSnr)) return 'degraded';
  return 'reporting';
}

/**
 * What the server would answer for one site (and the sites below it), worked out from what it answered for all of the
 * user's sites. A click on a site then needs no new request: the meters are filtered by the site column, the gateways
 * that stand in the site or hear its meters are kept with their numbers counted from those meters only, and the totals
 * add the meters without a position (counted per site in `unpositioned`).
 */
export function deriveSiteView(
  all: { gateways: NetGatewaysResponse; map: NetMeterMapResponse; points: ReadonlyArray<MeterPoint> },
  siteIds: ReadonlySet<number>,
  limits: { degradedRssi: number; degradedSnr: number }
): SiteView {
  const points = all.points.filter((p) => p.siteId != null && siteIds.has(p.siteId));
  const byGateway = new Map<string, MeterPoint[]>();
  for (const p of points) {
    if (!p.gatewayId) continue;
    const list = byGateway.get(p.gatewayId);
    if (list) list.push(p);
    else byGateway.set(p.gatewayId, [p]);
  }

  // meters of the site without a position are not on the map, but they do report through gateways: the server counts them
  // in a gateway's numbers, the map payload cannot tell which gateway they use, so these numbers cover the drawn meters
  const gateways: NetGateway[] = [];
  for (const g of all.gateways.gateways) {
    const mine = byGateway.get(g.gatewayId) ?? [];
    const inSite = g.siteId != null && siteIds.has(g.siteId);
    if (mine.length === 0 && !inSite) continue;
    const stats = gatewayStats(mine);
    gateways.push({ ...g, ...stats, status: statusFor(g, stats, limits.degradedRssi, limits.degradedSnr) });
  }
  const unplaced: NetUnplacedGateway[] = [];
  for (const g of all.gateways.unplaced) {
    const mine = byGateway.get(g.gatewayId) ?? [];
    if (mine.length === 0) continue;
    const stats = gatewayStats(mine);
    unplaced.push({ ...g, ...stats, status: statusFor(g, stats, limits.degradedRssi, limits.degradedSnr) });
  }
  unplaced.sort((a, b) => b.metersHeard - a.metersHeard);

  const counts: Record<NetMeterStatus, number> = { connected: 0, disconnected: 0, never: 0 };
  for (const p of points) counts[p.status]++;
  let without = 0;
  for (const [site, statusIdx, n] of all.map.unpositioned ?? []) {
    if (!siteIds.has(site)) continue;
    const status = all.map.statuses[statusIdx];
    if (status && status in METER_STATUS_STYLE) counts[status] += n;
    without += n;
  }
  return {
    gateways,
    unplaced,
    points,
    summary: {
      total: points.length + without,
      withCoordinates: points.length,
      withoutCoordinates: without,
      ...counts,
    },
  };
}

