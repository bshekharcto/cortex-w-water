import { Router } from 'express';
import {
  getNodeChildren,
  getNodeMeters,
  getNodeAncestors,
  getNodeTrend,
  getNodeBoundaries,
  METER_SORT_KEYS,
  MeterSortKey,
  TrendMode,
  SessionExpiredError,
} from '../services/dashboardService.js';

const router = Router();

// The Dashboard is served from Postgres (see services/dashboardService.ts): the site tree and the meters from the
// metadata mirror, the numbers from water_meter_readings_v2. The beta API is asked only which sites the caller may
// open. The routes work at any depth of the tree.

/**
 * GET /api/dashboard/nodes?parentId=<id>
 * The direct children of `parentId` (or the top-level sites when it is omitted or "root"), each with the totals of its
 * whole subtree.
 */
router.get('/nodes', async (req, res) => {
  const parentIdParam = (req.query.parentId as string) || '';

  try {
    if (!parentIdParam || parentIdParam === 'root') {
      return res.json(await getNodeChildren(null, req.headers.authorization));
    }
    return res.json(await getNodeChildren(parentIdParam, req.headers.authorization));
  } catch (err: any) {
    if (err instanceof SessionExpiredError) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    console.warn('[dashboard] Error fetching nodes:', err?.message || err);
    return res.json([]);
  }
});

/**
 * GET /api/dashboard/nodes/:nodeId/ancestors
 * Root-to-node chain of names, for the breadcrumb on a fresh page load or a pasted deep link.
 */
router.get('/nodes/:nodeId/ancestors', async (req, res) => {
  try {
    const chain = await getNodeAncestors(req.params.nodeId, req.headers.authorization);
    return res.json(chain.map((n) => ({ id: n.ref, name: n.name, level: n.level })));
  } catch (err: any) {
    if (err instanceof SessionExpiredError) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    console.warn('[dashboard] Error resolving ancestors:', err?.message || err);
    return res.json([]);
  }
});

const intParam = (value: unknown, fallback: number, min: number, max: number) => {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/**
 * GET /api/dashboard/nodes/:nodeId/meters?page=0&size=15&sort=devEui&dir=asc&q=...&status=ALL|CONNECTED|DISCONNECTED|NEVER_SEEN
 * One page of the meters of this node, sorted, searched and filtered by the database, with the totals of the whole node.
 */
router.get('/nodes/:nodeId/meters', async (req, res) => {
  try {
    const sort = METER_SORT_KEYS.includes(req.query.sort as MeterSortKey) ? (req.query.sort as MeterSortKey) : 'devEui';
    const status = ['CONNECTED', 'DISCONNECTED', 'NEVER_SEEN'].includes(String(req.query.status))
      ? (String(req.query.status) as 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN')
      : 'ALL';
    const result = await getNodeMeters(
      req.params.nodeId,
      {
        page: intParam(req.query.page, 0, 0, 100000),
        size: intParam(req.query.size, 15, 1, 100),
        sort,
        dir: String(req.query.dir).toLowerCase() === 'desc' ? 'desc' : 'asc',
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        status,
      },
      req.headers.authorization
    );
    if (result === null) return res.status(403).json({ error: 'No access to this area' });
    return res.json({
      content: result.content.map((m) => ({
        assetId: m.assetId,
        devEui: m.devEui,
        meterId: m.meterId,
        consumerId: m.consumerId ?? undefined,
        consumerName: m.consumerName ?? undefined,
        address: m.address ?? undefined,
        totalizerM3: m.totalizerKl, // 1 KL = 1 m3
        latestReadingAt: m.decodedAt ?? undefined,
        latestReadingLocal: m.decodedLocal ?? undefined,
        connectivityStatus: m.connectivity,
      })),
      page: result.page,
      size: result.size,
      total: result.total,
      totalPages: result.totalPages,
      summary: result.summary,
    });
  } catch (err: any) {
    if (err instanceof SessionExpiredError) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    console.error('[dashboard] Error fetching node meters:', err);
    return res.status(500).json({ error: 'Failed to load the meters' });
  }
});

/**
 * GET /api/dashboard/nodes/:nodeId/trend?mode=DAILY|MONTHLY&days=30
 * Consumption of everything under the node (the chart icon). DAILY: the last `days` days (1-90); MONTHLY: 12 months.
 */
router.get('/nodes/:nodeId/trend', async (req, res) => {
  try {
    const mode: TrendMode = String(req.query.mode || 'DAILY').toUpperCase() === 'MONTHLY' ? 'MONTHLY' : 'DAILY';
    const days = parseInt(String(req.query.days ?? '30'), 10);
    const points = await getNodeTrend(req.params.nodeId, mode, Number.isFinite(days) ? days : 30, req.headers.authorization);
    if (points === null) return res.status(403).json({ error: 'No access to this area' });
    return res.json(points);
  } catch (err: any) {
    if (err instanceof SessionExpiredError) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    console.error('[dashboard] Error building the consumption trend:', err);
    return res.status(500).json({ error: 'Failed to build the consumption trend', message: err?.message });
  }
});

/**
 * GET /api/dashboard/nodes/:nodeId/boundaries
 * The zone / DMA boundary polygons under the node (the map icon).
 */
router.get('/nodes/:nodeId/boundaries', async (req, res) => {
  try {
    const boundaries = await getNodeBoundaries(req.params.nodeId, req.headers.authorization);
    if (boundaries === null) return res.status(403).json({ error: 'No access to this area' });
    return res.json(boundaries);
  } catch (err: any) {
    if (err instanceof SessionExpiredError) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    console.error('[dashboard] Error loading boundaries:', err);
    return res.status(500).json({ error: 'Failed to load the boundaries', message: err?.message });
  }
});

export default router;
