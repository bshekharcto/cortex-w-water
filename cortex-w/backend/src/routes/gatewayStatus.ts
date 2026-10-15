import { Router, type Response } from 'express';
import { logRouteError } from '../db/pool.js';
import { requireClient } from '../services/clientContext.js';
import { singleFlight } from '../services/inflight.js';
import {
  BadRangeError,
  fetchConnectivityReport,
  fetchGatewayTimeline,
  fetchReportPresets,
  fetchTimelinePresets,
  parseRange,
  type ConnectivityReport,
  type PresetBundle,
} from '../services/gatewayConnectivity.js';
import { UpstreamError } from '../services/upstreamProxy.js';

const router = Router();

// The Gateway Status page (see services/gatewayConnectivity.ts). The data comes live from the upstream gateway-health
// service with the signed-in client's own token, so a client only ever sees its own gateways.

const EUI = /^[0-9a-f]{16}$/i;

const reportsInFlight = new Map<string, Promise<ConnectivityReport>>();
const presetsInFlight = new Map<string, Promise<PresetBundle<ConnectivityReport>>>();

function fail(res: Response, what: string, err: unknown) {
  if (err instanceof BadRangeError) return res.status(400).json({ error: err.message });
  if (err instanceof UpstreamError && err.upstreamStatus === 401) {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
  logRouteError(`[gateway-status] Error ${what}:`, err);
  res.status(502).json({ error: `Failed to ${what}` });
}

function privateNoCache(res: Response) {
  res.set('Cache-Control', 'private, no-cache');
  res.set('Vary', 'Authorization');
}

/** Demo (seed) mode has no upstream to ask; say so rather than showing an empty fleet. */
function liveClient(res: Response) {
  const client = requireClient();
  if (client.unscoped) {
    res.status(503).json({ error: 'Gateway Status needs the live platform; it is not available in demo mode.' });
    return null;
  }
  return client;
}

/**
 * GET /api/gateway-status/presets?endDate=YYYY-MM-DD&timeZone=Asia/Kolkata
 * The report for 1D, 3D, 7D and 14D ending on endDate (normally today), from one upstream call, so the page can switch
 * between them without waiting.
 */
router.get('/presets', async (req, res) => {
  const client = liveClient(res);
  if (!client) return;
  try {
    const { endDate, timeZone } = parseRange(req.query.endDate, req.query.endDate, req.query.timeZone);
    const key = `${client.key}|${endDate}|${timeZone}`;
    privateNoCache(res);
    res.json(await singleFlight(presetsInFlight, key, () => fetchReportPresets(client.token, endDate, timeZone)));
  } catch (err) {
    fail(res, 'load gateway status', err);
  }
});

/**
 * GET /api/gateway-status?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&timeZone=Asia/Kolkata
 * Every gateway with its current state and connectivity over the days asked for.
 */
router.get('/', async (req, res) => {
  const client = liveClient(res);
  if (!client) return;
  try {
    const range = parseRange(req.query.startDate, req.query.endDate, req.query.timeZone);
    const key = `${client.key}|${range.startDate}|${range.endDate}|${range.timeZone}`;
    privateNoCache(res);
    res.json(await singleFlight(reportsInFlight, key, () => fetchConnectivityReport(client.token, range)));
  } catch (err) {
    fail(res, 'load gateway status', err);
  }
});

/**
 * GET /api/gateway-status/:gatewayId/timeline-presets?endDate=&timeZone=
 * One gateway's timeline for 1D, 3D, 7D and 14D, from one upstream call.
 */
router.get('/:gatewayId/timeline-presets', async (req, res) => {
  const client = liveClient(res);
  if (!client) return;
  const gatewayId = req.params.gatewayId;
  if (!EUI.test(gatewayId)) return res.status(400).json({ error: 'gatewayId must be a 16-character gateway id' });
  try {
    const { endDate, timeZone } = parseRange(req.query.endDate, req.query.endDate, req.query.timeZone);
    privateNoCache(res);
    res.json(await fetchTimelinePresets(client.token, gatewayId.toLowerCase(), endDate, timeZone));
  } catch (err) {
    if (err instanceof UpstreamError && (err.upstreamStatus === 403 || err.upstreamStatus === 404)) {
      return res.status(404).json({ error: 'Unknown gateway' });
    }
    fail(res, 'load the gateway timeline', err);
  }
});

/**
 * GET /api/gateway-status/:gatewayId/timeline?startDate=&endDate=&timeZone=
 * One gateway's online/offline periods over the days asked for.
 */
router.get('/:gatewayId/timeline', async (req, res) => {
  const client = liveClient(res);
  if (!client) return;
  const gatewayId = req.params.gatewayId;
  if (!EUI.test(gatewayId)) return res.status(400).json({ error: 'gatewayId must be a 16-character gateway id' });
  try {
    const range = parseRange(req.query.startDate, req.query.endDate, req.query.timeZone);
    privateNoCache(res);
    res.json(await fetchGatewayTimeline(client.token, gatewayId.toLowerCase(), range));
  } catch (err) {
    // The upstream answers 403 for a gateway that is not the caller's: the same "unknown" as a missing one.
    if (err instanceof UpstreamError && (err.upstreamStatus === 403 || err.upstreamStatus === 404)) {
      return res.status(404).json({ error: 'Unknown gateway' });
    }
    fail(res, 'load the gateway timeline', err);
  }
});

export default router;
