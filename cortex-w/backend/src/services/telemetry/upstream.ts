import { proxyUpstream } from '../upstreamProxy.js';
import { getAuthToken } from '../../routes/gis.js';
import { getRoots } from '../siteTree.js';
import type { TelemetryWindow } from './windows.js';

export interface UpstreamGatewaySummary {
  totalUniqueMeters: number;
  gatewayCount: number;
  metersOnMultipleGateways: number;
  perGateway: Array<{ gatewayId: string; uniqueMeterCount: number }>;
}

/**
 * Authoritative, site-scoped unique-meter-per-gateway summary from cog-core-api
 * (GET /api/water/gateway-meter-summary). Computed upstream over ALL data, so it is not
 * affected by our ingestion cap, and it handles gateways that hear meters from several sites.
 * 'ALL' expands to every top-level site in the live hierarchy, so new sites are included automatically.
 */
const gatewaySummaryCache = new Map<string, { at: number; data: UpstreamGatewaySummary }>();
const GATEWAY_SUMMARY_TTL_MS = 60_000;

export async function fetchGatewayMeterSummary(siteId: string, fromDate: string, toDate: string): Promise<UpstreamGatewaySummary | null> {
  const cacheKey = `${siteId || 'ALL'}|${fromDate}|${toDate}`;
  const hit = gatewaySummaryCache.get(cacheKey);
  if (hit && Date.now() - hit.at < GATEWAY_SUMMARY_TTL_MS) return hit.data;
  const fresh = await fetchGatewayMeterSummaryUncached(siteId, fromDate, toDate);
  if (fresh) gatewaySummaryCache.set(cacheKey, { at: Date.now(), data: fresh });
  return fresh;
}

async function fetchGatewayMeterSummaryUncached(siteId: string, fromDate: string, toDate: string): Promise<UpstreamGatewaySummary | null> {
  try {
    let siteIds = siteId;
    if (!siteId || siteId === 'ALL') {
      const roots = await getRoots();
      if (roots.length === 0) return null;
      siteIds = roots.map((r) => r.id).join(',');
    }
    const token = await getAuthToken();
    const up = await proxyUpstream(
      'GET',
      `/api/water/gateway-meter-summary?siteIds=${encodeURIComponent(siteIds)}&fromDate=${fromDate}&toDate=${toDate}`,
      { headers: { Authorization: token } }
    );
    const d = up.data as UpstreamGatewaySummary | null;
    if (up.status !== 200 || !d || !Array.isArray(d.perGateway)) return null;
    return d;
  } catch (err: any) {
    console.warn('[telemetryDb] gateway-meter-summary unavailable:', err.message);
    return null;
  }
}

/**
 * Which gateways serve a site, from the upstream summary. 'ALL' (or empty) means "no restriction" and
 * yields null. A specific site that upstream can't answer for is an error: better than silently showing
 * the whole fleet under that site's name.
 */
export async function resolveSiteGateways(siteId: string | undefined, win: TelemetryWindow): Promise<string[] | null> {
  if (!siteId || siteId === 'ALL') return null;
  const up = await fetchGatewayMeterSummary(siteId, win.fromDate, win.toDate);
  if (!up) throw new Error('Site gateway summary is unavailable from the upstream API');
  return up.perGateway.map((g) => g.gatewayId);
}
