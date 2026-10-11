import { pool } from '../db/pool.js';
import { networkHealthThresholds as T } from '../config/networkHealth.js';
import { requireClient, type ClientCtx } from './clientContext.js';
import { clientTenantIds } from './tenantScope.js';
import { fetchUpstreamOrThrow } from './upstreamProxy.js';
import { singleFlight } from './inflight.js';
import {
  METER_STATUS_CODES,
  gatewayStatus,
  haversineM,
  likePattern,
  meterStatus,
  round,
  validCoord,
  type GatewayStatus,
  type MeterStatus,
} from './networkLogic.js';

/**
 * The Network Explorer, served from Postgres:
 *   gateways   geofence_metadata (kind GATEWAY) for where they stand, water_meter_latest for how they are doing
 *   meters     meter_metadata for who they are, water_meter_latest for their newest frame
 *   positions  the one thing Postgres does not hold: a meter's latitude / longitude. The beta API's
 *              /api/map/asset-locations has it (keyed by assetId); it is fetched once per client, slimmed to
 *              assetId -> [lat, lng] and cached, so a page load never waits for it after the first one.
 *
 * Every query is limited to the signed-in client's meters (tenant) AND to the sites that client may see (and their
 * sub-sites), so one client can never read another's. Nothing here writes to the database.
 */

const CACHE_TTL_MS = 30_000;
const GEOFENCE_TTL_MS = 5 * 60_000;
const COORDS_TTL_MS = 6 * 60 * 60_000; // a meter's position changes when it is re-installed, not by the hour
const COORDS_RETRY_AFTER_FAILURE_MS = 30_000;
const CACHE_MAX_ENTRIES = 200;

// ---------------------------------------------------------------------------------------------------------------------
// Small TTL cache with single-flight (concurrent callers share one load)
// ---------------------------------------------------------------------------------------------------------------------

type Store<T> = Map<string, { at: number; v: T }>;

function cached<T>(store: Store<T>, flights: Map<string, Promise<T>>, key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.v);
  return singleFlight(flights, key, async () => {
    const v = await load();
    if (store.size >= CACHE_MAX_ENTRIES) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
    store.set(key, { at: Date.now(), v });
    return v;
  });
}

const scopeKey = (ctx: ClientCtx, siteIds: number[] | null) => `${ctx.key}|${siteIds ? siteIds.join(',') : '*'}`;

/** Null means "no site limit" (demo mode only); otherwise the ids a query is limited to. */
export type SiteScope = number[] | null;

// ---------------------------------------------------------------------------------------------------------------------
// Meter positions (from the beta API, cached per client)
// ---------------------------------------------------------------------------------------------------------------------

export type CoordinatesStatus = 'fresh' | 'stale' | 'unavailable';

interface CoordEntry {
  coords: Map<number, [number, number]>;
  fetchedAt: number;
}

const coordCache = new Map<string, CoordEntry>();
const coordFlights = new Map<string, Promise<CoordEntry>>();
const coordFailedAt = new Map<string, number>();

async function loadCoords(ctx: ClientCtx): Promise<CoordEntry> {
  const data = await fetchUpstreamOrThrow('GET', '/api/map/asset-locations', { headers: { Authorization: ctx.token } });
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('asset-locations returned an unexpected shape');
  const coords = new Map<number, [number, number]>();
  for (const [assetId, v] of Object.entries(data as Record<string, any>)) {
    const id = Number(assetId);
    if (Number.isInteger(id) && validCoord(v?.latitude, v?.longitude)) coords.set(id, [v.latitude, v.longitude]);
  }
  return { coords, fetchedAt: Date.now() };
}

async function getCoords(ctx: ClientCtx): Promise<{ coords: Map<number, [number, number]> | null; status: CoordinatesStatus; fetchedAt: string | null }> {
  const hit = coordCache.get(ctx.key);
  const out = (status: CoordinatesStatus) => ({
    coords: hit?.coords ?? null,
    status: hit ? status : ('unavailable' as CoordinatesStatus),
    fetchedAt: hit ? new Date(hit.fetchedAt).toISOString() : null,
  });
  if (hit && Date.now() - hit.fetchedAt < COORDS_TTL_MS) return out('fresh');
  if (ctx.unscoped || !ctx.token) return out('stale'); // demo mode has no upstream to ask
  const failedAt = coordFailedAt.get(ctx.key);
  if (failedAt && Date.now() - failedAt < COORDS_RETRY_AFTER_FAILURE_MS) return out('stale');
  try {
    const entry = await singleFlight(coordFlights, ctx.key, () => loadCoords(ctx));
    coordCache.set(ctx.key, entry);
    coordFailedAt.delete(ctx.key);
    return { coords: entry.coords, status: 'fresh', fetchedAt: new Date(entry.fetchedAt).toISOString() };
  } catch (err: any) {
    coordFailedAt.set(ctx.key, Date.now());
    console.warn('[network] could not load meter positions:', err?.message || err);
    return out('stale'); // the old copy if there is one, else 'unavailable'
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Gateways
// ---------------------------------------------------------------------------------------------------------------------

interface GatewayRow {
  gatewayId: string;
  name: string | null;
  address: string | null;
  siteId: number | null;
  radiusM: number | null;
  lat: number | null;
  lng: number | null;
}

const geofenceStore: Store<GatewayRow[]> = new Map();
const geofenceFlights = new Map<string, Promise<GatewayRow[]>>();

/** Where the client's installed gateways stand (geofence_metadata, kind GATEWAY). */
function loadGatewayRows(ctx: ClientCtx): Promise<GatewayRow[]> {
  return cached(geofenceStore, geofenceFlights, ctx.key, GEOFENCE_TTL_MS, async () => {
    const res = await pool.query(
      `SELECT gateway_id, name, address, site_id, radius_m, center_lat, center_lng
         FROM geofence_metadata
        WHERE kind = 'GATEWAY' AND is_active AND gateway_id IS NOT NULL
          AND ($1::bigint[] IS NULL OR tenant_id = ANY($1::bigint[]))
        ORDER BY gateway_id`,
      [clientTenantIds()]
    );
    return res.rows.map((r: any) => ({
      gatewayId: String(r.gateway_id).toLowerCase(),
      name: r.name ?? null,
      address: r.address ?? null,
      siteId: r.site_id == null ? null : Number(r.site_id),
      radiusM: r.radius_m == null ? null : Number(r.radius_m),
      lat: validCoord(r.center_lat, r.center_lng) ? Number(r.center_lat) : null,
      lng: validCoord(r.center_lat, r.center_lng) ? Number(r.center_lng) : null,
    }));
  });
}

interface HealthRow {
  gatewayId: string;
  metersHeard: number;
  liveMeters: number;
  avgRssi: number | null;
  avgSnr: number | null;
  lastFrame: Date | null;
}

/** How each gateway is doing, from the newest frame of every meter it is the best gateway for (one row per meter). */
async function loadHealth(siteIds: SiteScope): Promise<Map<string, HealthRow>> {
  const liveAfter = new Date(Date.now() - T.meterStaleMinutes * 60_000);
  const res = await pool.query(
    `SELECT l.gateway_id,
            COUNT(*)::int                                      AS meters_heard,
            COUNT(*) FILTER (WHERE l.decoded_at >= $3)::int    AS live_meters,
            AVG(l.rssi)                                        AS avg_rssi,
            AVG(l.snr)                                         AS avg_snr,
            MAX(l.decoded_at)                                  AS last_frame
       FROM water_meter_latest l
       JOIN meter_metadata m ON m.meter_id = l.meter_id
      WHERE m.is_active AND l.gateway_id IS NOT NULL
        AND ($1::bigint[] IS NULL OR m.tenant_id = ANY($1::bigint[]))
        AND ($2::bigint[] IS NULL OR m.site_id = ANY($2::bigint[]))
      GROUP BY l.gateway_id`,
    [clientTenantIds(), siteIds, liveAfter]
  );
  const out = new Map<string, HealthRow>();
  for (const r of res.rows) {
    out.set(String(r.gateway_id).toLowerCase(), {
      gatewayId: String(r.gateway_id).toLowerCase(),
      metersHeard: r.meters_heard,
      liveMeters: r.live_meters,
      avgRssi: r.avg_rssi == null ? null : Number(r.avg_rssi),
      avgSnr: r.avg_snr == null ? null : Number(r.avg_snr),
      lastFrame: r.last_frame ?? null,
    });
  }
  return out;
}

export interface NetworkGateway {
  gatewayId: string;
  name: string | null;
  address: string | null;
  siteId: number | null;
  lat: number;
  lng: number;
  radiusM: number | null;
  status: GatewayStatus;
  metersHeard: number;
  liveMeters: number;
  avgRssi: number | null;
  avgSnr: number | null;
  lastFrameAt: string | null;
}

/** A gateway that meters report through but that cannot be drawn: no geofence stored for it, or no usable position. */
export interface UnplacedGateway {
  gatewayId: string;
  reason: 'no-geofence' | 'no-coordinates';
  status: GatewayStatus;
  metersHeard: number;
  liveMeters: number;
  avgRssi: number | null;
  avgSnr: number | null;
  lastFrameAt: string | null;
}

export interface GatewaysPayload {
  gateways: NetworkGateway[];
  unplaced: UnplacedGateway[];
}

const gatewaysStore: Store<GatewaysPayload> = new Map();
const gatewaysFlights = new Map<string, Promise<GatewaysPayload>>();

export function getGateways(siteIds: SiteScope): Promise<GatewaysPayload> {
  const ctx = requireClient();
  return cached(gatewaysStore, gatewaysFlights, scopeKey(ctx, siteIds), CACHE_TTL_MS, async () => {
    const [rows, health] = await Promise.all([loadGatewayRows(ctx), loadHealth(siteIds)]);
    const inScope = siteIds ? new Set(siteIds) : null;
    const now = Date.now();
    const gateways: NetworkGateway[] = [];
    const unplaced: UnplacedGateway[] = [];
    const known = new Set<string>();

    const stats = (h: HealthRow | undefined) => {
      const base = {
        metersHeard: h?.metersHeard ?? 0,
        liveMeters: h?.liveMeters ?? 0,
        avgRssi: round(h?.avgRssi, 1),
        avgSnr: round(h?.avgSnr, 1),
        lastFrameAt: h?.lastFrame ? new Date(h.lastFrame).toISOString() : null,
      };
      const status = gatewayStatus(
        { metersHeard: base.metersHeard, lastFrame: h?.lastFrame ?? null, avgRssi: h?.avgRssi ?? null, avgSnr: h?.avgSnr ?? null },
        now
      );
      return { ...base, status };
    };

    for (const g of rows) {
      known.add(g.gatewayId);
      const h = health.get(g.gatewayId);
      // Shown when it stands in the selected sites or when it hears meters that do.
      if (inScope && !h && !(g.siteId != null && inScope.has(g.siteId))) continue;
      if (g.lat == null || g.lng == null) {
        unplaced.push({ gatewayId: g.gatewayId, reason: 'no-coordinates', ...stats(h) });
        continue;
      }
      gateways.push({
        gatewayId: g.gatewayId,
        name: g.name,
        address: g.address,
        siteId: g.siteId,
        lat: g.lat,
        lng: g.lng,
        radiusM: g.radiusM,
        ...stats(h),
      });
    }
    for (const [id, h] of health) {
      if (!known.has(id)) unplaced.push({ gatewayId: id, reason: 'no-geofence', ...stats(h) });
    }
    unplaced.sort((a, b) => b.metersHeard - a.metersHeard);
    return { gateways, unplaced };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Meters: the compact payload that draws the map
// ---------------------------------------------------------------------------------------------------------------------

export const MAP_COLUMNS = ['meterId', 'assetId', 'lat', 'lng', 'status', 'gateway', 'rssi', 'snr'] as const;

export interface MeterMapPayload {
  /** Newest frame among these meters: it only changes when the scheduler loads data, so the response can be cached by ETag. */
  latestFrameAt: string | null;
  coordinates: { status: CoordinatesStatus; fetchedAt: string | null };
  summary: { total: number; withCoordinates: number; withoutCoordinates: number; live: number; stale: number; silent: number; never: number };
  /** status column: an index into this list. */
  statuses: readonly MeterStatus[];
  /** gateway column: an index into this list, or -1 when the meter has no gateway. */
  gatewayIds: string[];
  columns: typeof MAP_COLUMNS;
  /** Only meters with a usable position (the others are counted in summary.withoutCoordinates). */
  rows: Array<[string, number, number, number, number, number, number | null, number | null]>;
}

const mapStore: Store<MeterMapPayload> = new Map();
const mapFlights = new Map<string, Promise<MeterMapPayload>>();

export function getMeterMap(siteIds: SiteScope): Promise<MeterMapPayload> {
  const ctx = requireClient();
  return cached(mapStore, mapFlights, scopeKey(ctx, siteIds), CACHE_TTL_MS, async () => {
    const [res, pos] = await Promise.all([
      pool.query(
        `SELECT m.meter_id, m.asset_id, l.decoded_at, l.gateway_id, l.rssi, l.snr
           FROM meter_metadata m
           LEFT JOIN water_meter_latest l ON l.meter_id = m.meter_id
          WHERE m.is_active
            AND ($1::bigint[] IS NULL OR m.tenant_id = ANY($1::bigint[]))
            AND ($2::bigint[] IS NULL OR m.site_id = ANY($2::bigint[]))
          ORDER BY m.meter_id`,
        [clientTenantIds(), siteIds]
      ),
      getCoords(ctx),
    ]);

    const now = Date.now();
    const counts = { live: 0, stale: 0, silent: 0, never: 0 };
    const gatewayIds: string[] = [];
    const gwIndex = new Map<string, number>();
    const rows: MeterMapPayload['rows'] = [];
    let latest = 0;

    for (const r of res.rows) {
      const status = meterStatus(r.decoded_at, now);
      counts[status]++;
      if (r.decoded_at) latest = Math.max(latest, new Date(r.decoded_at).getTime());
      const assetId = Number(r.asset_id);
      const xy = pos.coords?.get(assetId);
      if (!xy) continue;
      let gw = -1;
      if (r.gateway_id) {
        const id = String(r.gateway_id).toLowerCase();
        gw = gwIndex.get(id) ?? -1;
        if (gw === -1) {
          gw = gatewayIds.length;
          gwIndex.set(id, gw);
          gatewayIds.push(id);
        }
      }
      rows.push([r.meter_id, assetId, round(xy[0], 6)!, round(xy[1], 6)!, METER_STATUS_CODES.indexOf(status), gw, round(r.rssi, 1), round(r.snr, 1)]);
    }

    return {
      latestFrameAt: latest ? new Date(latest).toISOString() : null,
      coordinates: { status: pos.status, fetchedAt: pos.fetchedAt },
      summary: {
        total: res.rows.length,
        withCoordinates: rows.length,
        withoutCoordinates: res.rows.length - rows.length,
        ...counts,
      },
      statuses: METER_STATUS_CODES,
      gatewayIds,
      columns: MAP_COLUMNS,
      rows,
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Meters: one page of the table
// ---------------------------------------------------------------------------------------------------------------------

export interface MeterListOpts {
  limit: number;
  offset: number;
  search?: string;
  status?: MeterStatus;
  gatewayId?: string;
}

export interface NetworkMeter {
  meterId: string;
  assetId: number;
  devEui: string | null;
  consumerName: string | null;
  householdId: string | null;
  locality: string | null;
  ward: string | null;
  zone: string | null;
  dma: string | null;
  siteId: number | null;
  siteName: string | null;
  lat: number | null;
  lng: number | null;
  gatewayId: string | null;
  distanceToGatewayM: number | null;
  status: MeterStatus;
  rssi: number | null;
  snr: number | null;
  lastSeen: string | null;
  currentReadingKl: number | null;
}

export async function listMeters(
  siteIds: SiteScope,
  opts: MeterListOpts
): Promise<{ total: number; limit: number; offset: number; coordinates: { status: CoordinatesStatus; fetchedAt: string | null }; items: NetworkMeter[] }> {
  const ctx = requireClient();
  const now = Date.now();
  const staleCut = new Date(now - T.meterStaleMinutes * 60_000);
  const silentCut = new Date(now - T.meterCriticalHours * 3_600_000);

  const params: unknown[] = [clientTenantIds(), siteIds];
  const where: string[] = [
    'm.is_active',
    '($1::bigint[] IS NULL OR m.tenant_id = ANY($1::bigint[]))',
    '($2::bigint[] IS NULL OR m.site_id = ANY($2::bigint[]))',
  ];
  const add = (v: unknown) => `$${params.push(v)}`;

  if (opts.search) {
    const p = add(likePattern(opts.search));
    where.push(`(m.meter_id ILIKE ${p} OR m.consumer_name ILIKE ${p} OR m.household_custom_id ILIKE ${p} OR m.locality ILIKE ${p})`);
  }
  if (opts.gatewayId) where.push(`l.gateway_id = ${add(opts.gatewayId)}`);
  if (opts.status === 'live') where.push(`l.decoded_at >= ${add(staleCut)}`);
  else if (opts.status === 'stale') where.push(`l.decoded_at < ${add(staleCut)} AND l.decoded_at >= ${add(silentCut)}`);
  else if (opts.status === 'silent') where.push(`l.decoded_at < ${add(silentCut)}`);
  else if (opts.status === 'never') where.push('l.decoded_at IS NULL');

  const limitP = add(opts.limit);
  const offsetP = add(opts.offset);
  const [res, pos, gateways] = await Promise.all([
    pool.query(
      `SELECT m.meter_id, m.asset_id, m.site_id, m.consumer_name, m.household_custom_id, m.locality, m.ward, m.zone, m.dma,
              l.dev_eui, l.decoded_at, l.gateway_id, l.rssi, l.snr, l.forward_flow_kl,
              COUNT(*) OVER()::int AS total
         FROM meter_metadata m
         LEFT JOIN water_meter_latest l ON l.meter_id = m.meter_id
        WHERE ${where.join(' AND ')}
        ORDER BY m.meter_id
        LIMIT ${limitP} OFFSET ${offsetP}`,
      params
    ),
    getCoords(ctx),
    loadGatewayRows(ctx),
  ]);

  const gwById = new Map(gateways.map((g) => [g.gatewayId, g]));
  const siteName = new Map(ctx.sites.map((s) => [s.id, s.name]));

  const items: NetworkMeter[] = res.rows.map((r: any) => {
    const assetId = Number(r.asset_id);
    const xy = pos.coords?.get(assetId) ?? null;
    const gwId = r.gateway_id ? String(r.gateway_id).toLowerCase() : null;
    const gw = gwId ? gwById.get(gwId) : undefined;
    const distance = xy && gw && gw.lat != null && gw.lng != null ? Math.round(haversineM(xy[0], xy[1], gw.lat, gw.lng)) : null;
    const siteId = r.site_id == null ? null : Number(r.site_id);
    return {
      meterId: r.meter_id,
      assetId,
      devEui: r.dev_eui ?? null,
      consumerName: r.consumer_name ?? null,
      householdId: r.household_custom_id ?? null,
      locality: r.locality ?? null,
      ward: r.ward ?? null,
      zone: r.zone ?? null,
      dma: r.dma ?? null,
      siteId,
      siteName: siteId == null ? null : siteName.get(siteId) ?? null,
      lat: xy ? round(xy[0], 6) : null,
      lng: xy ? round(xy[1], 6) : null,
      gatewayId: gwId,
      distanceToGatewayM: distance,
      status: meterStatus(r.decoded_at, now),
      rssi: round(r.rssi, 1),
      snr: round(r.snr, 1),
      lastSeen: r.decoded_at ? new Date(r.decoded_at).toISOString() : null,
      currentReadingKl: r.forward_flow_kl == null ? null : Number(r.forward_flow_kl),
    };
  });

  return {
    total: res.rows[0]?.total ?? 0,
    limit: opts.limit,
    offset: opts.offset,
    coordinates: { status: pos.status, fetchedAt: pos.fetchedAt },
    items,
  };
}
