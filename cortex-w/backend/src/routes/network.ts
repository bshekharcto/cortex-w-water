import { Router, type Request, type Response } from 'express';
import { requireClient, scopeSiteIds } from '../services/clientContext.js';
import { getGateways, getMeterMap, listMeters, type SiteScope } from '../services/networkService.js';
import { withDescendants, type MeterStatus } from '../services/networkLogic.js';

const router = Router();

// The Network Explorer's data (see services/networkService.ts). Every route works for the signed-in client only:
// a site id that is not theirs answers 404 (so ids cannot be probed), and "ALL" means "all of my sites".

const STATUSES = new Set<string>(['live', 'stale', 'silent', 'never']);
const EUI = /^[0-9a-f]{16}$/i;

/** The sites a request is limited to (the ones named plus everything below them), or null for "unknown site". */
function resolveScope(req: Request): SiteScope | null {
  const ctx = requireClient();
  const raw = req.query.siteId ?? req.query.siteIds ?? '';
  if (typeof raw !== 'string') return null;
  const ids = scopeSiteIds(ctx, raw);
  if (ids === null) return null;
  if (ctx.unscoped) return ids.length ? ids : null;
  return withDescendants(ctx.sites, ids);
}

/** Validates the query; answers the 4xx itself and returns null when it is not acceptable. */
function scopeOrReject(req: Request, res: Response): { scope: SiteScope } | null {
  if (typeof (req.query.siteId ?? req.query.siteIds ?? '') !== 'string') {
    res.status(400).json({ error: 'siteId must be a single value' });
    return null;
  }
  const scope = resolveScope(req);
  if (scope === null && !requireClient().unscoped) {
    res.status(404).json({ error: 'Unknown site' });
    return null;
  }
  return { scope };
}

function fail(res: Response, what: string, err: any) {
  console.error(`[network] Error ${what}:`, err?.message || err);
  res.status(500).json({ error: `Failed to ${what}` });
}

// Per-user data that changes only when the scheduler loads readings: the browser may keep it but must ask again (ETag -> 304).
function privateCache(res: Response) {
  res.set('Cache-Control', 'private, no-cache');
  res.set('Vary', 'Authorization');
}

/**
 * GET /api/network/gateways?siteId=<id|ALL>
 * Installed gateways (position, radius, health) plus the gateways that meters report through but that cannot be drawn.
 */
router.get('/gateways', async (req, res) => {
  const ok = scopeOrReject(req, res);
  if (!ok) return;
  try {
    privateCache(res);
    res.json(await getGateways(ok.scope));
  } catch (err) {
    fail(res, 'load gateways', err);
  }
});

/**
 * GET /api/network/meters/map?siteId=<id|ALL>
 * Everything the map needs to draw every meter, in one compact response: rows are arrays (see `columns`), only meters
 * with a position are included, the rest are counted in summary.withoutCoordinates.
 */
router.get('/meters/map', async (req, res) => {
  const ok = scopeOrReject(req, res);
  if (!ok) return;
  try {
    privateCache(res);
    res.json(await getMeterMap(ok.scope));
  } catch (err) {
    fail(res, 'load the meter map', err);
  }
});

/**
 * GET /api/network/meters?siteId=&limit=&offset=&search=&status=live|stale|silent|never&gatewayId=
 * One page of the meter table, with the details the map payload leaves out.
 */
router.get('/meters', async (req, res) => {
  const ok = scopeOrReject(req, res);
  if (!ok) return;

  const num = (v: unknown, def: number, min: number, max: number): number | null => {
    if (v === undefined) return def;
    if (typeof v !== 'string' || !/^\d{1,7}$/.test(v)) return null;
    const n = Number(v);
    return n >= min && n <= max ? n : null;
  };
  const limit = num(req.query.limit, 50, 1, 200);
  const offset = num(req.query.offset, 0, 0, 1_000_000);
  if (limit === null || offset === null) return res.status(400).json({ error: 'limit must be 1-200 and offset a whole number' });

  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 64) : '';
  const status = req.query.status;
  if (status !== undefined && (typeof status !== 'string' || !STATUSES.has(status))) {
    return res.status(400).json({ error: 'status must be live, stale, silent or never' });
  }
  const gatewayId = req.query.gatewayId;
  if (gatewayId !== undefined && (typeof gatewayId !== 'string' || !EUI.test(gatewayId))) {
    return res.status(400).json({ error: 'gatewayId must be a 16-character gateway id' });
  }

  try {
    privateCache(res);
    res.json(
      await listMeters(ok.scope, {
        limit,
        offset,
        search: search || undefined,
        status: status as MeterStatus | undefined,
        gatewayId: typeof gatewayId === 'string' ? gatewayId.toLowerCase() : undefined,
      })
    );
  } catch (err) {
    fail(res, 'load meters', err);
  }
});

export default router;
