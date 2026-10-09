import { Router } from 'express';
import { pool } from '../db/pool.js';
import { config } from '../config/env.js';
import { proxyUpstream } from '../services/upstreamProxy.js';
import {
  getPostgresAggregatedSummary,
  getGatewayMeters,
  getGatewayRadioHealth,
  getGatewayHourly,
  localDateIn,
  safeZone,
  searchMeters,
  toFrameItem,
  DateWindow,
  MeterFilter,
} from '../services/telemetryDbService.js';
import { resolveSiteScope, resolveViewTimeZone, SessionExpiredError } from '../services/dashboardService.js';
import { badRequest, pageParams, validId } from './validation.js';
import {
  getFleetFrames,
  getGatewayFrames,
  getMeterDetail,
  getMeterFrames,
  getRadioHealth,
  getTraffic,
  listFleetMeters,
  type MeterStatusFilter,
} from '../services/commandCenterDeep.js';

const router = Router();

const MAX_CUSTOM_DAYS = 92;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD (days at the site, inclusive) picks a custom window. Returns undefined when neither is
 * sent, null when they are sent but not usable (bad format, from after to, longer than MAX_CUSTOM_DAYS, later than today
 * at the site).
 */
function customWindow(query: any, zone: string): DateWindow | undefined | null {
  const from = query.from as string | undefined;
  const to = query.to as string | undefined;
  if (!from && !to) return undefined;
  if (!from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to)) return null;
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || fromMs > toMs) return null;
  if (to > localDateIn(zone) || (toMs - fromMs) / 86400000 + 1 > MAX_CUSTOM_DAYS) return null;
  return { fromDate: from, toDate: to };
}

// ---------- Live Telemetry Aggregator (PostgreSQL 7-Day Default & Sub-second Feed) ----------

router.get('/summary', async (req, res) => {
  try {
    const days = parseInt((req.query.days as string) || '7', 10);
    const date = req.query.date as string | undefined; // only for looking back from an earlier day; default: today at the site
    const refresh = req.query.refresh === 'true';
    const siteId = (req.query.siteId as string) || (req.query.siteIds as string) || 'ALL';

    const siteIds = await resolveSiteScope(siteId, req.headers.authorization);
    if (siteIds && siteIds.length === 0) return res.status(403).json({ error: 'No access to this site' });
    // the days of the view are the days at the site(s) it covers
    const zone = await resolveViewTimeZone(siteIds);

    const custom = customWindow(req.query, zone);
    if (custom === null) {
      return res.status(400).json({ error: `from/to must be YYYY-MM-DD, from <= to, not in the future, at most ${MAX_CUSTOM_DAYS} days` });
    }

    const pgSummary = await getPostgresAggregatedSummary(days, date, refresh, siteId, custom, siteIds, zone);
    return res.json(pgSummary);
  } catch (err: any) {
    if (err instanceof SessionExpiredError) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    console.error('[commandCenter] Error generating telemetry summary:', err);
    res.status(500).json({ error: 'Failed to aggregate telemetry', message: err.message });
  }
});

const METER_FILTERS: MeterFilter[] = ['ALL', 'LIVE', 'STALE', 'WEAK_RSSI', 'POOR_SNR', 'MULTI_GW'];

function intParam(value: unknown, fallback: number, min: number, max: number): number {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

// One page of the meters a gateway heard (the Meters table of the selected gateway).
router.get('/gateways/:gatewayId/meters', async (req, res) => {
  try {
    if (!validId(req.params.gatewayId)) return badRequest(res, 'gateway id');
    const siteIds = await resolveSiteScope(req.query.siteId as string | undefined, req.headers.authorization);
    if (siteIds && siteIds.length === 0) return res.status(403).json({ error: 'No access to this site' });
    const zone = await resolveViewTimeZone(siteIds);
    const custom = customWindow(req.query, zone);
    if (custom === null) return res.status(400).json({ error: 'Invalid from/to date range' });
    const filter = String(req.query.filter || 'ALL').toUpperCase() as MeterFilter;
    const result = await getGatewayMeters({
      custom,
      siteIds,
      zone,
      gatewayId: req.params.gatewayId,
      days: intParam(req.query.days, 7, 1, 90),
      page: intParam(req.query.page, 0, 0, 100000),
      size: intParam(req.query.size, 100, 1, 200),
      filter: METER_FILTERS.includes(filter) ? filter : 'ALL',
      q: req.query.q as string | undefined,
    });
    res.json(result);
  } catch (err: any) {
    if (err instanceof SessionExpiredError) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    console.error('[commandCenter] Error getting gateway meters:', err);
    res.status(500).json({ error: 'Failed to get gateway meters', message: err.message });
  }
});

// The window and site filter shared by the per-gateway endpoints; answers the request itself when they are not usable.
async function gatewayScope(req: any, res: any) {
  if (!validId(req.params.gatewayId)) {
    badRequest(res, 'gateway id');
    return null;
  }
  const siteIds = await resolveSiteScope(req.query.siteId as string | undefined, req.headers.authorization);
  if (siteIds && siteIds.length === 0) {
    res.status(403).json({ error: 'No access to this site' });
    return null;
  }
  const zone = await resolveViewTimeZone(siteIds);
  const custom = customWindow(req.query, zone);
  if (custom === null) {
    res.status(400).json({ error: 'Invalid from/to date range' });
    return null;
  }
  return {
    gatewayId: req.params.gatewayId as string,
    days: intParam(req.query.days, 7, 1, 90),
    custom,
    siteIds,
    zone,
  };
}

router.get('/gateways/:gatewayId/radio-health', async (req, res) => {
  try {
    const scope = await gatewayScope(req, res);
    if (scope) res.json(await getGatewayRadioHealth(scope));
  } catch (err: any) {
    if (err instanceof SessionExpiredError) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    console.error('[commandCenter] Error getting radio health:', err);
    res.status(500).json({ error: 'Failed to get radio health', message: err.message });
  }
});

router.get('/gateways/:gatewayId/hourly', async (req, res) => {
  try {
    const scope = await gatewayScope(req, res);
    if (scope) res.json(await getGatewayHourly(scope));
  } catch (err: any) {
    if (err instanceof SessionExpiredError) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    console.error('[commandCenter] Error getting hourly activity:', err);
    res.status(500).json({ error: 'Failed to get hourly activity', message: err.message });
  }
});

// Find a meter by id or DevEUI (search box, and a click on a frame in the live feed).
router.get('/meters/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) return res.json([]);
    const siteIds = await resolveSiteScope(req.query.siteId as string | undefined, req.headers.authorization);
    if (siteIds && siteIds.length === 0) return res.status(403).json({ error: 'No access to this site' });
    const zone = await resolveViewTimeZone(siteIds);
    const custom = customWindow(req.query, zone);
    if (custom === null) return res.status(400).json({ error: 'Invalid from/to date range' });
    res.json(
      await searchMeters(q, intParam(req.query.days, 7, 1, 90), intParam(req.query.limit, 10, 1, 50), undefined, custom, siteIds, zone)
    );
  } catch (err: any) {
    if (err instanceof SessionExpiredError) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    console.error('[commandCenter] Error searching meters:', err);
    res.status(500).json({ error: 'Failed to search meters', message: err.message });
  }
});

// ---------- Deeper views: frames, fleet meters, one meter, traffic over time, radio analysis ----------

// The window and site filter shared by the endpoints that are not tied to one gateway; answers the request itself when
// they are not usable.
async function viewScope(req: any, res: any) {
  const siteIds = await resolveSiteScope(req.query.siteId as string | undefined, req.headers.authorization);
  if (siteIds && siteIds.length === 0) {
    res.status(403).json({ error: 'No access to this site' });
    return null;
  }
  const zone = await resolveViewTimeZone(siteIds);
  const custom = customWindow(req.query, zone);
  if (custom === null) {
    res.status(400).json({ error: 'Invalid from/to date range' });
    return null;
  }
  return { days: intParam(req.query.days, 7, 1, 90), custom, siteIds, zone };
}

function failed(res: any, what: string, err: any) {
  if (err instanceof SessionExpiredError) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  console.error(`[commandCenter] Error ${what}:`, err);
  return res.status(500).json({ error: `Failed ${what}` });
}

// Newest frames one gateway took, paginated.
router.get('/gateways/:gatewayId/frames', async (req, res) => {
  try {
    const scope = await gatewayScope(req, res);
    if (!scope) return;
    res.json(await getGatewayFrames({ ...scope, ...pageParams(req.query, 100) }));
  } catch (err: any) {
    failed(res, 'loading gateway frames', err);
  }
});

// Newest frames across the fleet or one site, paginated ("Load more" in the live feed).
router.get('/frames', async (req, res) => {
  try {
    const scope = await viewScope(req, res);
    if (!scope) return;
    res.json(await getFleetFrames({ ...scope, ...pageParams(req.query, 100) }));
  } catch (err: any) {
    failed(res, 'loading frames', err);
  }
});

// The Meters view: every meter's latest frame, searched, filtered and paginated on the server.
router.get('/meters', async (req, res) => {
  try {
    const scope = await viewScope(req, res);
    if (!scope) return;
    const status = ['live', 'stale', 'silent'].includes(req.query.status as string) ? (req.query.status as MeterStatusFilter) : undefined;
    const intOrUndef = (v: unknown) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));
    const confirmed = req.query.confirmed === 'true' ? true : req.query.confirmed === 'false' ? false : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 64) : undefined;
    res.json(
      await listFleetMeters({
        ...scope,
        q,
        status,
        dr: intOrUndef(req.query.dr),
        frequency: intOrUndef(req.query.frequency),
        confirmed,
        ...pageParams(req.query, 100),
      })
    );
  } catch (err: any) {
    failed(res, 'listing meters', err);
  }
});

// One meter by exact Meter ID or DevEUI: what "open this meter" uses (search is substring based and capped).
router.get('/meters/:meterId', async (req, res) => {
  const meterId = validId(req.params.meterId);
  if (!meterId) return badRequest(res, 'meter id');
  try {
    const scope = await viewScope(req, res);
    if (!scope) return;
    const found = await getMeterDetail({ ...scope, idOrEui: meterId });
    if (!found) return res.status(404).json({ error: 'Meter not found in this window' });
    res.json(found);
  } catch (err: any) {
    failed(res, 'loading the meter', err);
  }
});

router.get('/meters/:meterId/frames', async (req, res) => {
  const meterId = validId(req.params.meterId);
  if (!meterId) return badRequest(res, 'meter id');
  try {
    const scope = await viewScope(req, res);
    if (!scope) return;
    res.json(await getMeterFrames({ ...scope, meterId, ...pageParams(req.query, 20) }));
  } catch (err: any) {
    failed(res, 'loading meter frames', err);
  }
});

// Traffic over time (frames and distinct meters per bucket) with the equal period before it.
router.get('/traffic', async (req, res) => {
  try {
    const scope = await viewScope(req, res);
    if (!scope) return;
    const gatewayId = req.query.gatewayId === undefined ? undefined : validId(req.query.gatewayId);
    if (gatewayId === null) return badRequest(res, 'gateway id');
    res.json(await getTraffic({ ...scope, gatewayId }));
  } catch (err: any) {
    failed(res, 'loading traffic', err);
  }
});

// Radio analysis: RSSI / SNR distributions, data rate, frequency, weakest and strongest meters.
router.get('/radio', async (req, res) => {
  try {
    const scope = await viewScope(req, res);
    if (!scope) return;
    const gatewayId = req.query.gatewayId === undefined ? undefined : validId(req.query.gatewayId);
    if (gatewayId === null) return badRequest(res, 'gateway id');
    res.json(await getRadioHealth({ ...scope, gatewayId }));
  } catch (err: any) {
    failed(res, 'loading radio health', err);
  }
});

router.get('/feed', async (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || '100', 10);
    const zone = safeZone(await resolveViewTimeZone(null));
    const result = await pool.query(
      `SELECT *, to_char(decoded_at AT TIME ZONE '${zone}', 'YYYY-MM-DD HH24:MI:SS') AS local_time
       FROM water_meter_readings_v2 WHERE is_history = false ORDER BY decoded_at DESC LIMIT $1`,
      [limit]
    );
    res.json(result.rows.map((r: any, idx: number) => toFrameItem(r, `feed-${idx}-${r.meter_id}-${new Date(r.time).getTime()}`)));
  } catch (err: any) {
    if (err instanceof SessionExpiredError) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    console.error('[commandCenter] Error getting live feed:', err);
    res.status(500).json({ error: 'Failed to get live feed', message: err.message });
  }
});

// ---------- Dashboard ----------

router.get('/water-summary', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    return res.json({
      'Total Households':  { value: '193125', lastUpdated: '2026-09-04T18:00:00Z' },
      'Active Meters':     { value: '2532',   lastUpdated: '2026-09-04T18:00:00Z' },
      'Water Consumption': { value: '2338.92', lastUpdated: '2026-09-04T18:00:00Z' },
      'Average Consumption': { value: '0.9', lastUpdated: '2026-09-04T18:00:00Z' },
    });
  }
  const { fromDate, toDate, siteIds } = req.query as Record<string, string>;
  const upstream = await proxyUpstream('POST', '/api/module/water-summary', {
    body: {
      propertyNameList: ['Total Households', 'Active Meters', 'Water Consumption', 'Average Consumption'],
      startDate: `${fromDate}T00:00:00.000+05:30`,
      endDate: `${toDate}T23:59:59.999+05:30`,
    },
    headers: { Authorization: req.headers.authorization ?? '' },
  });
  res.status(upstream.status).json(upstream.data);
});

router.get('/executive-summary', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    return res.json({
      householdsOnboarded: 193125, metersConfigured: 27996, householdsMapped: 18364,
      meterReplacementsYesterday: 3, criticalAlerts: 2, openMaintenanceRequests: 5,
      closedMaintenanceRequests: 12, topAlertTypes: ['Reverse Flow'],
      region: 'BHUBANESWAR', fromDate: '2026-09-01', toDate: '2026-09-04',
    });
  }
  // Upstream uses toDate, not endDate (spec 28.1)
  const { fromDate, toDate } = req.query as Record<string, string>;
  const upstream = await proxyUpstream('POST', `/api/water/executive-summary?fromDate=${fromDate}&toDate=${toDate}`, {
    body: { page: 0, size: 10 },
    headers: { Authorization: req.headers.authorization ?? '' },
  });
  res.status(upstream.status).json(upstream.data);
});

// ---------- Command Center ----------

router.get('/gateway-summary', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    const result = await pool.query(
      'SELECT gateway_id, alias, meters_observed, linked_meters, avg_rssi, avg_snr, latest_decoded_at FROM gateways ORDER BY meters_observed DESC',
    );
    const rows = result.rows;
    return res.json({
      totalUniqueMeters: rows.reduce((s: number, r: any) => s + r.meters_observed, 0),
      gatewayCount: rows.length,
      metersOnMultipleGateways: 0,
      perGateway: rows.map((r: any) => ({ gatewayId: r.gateway_id, uniqueMeterCount: r.meters_observed, alias: r.alias, avgRssi: r.avg_rssi, avgSnr: r.avg_snr, latestDecodedAt: r.latest_decoded_at })),
    });
  }
  // Upstream: siteIds is comma-joined for this endpoint (spec 28.2)
  const { fromDate, toDate, siteIds } = req.query as Record<string, string>;
  const upstream = await proxyUpstream('GET', '/api/water/gateway-meter-summary', {
    query: { siteIds: siteIds ?? '', fromDate, toDate },
    headers: { Authorization: req.headers.authorization ?? '' },
  });
  res.status(upstream.status).json(upstream.data);
});

router.get('/meter-health', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    const result = await pool.query(
      'SELECT meter_id, household_id, gateway_id, decoded_at, rssi FROM meters ORDER BY decoded_at DESC',
    );
    return res.json(result.rows.map((r: any) => ({
      assetId: 0, meterId: r.meter_id, householdId: r.household_id,
      gatewayId: r.gateway_id, decodedAt: r.decoded_at, rssi: r.rssi,
      lastSeenDate: r.decoded_at, timeZone: 'Asia/Kolkata',
    })));
  }
  // Upstream: siteIds as repeated query params (spec 28.2)
  const siteIds = (req.query.siteIds as string)?.split(',') ?? [];
  const upstream = await proxyUpstream('GET', '/api/water/meter-health', {
    query: { siteIds },
    headers: { Authorization: req.headers.authorization ?? '' },
  });
  res.status(upstream.status).json(upstream.data);
});

router.get('/gateway-performance', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    const result = await pool.query('SELECT gateway_id, latest_decoded_at, meters_observed FROM gateways');
    return res.json(result.rows.map((r: any) => ({
      gatewayId: r.gateway_id, date: '2026-09-04', activeMeterCount: r.meters_observed,
    })));
  }
  const { fromDate, toDate, siteIds } = req.query as Record<string, string>;
  const upstream = await proxyUpstream('GET', '/api/water/gateway-performance', {
    query: { siteIds: (siteIds ?? '').split(','), fromDate, toDate },
    headers: { Authorization: req.headers.authorization ?? '' },
  });
  res.status(upstream.status).json(upstream.data);
});

router.post('/latest-meter-status', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    const { page = 0, size = 20 } = req.body ?? {};
    const result = await pool.query(
      'SELECT * FROM meters ORDER BY decoded_at DESC LIMIT $1 OFFSET $2',
      [size, page * size],
    );
    const countResult = await pool.query('SELECT COUNT(*) FROM meters');
    const total = parseInt(countResult.rows[0].count, 10);
    return res.json({
      content: result.rows.map((r: any) => ({
        meterId: r.meter_id, householdId: r.household_id, gatewayId: r.gateway_id,
        currentReading: r.forward_flow_l, rssi: r.rssi,
        snr: r.snr, checksumStatus: r.checksum_status,
        decodedAt: r.decoded_at, meterTimestamp: r.meter_timestamp,
        siteId: String(r.site_id), siteName: 'BHUBANESWAR',
      })),
      totalElements: total, totalPages: Math.ceil(total / size),
      size, number: page, first: page === 0, last: (page + 1) * size >= total, empty: total === 0,
      numberOfElements: result.rows.length,
    });
  }
  const upstream = await proxyUpstream('POST', '/api/water/latest-meter-status/page', {
    body: req.body,
    headers: { Authorization: req.headers.authorization ?? '' },
  });
  res.status(upstream.status).json(upstream.data);
});

router.post('/raw-telemetry', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    const { cursor, size = 20 } = req.body ?? {};
    const result = await pool.query(
      'SELECT * FROM meters ORDER BY decoded_at DESC LIMIT $1',
      [size],
    );
    return res.json({
      content: result.rows.map((r: any) => ({
        meterId: r.meter_id, householdId: r.household_id, gatewayId: r.gateway_id,
        forwardFlowL: r.forward_flow_l, rssi: r.rssi, snr: r.snr,
        decodedAt: r.decoded_at, meterTimestamp: r.meter_timestamp,
      })),
      nextCursor: null, hasMore: false, estimatedTotal: result.rows.length,
    });
  }
  // Upstream uses endDate, not toDate (spec 28.1)
  const { fromDate, toDate } = req.body ?? {};
  const upstream = await proxyUpstream('POST', `/api/water/raw-data/cursor?fromDate=${fromDate}&endDate=${toDate}&rawReport=true`, {
    body: { cursor: req.body.cursor, size: req.body.size },
    headers: { Authorization: req.headers.authorization ?? '' },
  });
  res.status(upstream.status).json(upstream.data);
});

export default router;
