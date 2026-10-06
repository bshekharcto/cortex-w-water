import { Router } from 'express';
import { pool, retryTransient } from '../db/pool.js';
import {
  getPostgresAggregatedSummary,
  getGatewayMeters,
  searchMeters,
  listFleetMeters,
  getGatewayFrames,
  getMeterFrames,
  getFleetFrames,
  getTraffic,
  getRadioHealth,
  startManualRefresh,
  isRefreshing,
} from '../services/telemetryDbService.js';
import { getRoots } from '../services/siteTree.js';
import { syncLatestTelemetry } from '../services/telemetrySyncWorker.js';
import { validId, validSite, windowOr400, pageParams, badRequest } from './validation.js';

const router = Router();

// ---------- Telemetry Sync & Cron Job ----------

router.all('/sync-cron', async (req, res) => {
  try {
    // Optional Vercel CRON_SECRET authorization check
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized: invalid CRON_SECRET' });
      }
    }

    const customDate = req.query.date as string | undefined;
    const customDates = customDate ? [customDate] : undefined;

    console.log('[commandCenter] Cron/Manual sync triggered:', {
      ip: req.ip,
      method: req.method,
      customDate,
    });

    const result = await syncLatestTelemetry(customDates);
    return res.json({
      status: result.success ? 'success' : 'error',
      ...result,
    });
  } catch (err: any) {
    console.error('[commandCenter] Cron sync failed:', err);
    return res.status(500).json({ error: 'Sync failed', message: err.message });
  }
});


// ---------- Live telemetry (PostgreSQL) ----------

router.get('/summary', async (req, res) => {
  const win = windowOr400(req, res);
  if (!win) return;
  const siteId = validSite(req.query.siteId ?? req.query.siteIds);
  if (!siteId) return badRequest(res, 'site');
  try {
    // Manual Refresh answers instantly from stored data and pulls fresh packets in the background;
    // the page keeps polling while `refreshing` is true.
    if (req.query.refresh === 'true') startManualRefresh(win, siteId);
    const summary = await retryTransient(() => getPostgresAggregatedSummary(win, false, siteId));
    res.json({ ...summary, refreshing: isRefreshing() });
  } catch (err: any) {
    // No silent fallback to a different data source: an honest error beats plausible-looking wrong data.
    console.error('[commandCenter] Error generating telemetry summary:', err);
    res.status(503).json({ error: 'Telemetry summary unavailable', message: err.message });
  }
});

// Live top-level sites from the real site hierarchy (same source as the Dashboard),
// so newly added sites appear without a code or DB change.
router.get('/sites', async (req, res) => {
  try {
    const roots = await getRoots(req.headers.authorization);
    let sites = roots.map((r) => ({ id: String(r.id), name: r.name }));
    if (sites.length === 0) {
      const local = await pool.query('SELECT id, name FROM sites ORDER BY name');
      sites = local.rows.map((r: { id: number; name: string }) => ({ id: String(r.id), name: r.name }));
    }
    sites.sort((a, b) => a.name.localeCompare(b.name));
    res.json([{ id: 'ALL', name: 'All Sites' }, ...sites]);
  } catch (err: any) {
    console.error('[commandCenter] Error loading sites:', err);
    res.status(500).json({ error: 'Failed to load sites', message: err.message });
  }
});

router.get('/gateways/:gatewayId/meters', async (req, res) => {
  const win = windowOr400(req, res);
  if (!win) return;
  const gatewayId = validId(req.params.gatewayId);
  if (!gatewayId) return badRequest(res, 'gateway id');
  try {
    res.json(await retryTransient(() => getGatewayMeters(gatewayId, win)));
  } catch (err: any) {
    console.error('[commandCenter] Error loading gateway meters:', err);
    res.status(503).json({ error: 'Failed to load gateway meters', message: err.message });
  }
});

router.get('/gateways/:gatewayId/frames', async (req, res) => {
  const win = windowOr400(req, res);
  if (!win) return;
  const gatewayId = validId(req.params.gatewayId);
  if (!gatewayId) return badRequest(res, 'gateway id');
  try {
    const { limit, offset } = pageParams(req.query, 100);
    res.json(await retryTransient(() => getGatewayFrames(gatewayId, win, limit, offset)));
  } catch (err: any) {
    console.error('[commandCenter] Error loading gateway frames:', err);
    res.status(503).json({ error: 'Failed to load gateway frames', message: err.message });
  }
});

router.get('/meters', async (req, res) => {
  const win = windowOr400(req, res);
  if (!win) return;
  const siteId = validSite(req.query.siteId);
  if (!siteId) return badRequest(res, 'site');
  try {
    const status = ['live', 'stale', 'silent'].includes(req.query.status as string)
      ? (req.query.status as 'live' | 'stale' | 'silent')
      : undefined;
    const { limit, offset } = pageParams(req.query, 100);
    const intOrUndef = (v: unknown) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));
    const confirmed = req.query.confirmed === 'true' ? true : req.query.confirmed === 'false' ? false : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 64) : undefined;
    res.json(
      await retryTransient(() =>
        listFleetMeters({
          win, siteId, q, status,
          dr: intOrUndef(req.query.dr), frequency: intOrUndef(req.query.frequency), confirmed,
          limit, offset,
        })
      )
    );
  } catch (err: any) {
    console.error('[commandCenter] Error listing meters:', err);
    res.status(503).json({ error: 'Failed to list meters', message: err.message });
  }
});

router.get('/meters/search', async (req, res) => {
  const win = windowOr400(req, res);
  if (!win) return;
  try {
    const q = ((req.query.q as string) || '').trim().slice(0, 64);
    if (q.length < 3) return res.json([]);
    res.json(await retryTransient(() => searchMeters(q, win)));
  } catch (err: any) {
    console.error('[commandCenter] Error searching meters:', err);
    res.status(503).json({ error: 'Failed to search meters', message: err.message });
  }
});

router.get('/meters/:meterId/frames', async (req, res) => {
  const win = windowOr400(req, res);
  if (!win) return;
  const meterId = validId(req.params.meterId);
  if (!meterId) return badRequest(res, 'meter id');
  try {
    const { limit, offset } = pageParams(req.query, 20);
    res.json(await retryTransient(() => getMeterFrames(meterId, win, limit, offset)));
  } catch (err: any) {
    console.error('[commandCenter] Error loading meter frames:', err);
    res.status(503).json({ error: 'Failed to load meter frames', message: err.message });
  }
});

// Newest frames across the fleet (or one site), paginated: "Load more" in the live feed
router.get('/frames', async (req, res) => {
  const win = windowOr400(req, res);
  if (!win) return;
  const siteId = validSite(req.query.siteId);
  if (!siteId) return badRequest(res, 'site');
  try {
    const { limit, offset } = pageParams(req.query, 100);
    res.json(await retryTransient(() => getFleetFrames(win, siteId, limit, offset)));
  } catch (err: any) {
    console.error('[commandCenter] Error loading frames:', err);
    res.status(503).json({ error: 'Failed to load frames', message: err.message });
  }
});

// Traffic over time (frames and distinct meters per bucket) with the previous equal period
router.get('/traffic', async (req, res) => {
  const win = windowOr400(req, res);
  if (!win) return;
  const siteId = validSite(req.query.siteId);
  if (!siteId) return badRequest(res, 'site');
  const gatewayId = req.query.gatewayId === undefined ? undefined : validId(req.query.gatewayId);
  if (gatewayId === null) return badRequest(res, 'gateway id');
  try {
    res.json(await retryTransient(() => getTraffic({ win, siteId, gatewayId })));
  } catch (err: any) {
    console.error('[commandCenter] Error loading traffic:', err);
    res.status(503).json({ error: 'Failed to load traffic', message: err.message });
  }
});

// Radio analysis (RSSI/SNR distributions, DR, frequency, weakest/strongest meters)
router.get('/radio', async (req, res) => {
  const win = windowOr400(req, res);
  if (!win) return;
  const siteId = validSite(req.query.siteId);
  if (!siteId) return badRequest(res, 'site');
  const gatewayId = req.query.gatewayId === undefined ? undefined : validId(req.query.gatewayId);
  if (gatewayId === null) return badRequest(res, 'gateway id');
  try {
    res.json(await retryTransient(() => getRadioHealth({ win, siteId, gatewayId })));
  } catch (err: any) {
    console.error('[commandCenter] Error loading radio health:', err);
    res.status(503).json({ error: 'Failed to load radio health', message: err.message });
  }
});

export default router;
