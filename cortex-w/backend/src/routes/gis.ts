import { Router } from 'express';
import { proxyUpstream } from '../services/upstreamProxy.js';
import { config } from '../config/env.js';
import { pool } from '../db/pool.js';
import { localDate } from '../services/localDate.js';
import { requireClient, scopeSiteIds, rootSites } from '../services/clientContext.js';
import { getGateways, getLegacyGisData, getMeterMap, resolveSiteScope, type SiteScope } from '../services/networkService.js';
import { planGateways, type ExistingMode } from '../services/gatewayPlacement.js';
import { planRelocation } from '../services/gatewayRelocation.js';
import { clientTenantIds } from '../services/tenantScope.js';

const router = Router();

/**
 * The token to call upstream with: always the signed-in client's own, so
 * upstream applies that client's permissions. There is deliberately no
 * service-account fallback — outside an authenticated request this throws.
 */
export async function getAuthToken(_providedHeader?: string): Promise<string> {
  const ctx = requireClient();
  return ctx.token; // '' in seed mode, where nothing calls upstream
}

/** A site to use when the request names none: the client's first top-level site. */
function defaultSiteId(): string {
  const ctx = requireClient();
  const first = rootSites(ctx)[0];
  return first ? String(first.id) : 'ALL';
}

/**
 * Gateways and meters of the signed-in client for the pages that look a meter up (households, billing, alarms) and for
 * Gateway Placement. Served from Postgres by the same service as the Network Explorer (services/networkService.ts):
 * every value is real or null. The old version called five upstream reports and filled the gaps with guesses (city from
 * the household id text, default positions, fixed signal values).
 */
export async function getLiveGisData(_authHeader?: string, siteId: string = 'ALL') {
  const scope = resolveSiteScope(siteId);
  if (scope === undefined) throw new Error('Unknown site');
  return getLegacyGisData(scope);
}

// GET /api/gis/gateways
router.get('/gateways', async (req, res) => {
  try {
    const siteId = (req.query.siteId as string) || 'ALL';
    if (resolveSiteScope(siteId) === undefined) return res.status(404).json({ error: 'Unknown site' });
    const data = await getLiveGisData(req.headers.authorization, siteId);
    res.json(data.gateways);
  } catch (err: any) {
    console.error('[gis] Error fetching gateways:', err.message);
    res.status(500).json({ error: 'Failed to fetch gateways' });
  }
});

// GET /api/gis/meters   (meters that have a position, as Gateway Placement needs them)
router.get('/meters', async (req, res) => {
  try {
    const siteId = (req.query.siteId as string) || 'ALL';
    if (resolveSiteScope(siteId) === undefined) return res.status(404).json({ error: 'Unknown site' });
    const gatewayId = (req.query.gatewayId as string | undefined)?.toLowerCase();
    const problemsOnly = req.query.problemsOnly === 'true';
    const search = (req.query.search as string | undefined)?.toLowerCase();
    const limitQuery = req.query.limit as string | undefined;
    const limit = limitQuery && limitQuery !== 'all' ? parseInt(limitQuery, 10) : 0;

    const data = await getLiveGisData(req.headers.authorization, siteId);
    let filtered = data.meters.filter((m) => m.lat != null && m.lng != null);
    if (gatewayId && gatewayId !== 'all') filtered = filtered.filter((m) => m.gatewayId === gatewayId);
    if (problemsOnly) filtered = filtered.filter((m) => m.status !== 'connected');
    if (search) {
      filtered = filtered.filter(
        (m) =>
          m.meterId.toLowerCase().includes(search) ||
          (m.householdId ?? '').toLowerCase().includes(search) ||
          (m.gatewayId ?? '').includes(search)
      );
    }
    const resultMeters = limit > 0 ? filtered.slice(0, limit) : filtered;
    res.json({ summary: data.summary, totalMatching: filtered.length, returnedCount: resultMeters.length, meters: resultMeters });
  } catch (err: any) {
    console.error('[gis] Error fetching meters:', err.message);
    res.status(500).json({ error: 'Failed to fetch meters' });
  }
});

// GET /api/gis/performance
router.get('/performance', async (req, res) => {
  try {
    const siteId = (req.query.siteId as string) || defaultSiteId();
    if (scopeSiteIds(requireClient(), siteId) === null) return res.status(404).json({ error: 'Unknown site' });
    const today = localDate(0);
    const lastWeek = localDate(-7);
    const fromDate = (req.query.fromDate as string) || lastWeek;
    const toDate = (req.query.toDate as string) || today;

    const authHeader = req.headers.authorization;
    const perfRes = await proxyUpstream('GET', '/api/water/gateway-performance', {
      query: { siteIds: siteId, fromDate, toDate },
      headers: authHeader ? { Authorization: authHeader } : {},
    });

    res.json(perfRes.data || []);
  } catch (err: any) {
    console.error('[gis] Error fetching gateway performance:', err.message);
    res.status(500).json({ error: 'Failed to fetch gateway performance' });
  }
});

// GET /api/gis/meter-detail/:assetId
// One meter for the Meter 360 drawer. Everything about the meter's readings comes from Postgres, the same tables and rules
// as the Dashboard (water_meter_daily for the days, water_meter_latest for the newest frame, the site's own time zone for
// "yesterday" and "this month"). The beta API is asked only for what Postgres does not hold: contact details, photos, the
// replacement history and the latest bill. If one of those calls fails the rest is still returned and the part is named in
// `unavailable`; a value nobody knows is null, never a stand-in. With ?core=1 the beta API is not called at all: the answer
// comes from Postgres alone (fast), and `partial: true` says the beta parts are still to be asked for.
router.get('/meter-detail/:assetId', async (req, res) => {
  try {
    const assetId = Number(req.params.assetId);
    const meterIdParam = (req.query.meterId as string) || '';
    if (!Number.isInteger(assetId)) return res.status(404).json({ error: 'Meter not found' });

    // The meter must be one of this client's own, and so must any meterId passed with it: the beta lookups below are not
    // scoped to the caller, so an own assetId with someone else's meterId would otherwise return their consumer details.
    // 404, not 403, so ids can't be probed.
    const metaRes = await pool.query(
      `SELECT m.meter_id, m.asset_id, m.site_id, m.consumer_name, m.household_custom_id, m.address, m.ward,
              COALESCE(s.tz_sql, 'UTC') AS tz,
              l.decoded_at, l.forward_flow_kl, l.rssi, l.snr, l.gateway_id, l.dev_eui
         FROM meter_metadata m
         LEFT JOIN site_metadata s ON s.site_id = m.site_id
         LEFT JOIN water_meter_latest l ON l.meter_id = m.meter_id
        WHERE m.asset_id = $1
          AND ($2::bigint[] IS NULL OR m.tenant_id = ANY($2::bigint[]))
          AND ($3 = '' OR m.meter_id = $3)
        LIMIT 1`,
      [assetId, clientTenantIds(), meterIdParam]
    );
    const meta = metaRes.rows[0];
    if (!meta) return res.status(404).json({ error: 'Meter not found' });
    const meterId: string = meta.meter_id;

    const token = await getAuthToken(req.headers.authorization);
    const headers: Record<string, string> = token ? { Authorization: token } : {};
    const today = localDate(0);
    const last30Days = localDate(-30);

    // A call that threw or got a server error is "unavailable"; a 404/204 just means there is nothing to show.
    const unavailable: string[] = [];
    const coreOnly = req.query.core === '1';
    const call = async (name: string, run: () => Promise<{ status: number; data: unknown }>) => {
      if (coreOnly) return null;
      try {
        const r = await run();
        if (r.status >= 500) unavailable.push(name);
        return r.status >= 200 && r.status < 300 ? r.data : null;
      } catch {
        unavailable.push(name);
        return null;
      }
    };

    const [asset, imeiData, imagesData, latestBill, hhDetail, daily, summary, frame] = await Promise.all([
      call('consumer', () => proxyUpstream('GET', `/api/asset/${assetId}`, { headers })) as Promise<any>,
      call('replacement history', () => proxyUpstream('GET', `/api/household/imei-history`, { query: { assetId: String(assetId) }, headers })),
      call('photos', () => proxyUpstream('GET', `/api/water/meter-image/${assetId}`, { headers })),
      call('bill', () => proxyUpstream('GET', `/api/billing/latest-bill/${assetId}`, { headers })) as Promise<any>,
      call('consumer', () =>
        proxyUpstream('POST', `/api/water/household-meter-details`, {
          body: { searchType: 'METER_NUMBER', value: meterId, fromDate: last30Days, toDate: today },
          headers,
        })
      ) as Promise<any>,
      // the last 10 days that have a reading (day as text: a DATE read through a JS Date shifts a day in time zones east of UTC)
      pool.query(
        `SELECT day::text AS day, reading_kl, used_kl FROM water_meter_daily WHERE meter_id = $1 ORDER BY day DESC LIMIT 10`,
        [meterId]
      ),
      // yesterday and this month at the meter's own site, same rules as the Dashboard
      pool.query(
        `WITH t AS (SELECT (NOW() AT TIME ZONE $2)::date AS today)
         SELECT (SELECT w.used_kl FROM water_meter_daily w, t WHERE w.meter_id = $1 AND w.day = t.today - 1)           AS yesterday_kl,
                (SELECT SUM(w.used_kl) FROM water_meter_daily w, t WHERE w.meter_id = $1 AND w.day >= date_trunc('month', t.today)::date) AS month_kl`,
        [meterId, meta.tz]
      ),
      // the newest live frame's radio settings (the one thing water_meter_latest does not keep)
      pool.query(
        `SELECT time, frequency, dr, adr, f_cnt FROM water_meter_readings_v2 WHERE meter_id = $1 AND is_history = false ORDER BY time DESC LIMIT 1`,
        [meterId]
      ),
    ]);

    const asNum = (v: unknown): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
    const imeiHistories: any[] = Array.isArray(imeiData) ? imeiData : [];
    const images: any[] = Array.isArray(imagesData) ? imagesData : [];

    // Photo attachments from installation records and meter-swap history
    const photos: Array<{ documentId?: number; name: string; category: string; url: string; uploadDate?: string }> = [];
    images.forEach((img: any) => {
      if (img.s3BucketURL) {
        photos.push({ documentId: img.documentId, name: img.name, category: img.category || 'NEW_METER_DOCUMENT', url: img.s3BucketURL, uploadDate: img.uploadDateTime });
      }
    });
    imeiHistories.forEach((ih: any) => {
      if (Array.isArray(ih.attachments)) {
        ih.attachments.forEach((att: any) => {
          if (att.s3BucketURL && !photos.some((p) => p.url === att.s3BucketURL)) {
            photos.push({ documentId: att.documentId, name: att.name, category: att.category || 'OLD_METER_DOCUMENT', url: att.s3BucketURL, uploadDate: att.uploadDateTime });
          }
        });
      }
    });
    const replacement = imeiHistories.find((ih: any) => ih.oldImeiNumber && ih.oldImeiNumber !== ih.newImeiNumber);

    // Oldest first, only days that exist: nothing is padded to ten
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dailyReadings = [...daily.rows].reverse().map((r: any) => {
      const [, mm, dd] = String(r.day).split('-');
      const usedKl = Number(r.used_kl) || 0;
      return {
        date: String(r.day),
        shortDate: `${MONTHS[Number(mm) - 1] ?? mm} ${dd}`,
        readingM3: Number((Number(r.reading_kl) || 0).toFixed(3)),
        consumptionL: Math.round(usedKl * 1000),
        consumptionM3: Number(usedKl.toFixed(3)),
      };
    });

    const yesterdayKl = asNum(summary.rows[0]?.yesterday_kl);
    const monthKl = asNum(summary.rows[0]?.month_kl);
    const f = frame.rows[0];

    res.json({
      assetId,
      meterId,
      assetName: asset?.name ?? null,
      status: asset?.status ?? null,
      latestReading: asNum(meta.forward_flow_kl),
      readingDate: meta.decoded_at ? new Date(meta.decoded_at).toISOString() : null,
      consumption: yesterdayKl == null ? null : Number(yesterdayKl.toFixed(3)),
      monthToDateM3: monthKl == null ? null : Number(monthKl.toFixed(3)),
      signalRssi: asNum(meta.rssi),
      signalSnr: asNum(meta.snr),
      lastSeen: meta.decoded_at ? new Date(meta.decoded_at).toISOString() : null,
      gatewayId: meta.gateway_id ? String(meta.gateway_id).toLowerCase() : null,
      devEui: meta.dev_eui ?? null,
      lastFrame: f ? { time: new Date(f.time).toISOString(), frequencyHz: asNum(f.frequency), dataRate: asNum(f.dr), adr: f.adr ?? null, fCnt: asNum(f.f_cnt) } : null,
      consumer: {
        id: asset?.household?.id ?? null,
        customId: asset?.household?.customId ?? hhDetail?.consumerId ?? meta.household_custom_id ?? null,
        name: asset?.household?.name ?? hhDetail?.consumerName ?? meta.consumer_name ?? null,
        mobile: asset?.household?.mobile ?? null,
        location: asset?.household?.location ?? hhDetail?.address ?? meta.address ?? null,
        ward: asset?.household?.ward ?? meta.ward ?? null,
        status: asset?.household?.status ?? null,
        registrationDate: asset?.household?.registrationDate ?? asset?.createdDate ?? null,
        siteName: asset?.siteName ?? hhDetail?.siteName ?? null,
      },
      replacement: replacement
        ? {
            oldMeterNumber: replacement.oldImeiNumber,
            oldMeterReading: replacement.oldMeterReading,
            newMeterNumber: replacement.newImeiNumber,
            newMeterReading: replacement.newMeterReading,
            date: replacement.uninstalledDate ?? null,
            status: replacement.status ?? null,
          }
        : null,
      photos,
      latestBill: latestBill ?? null,
      dailyReadings,
      partial: coreOnly,
      unavailable: [...new Set(unavailable)],
    });
  } catch (err: any) {
    console.error('[gis] Error fetching meter detail:', err.message);
    res.status(500).json({ error: 'Failed to fetch meter detail' });
  }
});

// GET /api/gis/geofences & GET /api/gis/geofence
async function handleGeofences(req: any, res: any) {
  try {
    const siteIds = req.query.siteIds || defaultSiteId();
    if (scopeSiteIds(requireClient(), String(siteIds)) === null) return res.status(404).json({ error: 'Unknown site' });
    const authHeader = req.headers.authorization;
    const token = await getAuthToken(authHeader);
    const upstream = await proxyUpstream('GET', '/api/map/geofence', {
      query: { siteIds: String(siteIds) },
      headers: token ? { Authorization: token } : {},
    });
    res.status(upstream.status).json(upstream.data || []);
  } catch (err: any) {
    console.error('[gis] Error fetching geofences:', err.message);
    res.status(500).json({ error: 'Failed to fetch geofences' });
  }
}
router.get('/geofences', handleGeofences);
router.get('/geofence', handleGeofences);

// GET /api/gis/asset-locations
router.get('/asset-locations', async (req, res) => {
  try {
    const siteIds = req.query.siteIds || defaultSiteId();
    if (scopeSiteIds(requireClient(), String(siteIds)) === null) return res.status(404).json({ error: 'Unknown site' });
    const authHeader = req.headers.authorization;
    const token = await getAuthToken(authHeader);
    const upstream = await proxyUpstream('GET', '/api/map/asset-locations', {
      query: { siteIds: String(siteIds) },
      headers: token ? { Authorization: token } : {},
    });
    res.status(upstream.status).json(upstream.data || {});
  } catch (err: any) {
    console.error('[gis] Error fetching asset locations:', err.message);
    res.status(500).json({ error: 'Failed to fetch asset locations' });
  }
});

/**
 * Plans already worked out, per data snapshot: the meter map and gateway list objects are cached per client and scope by
 * networkService (and replaced when they refresh), so a plan is reused only for the same client, the same data and the
 * same settings, and is dropped with the snapshot. Repeated clicks on Generate then cost nothing.
 */
const planCache = new WeakMap<object, WeakMap<object, Map<string, unknown>>>();
const PLAN_CACHE_PER_SNAPSHOT = 50;
function cachedPlan<T>(map: object, gws: object, key: string, compute: () => T): T {
  let byGateways = planCache.get(map);
  if (!byGateways) planCache.set(map, (byGateways = new WeakMap()));
  let plans = byGateways.get(gws);
  if (!plans) byGateways.set(gws, (plans = new Map()));
  if (plans.has(key)) return plans.get(key) as T;
  const value = compute();
  if (plans.size >= PLAN_CACHE_PER_SNAPSHOT) plans.delete(plans.keys().next().value!);
  plans.set(key, value);
  return value;
}

/**
 * What a run on some sites must know about the client's WHOLE network, or it would misjudge gateways at the edge of the
 * selection: whether a gateway is working is decided from every meter it hears (on the selected sites alone a gateway
 * that serves the next site looks silent), and how many meters of sites outside the selection each gateway serves (such
 * a gateway must not be moved or removed by a plan that cannot see those meters). Both lists are cached by networkService.
 */
async function wholeNetwork(scope: SiteScope): Promise<{ working: Map<string, boolean>; servesOutside: Map<string, number> }> {
  const all = resolveSiteScope('ALL') ?? null;
  const [allMap, allGateways] = await Promise.all([getMeterMap(all), getGateways(all)]);
  const isWorking = (status: string) => status === 'reporting' || status === 'degraded'; // degraded still carries traffic
  const working = new Map<string, boolean>();
  for (const g of [...allGateways.gateways, ...allGateways.unplaced]) working.set(g.gatewayId, isWorking(g.status));
  const servesOutside = new Map<string, number>();
  if (scope) {
    const inScope = new Set(scope);
    for (const r of allMap.rows) {
      if (r[5] < 0 || (r[8] >= 0 && inScope.has(r[8]))) continue;
      const id = allMap.gatewayIds[r[5]];
      servesOutside.set(id, (servesOutside.get(id) ?? 0) + 1);
    }
  }
  return { working, servesOutside };
}

/** What a plan read from wholeNetwork for these gateways, as text: part of the plan-cache key, so a plan never outlives it. */
const wholeKey = (gateways: ReadonlyArray<{ gatewayId: string }>, whole: Awaited<ReturnType<typeof wholeNetwork>>) =>
  gateways.map((g) => `${g.gatewayId}:${whole.working.get(g.gatewayId) ? 1 : 0}:${whole.servesOutside.get(g.gatewayId) ?? 0}`).join(',');

// The limits Gateway Placement accepts (the page offers the same ones).
const MIN_GATEWAYS = 1;
const MAX_GATEWAYS = 25;
const MIN_RADIUS_M = 100;
const MAX_RADIUS_M = 5000;
const MIN_TARGET_PERCENT = 50;
const MAX_MIN_NEW_METERS = 100_000;
const EXISTING_MODES: ExistingMode[] = ['all', 'working', 'none'];

/**
 * POST /api/gis/gateway-placement/compute
 * body: { siteId: 'ALL' | id | 'a,b', gatewayCount (the most new gateways allowed), coverageRadiusM,
 *         minNewMeters?: number | null (null = automatic), targetCoveragePercent?: 50..100, existingMode?: all | working | none }
 *
 * Where to put new gateways (services/gatewayPlacement.ts), for the chosen sites and every site below them. The meters
 * and existing gateways are exactly the ones the Network Explorer and this page's map draw (services/networkService.ts),
 * so the counts agree. gatewayCount is a maximum: fewer gateways come back when fewer are worth building, and
 * `stopReason` says why it stopped.
 */
router.post('/gateway-placement/compute', async (req, res) => {
  try {
    const siteId = String(req.body.siteId ?? 'ALL');
    const scope = resolveSiteScope(siteId);
    if (scope === undefined) return res.status(404).json({ error: 'Unknown site' });

    const gatewayCount = Number(req.body.gatewayCount ?? 5);
    const coverageRadiusM = Number(req.body.coverageRadiusM ?? 500);
    const minNewRaw = req.body.minNewMeters;
    const minNewMeters = minNewRaw == null || minNewRaw === '' ? null : Number(minNewRaw);
    const targetCoveragePercent = Number(req.body.targetCoveragePercent ?? 100);
    const existingMode = (req.body.existingMode ?? 'all') as ExistingMode;

    if (!Number.isInteger(gatewayCount) || gatewayCount < MIN_GATEWAYS || gatewayCount > MAX_GATEWAYS) {
      return res.status(400).json({ error: `gatewayCount must be a whole number from ${MIN_GATEWAYS} to ${MAX_GATEWAYS}` });
    }
    if (!Number.isFinite(coverageRadiusM) || coverageRadiusM < MIN_RADIUS_M || coverageRadiusM > MAX_RADIUS_M) {
      return res.status(400).json({ error: `coverageRadiusM must be from ${MIN_RADIUS_M} to ${MAX_RADIUS_M} metres` });
    }
    if (minNewMeters !== null && (!Number.isInteger(minNewMeters) || minNewMeters < 1 || minNewMeters > MAX_MIN_NEW_METERS)) {
      return res.status(400).json({ error: `minNewMeters must be empty (automatic) or a whole number from 1 to ${MAX_MIN_NEW_METERS}` });
    }
    if (!Number.isFinite(targetCoveragePercent) || targetCoveragePercent < MIN_TARGET_PERCENT || targetCoveragePercent > 100) {
      return res.status(400).json({ error: `targetCoveragePercent must be from ${MIN_TARGET_PERCENT} to 100` });
    }
    if (!EXISTING_MODES.includes(existingMode)) {
      return res.status(400).json({ error: `existingMode must be one of ${EXISTING_MODES.join(', ')}` });
    }

    const [map, gws, whole] = await Promise.all([getMeterMap(scope), getGateways(scope), wholeNetwork(scope)]);
    const started = performance.now();
    const planKey = JSON.stringify(['add', gatewayCount, coverageRadiusM, minNewMeters, targetCoveragePercent, existingMode, wholeKey(gws.gateways, whole)]);
    const plan = cachedPlan(map, gws, planKey, () => planGateways({
      meters: map.rows.map((r) => ({ id: r[0], lat: r[2], lng: r[3] })),
      // working: judged from every meter it hears across the client's network, not only the selected sites
      existing: gws.gateways.map((g) => ({ id: g.gatewayId, lat: g.lat, lng: g.lng, working: whole.working.get(g.gatewayId) ?? false })),
      maxGateways: gatewayCount,
      radiusM: coverageRadiusM,
      minNewMeters,
      targetCoveragePercent,
      existingMode,
    }));
    const computeMs = Math.round(performance.now() - started);
    const share = (n: number) => (plan.metersConsidered > 0 ? Math.round((n / plan.metersConsidered) * 1000) / 10 : 0);

    res.json({
      siteId,
      gatewayCount,
      coverageRadiusM,
      existingMode,
      // meters: the ones with a usable position are planned for; the others are counted so the page can say so
      metersInSelection: map.summary.total,
      totalMeters: plan.metersConsidered,
      excludedMeterCount: map.summary.withoutCoordinates + plan.invalidMeters,
      excludedAssetIds: [],
      coordinatesStatus: map.coordinates.status,
      coveredByExisting: plan.coveredByExisting,
      newlyCovered: plan.newlyCovered,
      totalMetersCovered: plan.totalCovered,
      uncovered: plan.uncovered,
      coverageBeforePercent: plan.coverageBeforePercent,
      overallCoveragePercent: plan.coverageAfterPercent,
      // why it stopped, and what more gateways would bring
      stopReason: plan.stopReason,
      nextGain: plan.nextGain,
      minNewMetersUsed: plan.minNewMetersUsed,
      targetCoveragePercent: plan.targetCoveragePercent,
      curve: plan.curve,
      curveComplete: plan.curveComplete,
      gatewaysFor: plan.gatewaysFor,
      existingGatewaysCount: gws.gateways.length,
      existingCounted: plan.existingCounted,
      unplacedGatewaysCount: gws.unplaced.length,
      gateways: plan.gateways.map((g) => ({
        gatewayNumber: g.rank,
        latitude: g.lat,
        longitude: g.lng,
        metersAssigned: g.inRange,
        metersCoveredCount: g.newlyCovered,
        percentCovered: share(g.newlyCovered),
        addedInOrder: g.addedInOrder,
        onlyThisOne: g.onlyThisOne,
        avgDistanceM: g.avgDistanceM,
        maxDistanceM: g.maxDistanceM,
        coverageRadiusM,
        nearestExistingId: g.nearestExisting?.id ?? null,
        nearestExistingName: g.nearestExisting?.id ?? null,
        nearestExistingDistanceM: g.nearestExisting?.distanceM ?? null,
        assignedAssetIds: [],
      })),
      computeMs,
    });
  } catch (err: any) {
    console.error('[gis] Error computing gateway placement:', err.message);
    res.status(500).json({ error: 'Failed to compute gateway placement' });
  }
});

const MAX_MOVES = 100;
const MAX_LOCKED = 1000;
const MAX_MOVE_DISTANCE_M = 100_000;
const GATEWAY_ID = /^[0-9a-f]{16}$/i;

/**
 * POST /api/gis/gateway-placement/relocate
 * body: { siteId: 'ALL' | id | 'a,b', coverageRadiusM, maxMoves?: number | null (null = no limit),
 *         minGain?: number | null (null = automatic), maxMoveDistanceM?: number | null (null = no limit),
 *         allowRemove?: boolean (default true),
 *         existingMode?: 'all' | 'working' (default 'working'), lockedGatewayIds?: string[] }
 *
 * Which existing gateways to keep, move or remove (services/gatewayRelocation.ts), for the chosen sites and every site
 * below them. The number of gateways never grows. A gateway that stands in a site outside the selection, or that also
 * serves meters of such a site, is never proposed for a move or removal: it is locked (lockedReason 'other-site' /
 * 'serves-other-sites'), and still counted as reaching the meters around it.
 */
router.post('/gateway-placement/relocate', async (req, res) => {
  try {
    const siteId = String(req.body.siteId ?? 'ALL');
    const scope = resolveSiteScope(siteId);
    if (scope === undefined) return res.status(404).json({ error: 'Unknown site' });

    const coverageRadiusM = Number(req.body.coverageRadiusM ?? 500);
    const maxMovesRaw = req.body.maxMoves;
    const maxMoves = maxMovesRaw == null || maxMovesRaw === '' ? null : Number(maxMovesRaw);
    const minGainRaw = req.body.minGain;
    const minGain = minGainRaw == null || minGainRaw === '' ? null : Number(minGainRaw);
    const maxDistRaw = req.body.maxMoveDistanceM;
    const maxMoveDistanceM = maxDistRaw == null || maxDistRaw === '' ? null : Number(maxDistRaw);
    const allowRemove = req.body.allowRemove == null ? true : req.body.allowRemove === true;
    const existingMode = String(req.body.existingMode ?? 'working');
    const lockedRaw = req.body.lockedGatewayIds ?? [];

    if (!Number.isFinite(coverageRadiusM) || coverageRadiusM < MIN_RADIUS_M || coverageRadiusM > MAX_RADIUS_M) {
      return res.status(400).json({ error: `coverageRadiusM must be from ${MIN_RADIUS_M} to ${MAX_RADIUS_M} metres` });
    }
    if (maxMoves !== null && (!Number.isInteger(maxMoves) || maxMoves < 0 || maxMoves > MAX_MOVES)) {
      return res.status(400).json({ error: `maxMoves must be empty (no limit) or a whole number from 0 to ${MAX_MOVES}` });
    }
    if (minGain !== null && (!Number.isInteger(minGain) || minGain < 1 || minGain > MAX_MIN_NEW_METERS)) {
      return res.status(400).json({ error: `minGain must be empty (automatic) or a whole number from 1 to ${MAX_MIN_NEW_METERS}` });
    }
    if (maxMoveDistanceM !== null && (!Number.isFinite(maxMoveDistanceM) || maxMoveDistanceM < 0 || maxMoveDistanceM > MAX_MOVE_DISTANCE_M)) {
      return res.status(400).json({ error: `maxMoveDistanceM must be empty (no limit) or from 0 to ${MAX_MOVE_DISTANCE_M} metres` });
    }
    if (req.body.allowRemove != null && typeof req.body.allowRemove !== 'boolean') {
      return res.status(400).json({ error: 'allowRemove must be true or false' });
    }
    if (existingMode !== 'all' && existingMode !== 'working') {
      return res.status(400).json({ error: "existingMode must be 'all' or 'working'" });
    }
    if (!Array.isArray(lockedRaw) || lockedRaw.length > MAX_LOCKED || lockedRaw.some((g) => typeof g !== 'string' || !GATEWAY_ID.test(g))) {
      return res.status(400).json({ error: `lockedGatewayIds must be a list of at most ${MAX_LOCKED} 16-character gateway ids` });
    }
    const lockedByUser = new Set<string>(lockedRaw.map((g: string) => g.toLowerCase()));

    const [map, gws, whole] = await Promise.all([getMeterMap(scope), getGateways(scope), wholeNetwork(scope)]);
    const inScope = scope ? new Set(scope) : null;
    // why a gateway may not be touched by this run (null: it may)
    const lockReason = (g: { gatewayId: string; siteId: number | null }): 'you' | 'other-site' | 'serves-other-sites' | null => {
      if (lockedByUser.has(g.gatewayId)) return 'you';
      if (inScope && g.siteId !== null && !inScope.has(g.siteId)) return 'other-site';
      if ((whole.servesOutside.get(g.gatewayId) ?? 0) > 0) return 'serves-other-sites';
      return null;
    };
    const reasons = new Map(gws.gateways.map((g) => [g.gatewayId, lockReason(g)]));
    const started = performance.now();
    const planKey = JSON.stringify(['move', coverageRadiusM, maxMoves, minGain, maxMoveDistanceM, allowRemove, existingMode, [...lockedByUser].sort(), wholeKey(gws.gateways, whole)]);
    const plan = cachedPlan(map, gws, planKey, () => planRelocation({
      meters: map.rows.map((r) => ({ id: r[0], lat: r[2], lng: r[3] })),
      existing: gws.gateways.map((g) => ({
        id: g.gatewayId,
        lat: g.lat,
        lng: g.lng,
        // working: judged from every meter it hears across the client's network, not only the selected sites
        working: whole.working.get(g.gatewayId) ?? false,
        locked: reasons.get(g.gatewayId) != null,
      })),
      radiusM: coverageRadiusM,
      maxMoves,
      minGain,
      maxMoveDistanceM,
      allowRemove,
      existingMode,
    }));
    const computeMs = Math.round(performance.now() - started);
    const bySite = new Map(gws.gateways.map((g) => [g.gatewayId, g]));

    res.json({
      siteId,
      coverageRadiusM,
      existingMode,
      metersInSelection: map.summary.total,
      totalMeters: plan.metersConsidered,
      excludedMeterCount: map.summary.withoutCoordinates + plan.invalidMeters,
      coordinatesStatus: map.coordinates.status,
      coveredBefore: plan.coveredBefore,
      coveredAfter: plan.coveredAfter,
      coverageBeforePercent: plan.coverageBeforePercent,
      coverageAfterPercent: plan.coverageAfterPercent,
      uncovered: plan.uncovered,
      existingCounted: plan.existingCounted,
      movable: plan.movable,
      locked: plan.locked,
      moves: plan.moves,
      removals: plan.removals,
      removalLoss: plan.removalLoss,
      minGainUsed: plan.minGainUsed,
      stopReason: plan.stopReason,
      nextNet: plan.nextNet,
      steps: plan.steps,
      unplacedGatewaysCount: gws.unplaced.length,
      items: plan.items.map((i) => {
        const g = bySite.get(i.id);
        return {
          ...i,
          siteId: g?.siteId ?? null,
          lockedReason: i.verdict !== 'locked' ? null : reasons.get(i.id) ?? null,
        };
      }),
      computeMs,
    });
  } catch (err: any) {
    console.error('[gis] Error computing gateway relocation:', err.message);
    res.status(500).json({ error: 'Failed to compute gateway relocation' });
  }
});

export default router;


