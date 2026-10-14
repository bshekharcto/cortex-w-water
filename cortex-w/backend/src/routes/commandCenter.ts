import { Router } from 'express';
import { logRouteError } from '../db/pool.js';
import {
  getPostgresAggregatedSummary,
  getGatewayMeters,
  getGatewayRadioHealth,
  getGatewayHourly,
  localDateIn,
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
  // ?hours=1 or 6: today at the site, only its last 1 / 6 hours
  if (query.hours !== undefined) {
    const hours = Number(query.hours);
    if (hours !== 1 && hours !== 6) return null;
    const today = localDateIn(zone);
    return { fromDate: today, toDate: today, hours };
  }
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
    const days = intParam(req.query.days, 7, 1, 90);
    const date = req.query.date as string | undefined; // only for looking back from an earlier day; default: today at the site
    const refresh = req.query.refresh === 'true';
    const siteId = (req.query.siteId as string) || (req.query.siteIds as string) || 'ALL';

    const siteIds = await resolveSiteScope(siteId, req.headers.authorization);
    if (siteIds && siteIds.length === 0) return res.status(403).json({ error: 'No access to this site' });
    // the days of the view are the days at the site(s) it covers
    const zone = await resolveViewTimeZone(siteIds);

    const custom = customWindow(req.query, zone);
    if (custom === null) {
      return res.status(400).json({ error: `from/to must be YYYY-MM-DD (or hours 1 or 6), from <= to, not in the future, at most ${MAX_CUSTOM_DAYS} days` });
    }

    const pgSummary = await getPostgresAggregatedSummary(days, date, refresh, siteId, custom, siteIds, zone);
    return res.json(pgSummary);
  } catch (err: any) {
    if (err instanceof SessionExpiredError) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    logRouteError('[commandCenter] Error generating telemetry summary:', err);
    res.status(500).json({ error: 'Failed to aggregate telemetry' });
  }
});

const METER_FILTERS: MeterFilter[] = ['ALL', 'CONNECTED', 'DISCONNECTED'];

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
    logRouteError('[commandCenter] Error getting gateway meters:', err);
    res.status(500).json({ error: 'Failed to get gateway meters' });
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
    logRouteError('[commandCenter] Error getting radio health:', err);
    res.status(500).json({ error: 'Failed to get radio health' });
  }
});

router.get('/gateways/:gatewayId/hourly', async (req, res) => {
  try {
    const scope = await gatewayScope(req, res);
    if (scope) res.json(await getGatewayHourly(scope));
  } catch (err: any) {
    if (err instanceof SessionExpiredError) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    logRouteError('[commandCenter] Error getting hourly activity:', err);
    res.status(500).json({ error: 'Failed to get hourly activity' });
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
    logRouteError('[commandCenter] Error searching meters:', err);
    res.status(500).json({ error: 'Failed to search meters' });
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
  logRouteError(`[commandCenter] Error ${what}:`, err);
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
    const status = ['connected', 'disconnected'].includes(req.query.status as string) ? (req.query.status as MeterStatusFilter) : undefined;
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

export default router;
