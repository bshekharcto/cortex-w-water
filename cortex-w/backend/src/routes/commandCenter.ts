import { timingSafeEqual } from 'crypto';
import { Router } from 'express';
import { pool, retryTransient } from '../db/pool.js';
import {
  getPostgresAggregatedSummary,
  getGatewayMeters,
  searchMeters,
  getMeter,
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
import { refreshInventory } from '../services/assetInventory.js';
import { sessionReport } from '../services/sessionStore.js';
import { syncClients, requireClient, runWithClient, scopeSiteIds } from '../services/clientContext.js';
import { clientKey, ownedMeters } from '../services/telemetry/scope.js';

const router = Router();

// ---------- Telemetry Sync & Cron Job ----------

router.get('/sync-cron', async (req, res) => {
  try {
    // The scheduler must present CRON_SECRET; with none configured the
    // endpoint is disabled rather than open.
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return res.status(503).json({ error: 'sync-cron disabled: CRON_SECRET not configured' });
    }
    const presented = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${cronSecret}`);
    if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const customDate = typeof req.query.date === 'string' ? req.query.date : undefined;
    if (customDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
      return res.status(400).json({ error: 'Invalid date', message: 'date must be YYYY-MM-DD' });
    }
    const customDates = customDate ? [customDate] : undefined;

    console.log('[commandCenter] Cron/Manual sync triggered:', {
      ip: req.ip,
      method: req.method,
      customDate,
    });

    // The same cron tick also advances the dashboard's inventory snapshot.
    // A serverless invocation can't finish a whole refresh, so it does a
    // time-boxed chunk; the next tick resumes where this one stopped.
    // Every client with a valid (stored or live) session is refreshed, each
    // with its own token — there is no service account to run as.
    const [result, inventory] = await Promise.all([
      syncLatestTelemetry(customDates),
      syncClients().then((clients) => Promise.all(
        clients.map((client) =>
          runWithClient(client, () =>
            refreshInventory({ budgetMs: 40_000 }).catch((err) => {
              console.warn(`[commandCenter] Inventory refresh failed (client ${client.key}):`, err?.message || err);
              return 'error' as const;
            })
          )
        )
      )),
    ]);
    // Which clients' sessions are healthy, so a lapsed one is noticed (no tokens in here).
    const sessions = await sessionReport();
    for (const s of sessions) {
      if (s.status !== 'ok') console.warn(`[commandCenter] Session for client ${s.client} is ${s.status} (expires ${s.expiresAt}); sync stops until someone from that client logs in.`);
    }
    return res.json({
      status: result.success ? (result.incomplete ? 'partial' : 'success') : 'error',
      inventory,
      sessions,
      ...result,
    });
  } catch (err: any) {
    console.error('[commandCenter] Cron sync failed:', err);
    return res.status(500).json({ error: 'Sync failed' });
  }
});


// ---------- Live telemetry (PostgreSQL) ----------

// How current this client's stored data is: last sync attempt/completion, its newest stored frame and
// the health of its stored session (which scheduled sync depends on). Read-only; no tokens in the answer.
router.get('/health', async (_req, res) => {
  try {
    const client = requireClient();
    const [syncRes, frameRes, sessions] = await Promise.all([
      pool.query('SELECT last_attempt_at, last_complete_at, last_status FROM client_sync_state WHERE client_key = $1', [client.key]),
      pool.query(
        `SELECT MAX(decoded_at) AS latest FROM raw_telemetry_packets
         WHERE decoded_at > NOW() - INTERVAL '3 days' AND ${ownedMeters(1)}`,
        [await clientKey()]
      ),
      sessionReport(),
    ]);
    const sync = syncRes.rows[0];
    const session = sessions.find((s) => s.client === client.key);
    const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
    const lastCompleteAt = iso(sync?.last_complete_at);
    res.json({
      generatedAt: new Date().toISOString(),
      sync: { lastAttemptAt: iso(sync?.last_attempt_at), lastCompleteAt, lastStatus: sync?.last_status ?? null },
      latestStoredFrameAt: iso(frameRes.rows[0]?.latest),
      session: session ? { status: session.status, expiresAt: session.expiresAt } : null,
      // The scheduler runs every 15 minutes; an hour without a complete run means something is wrong.
      syncBehind: lastCompleteAt ? Date.now() - Date.parse(lastCompleteAt) > 60 * 60 * 1000 : null,
    });
  } catch (err: any) {
    console.error('[commandCenter] Error loading health:', err);
    res.status(503).json({ error: 'Health unavailable' });
  }
});

router.get('/summary', async (req, res) => {
  const win = windowOr400(req, res);
  if (!win) return;
  const siteId = validSite(req.query.siteId ?? req.query.siteIds);
  if (!siteId) return badRequest(res, 'site');
  if (scopeSiteIds(requireClient(), siteId) === null) return res.status(404).json({ error: 'Unknown site' });
  try {
    // Manual Refresh answers instantly from stored data and pulls fresh packets in the background;
    // the page keeps polling while `refreshing` is true.
    if (req.query.refresh === 'true') startManualRefresh(win, siteId);
    const summary = await retryTransient(() => getPostgresAggregatedSummary(win, false, siteId));
    res.json({ ...summary, refreshing: isRefreshing() });
  } catch (err: any) {
    // No silent fallback to a different data source: an honest error beats plausible-looking wrong data.
    console.error('[commandCenter] Error generating telemetry summary:', err);
    res.status(503).json({ error: 'Telemetry summary unavailable' });
  }
});

// Live top-level sites from the real site hierarchy (same source as the Dashboard),
// so newly added sites appear without a code or DB change.
router.get('/sites', async (req, res) => {
  try {
    const roots = await getRoots(req.headers.authorization);
    let sites = roots.map((r) => ({ id: String(r.id), name: r.name }));
    if (sites.length === 0 && requireClient().unscoped) {
      const local = await pool.query('SELECT id, name FROM sites ORDER BY name');
      sites = local.rows.map((r: { id: number; name: string }) => ({ id: String(r.id), name: r.name }));
    }
    sites.sort((a, b) => a.name.localeCompare(b.name));
    res.json([{ id: 'ALL', name: 'All Sites' }, ...sites]);
  } catch (err: any) {
    console.error('[commandCenter] Error loading sites:', err);
    res.status(500).json({ error: 'Failed to load sites' });
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
    res.status(503).json({ error: 'Failed to load gateway meters' });
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
    res.status(503).json({ error: 'Failed to load gateway frames' });
  }
});

router.get('/meters', async (req, res) => {
  const win = windowOr400(req, res);
  if (!win) return;
  const siteId = validSite(req.query.siteId);
  if (!siteId) return badRequest(res, 'site');
  if (scopeSiteIds(requireClient(), siteId) === null) return res.status(404).json({ error: 'Unknown site' });
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
    res.status(503).json({ error: 'Failed to list meters' });
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
    res.status(503).json({ error: 'Failed to search meters' });
  }
});

// One meter by exact ID / DevEUI: what "open this meter" uses (search is substring-based and capped)
router.get('/meters/:meterId', async (req, res) => {
  const win = windowOr400(req, res);
  if (!win) return;
  const meterId = validId(req.params.meterId);
  if (!meterId) return badRequest(res, 'meter id');
  try {
    const found = await retryTransient(() => getMeter(meterId, win));
    if (!found) return res.status(404).json({ error: 'Meter not found in this window' });
    res.json(found);
  } catch (err: any) {
    console.error('[commandCenter] Error loading meter:', err);
    res.status(503).json({ error: 'Failed to load meter' });
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
    res.status(503).json({ error: 'Failed to load meter frames' });
  }
});

// Newest frames across the fleet (or one site), paginated: "Load more" in the live feed
router.get('/frames', async (req, res) => {
  const win = windowOr400(req, res);
  if (!win) return;
  const siteId = validSite(req.query.siteId);
  if (!siteId) return badRequest(res, 'site');
  if (scopeSiteIds(requireClient(), siteId) === null) return res.status(404).json({ error: 'Unknown site' });
  try {
    const { limit, offset } = pageParams(req.query, 100);
    res.json(await retryTransient(() => getFleetFrames(win, siteId, limit, offset)));
  } catch (err: any) {
    console.error('[commandCenter] Error loading frames:', err);
    res.status(503).json({ error: 'Failed to load frames' });
  }
});

// Traffic over time (frames and distinct meters per bucket) with the previous equal period
router.get('/traffic', async (req, res) => {
  const win = windowOr400(req, res);
  if (!win) return;
  const siteId = validSite(req.query.siteId);
  if (!siteId) return badRequest(res, 'site');
  if (scopeSiteIds(requireClient(), siteId) === null) return res.status(404).json({ error: 'Unknown site' });
  const gatewayId = req.query.gatewayId === undefined ? undefined : validId(req.query.gatewayId);
  if (gatewayId === null) return badRequest(res, 'gateway id');
  try {
    res.json(await retryTransient(() => getTraffic({ win, siteId, gatewayId })));
  } catch (err: any) {
    console.error('[commandCenter] Error loading traffic:', err);
    res.status(503).json({ error: 'Failed to load traffic' });
  }
});

// Radio analysis (RSSI/SNR distributions, DR, frequency, weakest/strongest meters)
router.get('/radio', async (req, res) => {
  const win = windowOr400(req, res);
  if (!win) return;
  const siteId = validSite(req.query.siteId);
  if (!siteId) return badRequest(res, 'site');
  if (scopeSiteIds(requireClient(), siteId) === null) return res.status(404).json({ error: 'Unknown site' });
  const gatewayId = req.query.gatewayId === undefined ? undefined : validId(req.query.gatewayId);
  if (gatewayId === null) return badRequest(res, 'gateway id');
  try {
    res.json(await retryTransient(() => getRadioHealth({ win, siteId, gatewayId })));
  } catch (err: any) {
    console.error('[commandCenter] Error loading radio health:', err);
    res.status(503).json({ error: 'Failed to load radio health' });
  }
});

export default router;
