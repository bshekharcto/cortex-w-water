import { Router } from 'express';
import { proxyUpstream } from '../services/upstreamProxy.js';
import { getAuthToken } from './gis.js';
import { pool } from '../db/pool.js';
import { getRoots, getNode, hasStructuralChildren, getAncestorChain } from '../services/siteTree.js';

const router = Router();

// Real implementation, generic over depth: cog-core-api's real site hierarchy
// (GET /api/site/, see services/siteTree.ts) supplies node identity/structure
// (id, name, level, parent), and /api/water/dma-report/zones/{siteId} is a
// generic "list this node's direct children, with their own real totals and
// embedded meters" call that works at ANY node id, not just the top-level
// district — confirmed by walking it recursively (district -> zone -> DMA ->
// empty at the real leaf). Combining the two means nothing here is hardcoded
// to "3 levels" — if cog-core-api ever adds a deeper level, it shows up
// automatically without a code change.

// Shared per-site cache for the (large — full meter lists embedded per node)
// upstream DMA report, so sibling requests for the same parent within a
// short window don't each independently re-fetch it. Same TTL pattern as
// gis.ts's gisCache. Failed fetches are never cached — an outage should
// keep retrying, not get frozen in as "this node has zero devices."
interface CachedDmaReport {
  timestamp: number;
  rows: any[];
}
const dmaReportCache = new Map<number, CachedDmaReport>();
const DMA_REPORT_CACHE_TTL_MS = 60 * 1000;

async function fetchRealDmaReport(siteId: number, authHeader?: string): Promise<any[]> {
  const now = Date.now();
  const cached = dmaReportCache.get(siteId);
  if (cached && now - cached.timestamp < DMA_REPORT_CACHE_TTL_MS) {
    return cached.rows;
  }

  const token = await getAuthToken(authHeader);
  const headers: Record<string, string> = token ? { Authorization: token } : {};
  const upstream = await proxyUpstream('GET', `/api/water/dma-report/zones/${siteId}`, { headers }).catch(
    () => ({ status: 500, data: null })
  );
  const rows = Array.isArray(upstream.data) ? upstream.data : [];
  if (rows.length > 0) {
    dmaReportCache.set(siteId, { timestamp: now, rows });
  }
  return rows;
}

function sumRows(rows: any[]) {
  return {
    totalDevices: rows.reduce((s, r) => s + (r.totalDevices || 0), 0),
    connected: rows.reduce((s, r) => s + (r.connected || 0), 0),
    disconnected: rows.reduce((s, r) => s + (r.disconnected || 0), 0),
    neverSeen: rows.reduce((s, r) => s + (r.neverSeen || 0), 0),
    yesterdayFlowM3: Number(rows.reduce((s, r) => s + (r.yesterdayFlow || 0), 0).toFixed(2)),
    todayFlowM3: Number(rows.reduce((s, r) => s + (r.todayFlow || 0), 0).toFixed(2)),
    monthToDateFlowM3: Number(rows.reduce((s, r) => s + (r.monthlyFlow || 0), 0).toFixed(2)),
  };
}

/**
 * GET /api/dashboard/nodes?parentId=<id>
 * Returns the direct children of `parentId` (or the real top-level sites if
 * `parentId` is omitted/"root"), each with its own real totals. Works at any
 * depth — the frontend just keeps calling this with whichever id the user
 * drilled into.
 */
router.get('/nodes', async (req, res) => {
  const authHeader = req.headers.authorization;
  const parentIdParam = (req.query.parentId as string) || '';

  try {
    if (!parentIdParam || parentIdParam === 'root') {
      const roots = await getRoots(authHeader);
      const results = await Promise.all(
        roots.map(async (root) => {
          const rows = await fetchRealDmaReport(root.id, authHeader);
          const totals = sumRows(rows);
          const childCount = await hasStructuralChildren(root.id, authHeader);
          return {
            id: String(root.id),
            name: root.name,
            level: root.level,
            parentId: null,
            parentName: null,
            hasChildren: childCount,
            meterCount: 0, // real top-level sites never carry meters directly in this data model
            ...totals,
            dataTimestamp: new Date().toISOString(),
          };
        })
      );
      return res.json(results);
    }

    const parentId = Number(parentIdParam);
    if (!Number.isFinite(parentId)) return res.json([]);

    const rows = await fetchRealDmaReport(parentId, authHeader);
    const results = await Promise.all(
      rows.map(async (r: any) => {
        const node = await getNode(r.id, authHeader);
        const childCount = await hasStructuralChildren(r.id, authHeader);
        return {
          id: String(r.id),
          name: node?.name || r.name,
          level: node?.level ?? null,
          parentId: parentIdParam,
          parentName: node?.parentName ?? null,
          hasChildren: childCount,
          meterCount: Array.isArray(r.meters) ? r.meters.length : 0,
          totalDevices: r.totalDevices || 0,
          connected: r.connected || 0,
          disconnected: r.disconnected || 0,
          neverSeen: r.neverSeen || 0,
          yesterdayFlowM3: r.yesterdayFlow || 0,
          todayFlowM3: r.todayFlow || 0,
          monthToDateFlowM3: r.monthlyFlow || 0,
          dataTimestamp: r.timestamp || new Date().toISOString(),
        };
      })
    );
    return res.json(results);
  } catch (err: any) {
    console.warn('[dashboard] Error fetching nodes:', err?.message || err);
    return res.json([]);
  }
});

/**
 * GET /api/dashboard/nodes/:nodeId/ancestors
 * Root-to-node chain of real names, for resolving the breadcrumb on a fresh
 * page load or a pasted deep link (where the frontend doesn't have the
 * intermediate names from click history).
 */
router.get('/nodes/:nodeId/ancestors', async (req, res) => {
  try {
    const nodeId = Number(req.params.nodeId);
    if (!Number.isFinite(nodeId)) return res.json([]);
    const chain = await getAncestorChain(nodeId, req.headers.authorization);
    return res.json(chain.map((n) => ({ id: String(n.id), name: n.name, level: n.level })));
  } catch (err: any) {
    console.warn('[dashboard] Error resolving ancestors:', err?.message || err);
    return res.json([]);
  }
});

// Real dev_eui, looked up from our own synced telemetry (raw_telemetry_packets)
// by meter_id — never fabricated. cog-core-api's dma-report endpoint doesn't
// return a devEui field at all (confirmed against a live payload), so this is
// the only real source for it. Batched per-node to avoid one query per meter;
// falls back to an empty map (every meter renders "no dev_eui yet") if the
// lookup itself fails, rather than fabricating anything.
async function fetchDevEuiMap(meterIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (meterIds.length === 0) return map;
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (meter_id) meter_id, dev_eui
       FROM raw_telemetry_packets
       WHERE meter_id = ANY($1::text[])
       ORDER BY meter_id, decoded_at DESC`,
      [meterIds]
    );
    for (const row of result.rows) {
      if (row.dev_eui) map.set(row.meter_id, row.dev_eui);
    }
  } catch (err: any) {
    console.warn('[dashboard] Failed to look up dev_eui from Postgres:', err?.message || err);
  }
  return map;
}

async function mapMeterRows(match: any): Promise<any[]> {
  const meters = match.meters || [];
  const devEuiMap = await fetchDevEuiMap(meters.map((m: any) => m.meterId).filter(Boolean));

  return meters.map((m: any) => ({
    assetId: m.assetId ?? null,
    devEui: devEuiMap.get(m.meterId) || null,
    meterId: m.meterId,
    meterType: 'Axioma Qalcosonic W1',
    consumerId: m.consumerId,
    consumerName: m.consumerName,
    address: m.address,
    meterSize: '15mm',
    totalizerM3: m.totalizer ?? 0,
    latestReadingAt: m.decodedAt || undefined,
    connectivityStatus: m.connectivityStatus || 'NEVER_SEEN',
  }));
}

/**
 * GET /api/dashboard/nodes/:nodeId/meters
 * Returns the real meter list directly attached to this node. A node's own
 * meters live embedded in its PARENT's dma-report response (not in a call to
 * the node itself, which returns its children instead) — so this resolves
 * the node's parent from the real site tree, re-fetches that parent's report
 * (cheap: shared cache above), and picks out this node's row.
 */
router.get('/nodes/:nodeId/meters', async (req, res) => {
  try {
    const nodeId = Number(req.params.nodeId);
    if (!Number.isFinite(nodeId)) return res.json([]);
    const authHeader = req.headers.authorization;

    const node = await getNode(nodeId, authHeader);
    if (!node || node.parentId == null) {
      // No parent = a real top-level site = never carries meters directly.
      return res.json([]);
    }

    const rows = await fetchRealDmaReport(node.parentId, authHeader);
    const match = rows.find((r: any) => String(r.id) === String(nodeId));
    if (!match) return res.json([]);

    return res.json(await mapMeterRows(match));
  } catch (err: any) {
    console.warn('[dashboard] Error fetching node meters:', err?.message || err);
    return res.json([]);
  }
});

export default router;
