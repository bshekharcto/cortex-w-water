import { Router, type Response } from 'express';
import { fetchUpstreamOrThrow, UpstreamError } from '../services/upstreamProxy.js';
import { singleFlight } from '../services/inflight.js';
import { getAuthToken } from './gis.js';
import {
  getRoots,
  getNode,
  hasStructuralChildren,
  getAncestorChain,
  getDescendantIds,
  type SiteNode,
} from '../services/siteTree.js';
import { getInventory, type Inventory } from '../services/assetInventory.js';
import {
  OTHERS_NAME,
  OTHERS_ID_PREFIX,
  getMeterFacts,
  connectivityOf,
  type MeterFact,
} from '../services/unassignedMeters.js';

const router = Router();

/**
 * Warm the slow sources (meter inventory ~1min, telemetry scan ~10s) so the
 * first dashboard load isn't the one that pays for them. Called once from the
 * long-running server's startup, not at import, so serverless cold starts
 * (which only import the app) don't each trigger a full load.
 */
export function warmDashboardCaches(): void {
  getInventory().catch((err) => console.warn('[dashboard] Inventory warm-up failed:', err?.message || err));
  getMeterFacts().catch((err) => console.warn('[dashboard] Telemetry warm-up failed:', err?.message || err));
}

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
// gis.ts's gisCache. A failed fetch throws (UpstreamError) and is never
// cached — an outage must surface and keep retrying, not be frozen in (or
// passed off) as "this node has zero devices."
interface CachedDmaReport {
  timestamp: number;
  rows: any[];
}
const dmaReportCache = new Map<number, CachedDmaReport>();
const dmaReportInflight = new Map<number, Promise<any[]>>();
const DMA_REPORT_CACHE_TTL_MS = 60 * 1000;

function fetchRealDmaReport(siteId: number, authHeader?: string): Promise<any[]> {
  const cached = dmaReportCache.get(siteId);
  if (cached && Date.now() - cached.timestamp < DMA_REPORT_CACHE_TTL_MS) {
    return Promise.resolve(cached.rows);
  }
  // Concurrent requests for the same node share one (large) upstream fetch.
  return singleFlight(dmaReportInflight, siteId, () => loadDmaReport(siteId, authHeader));
}

async function loadDmaReport(siteId: number, authHeader?: string): Promise<any[]> {
  const token = await getAuthToken(authHeader);
  const headers: Record<string, string> = token ? { Authorization: token } : {};
  const path = `/api/water/dma-report/zones/${siteId}`;
  const data = await fetchUpstreamOrThrow('GET', path, { headers });
  if (!Array.isArray(data)) throw new UpstreamError(path, 200, 'response was not a list');
  // An empty list is a legitimate answer (a leaf node has no children).
  if (data.length > 0) dmaReportCache.set(siteId, { timestamp: Date.now(), rows: data });
  return data;
}

type Conn = 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN';

interface Totals {
  totalDevices: number;
  connected: number;
  disconnected: number;
  neverSeen: number;
  yesterdayFlowM3: number;
  todayFlowM3: number;
  monthToDateFlowM3: number;
}

// cog-core-api's own asset status, as a fallback for meters its DMA report
// doesn't cover (cross-checked against the DMA report's connectivityStatus:
// ACTIVE ~ CONNECTED, INACTIVE ~ DISCONNECTED, NOT_REPORTING ~ NEVER_SEEN).
const ASSET_STATUS_TO_CONN: Record<string, Conn> = {
  ACTIVE: 'CONNECTED',
  INACTIVE: 'DISCONNECTED',
  NOT_REPORTING: 'NEVER_SEEN',
};

/**
 * Where each fact about a meter comes from. Membership (which node a meter
 * sits under) is decided by cog-core-api only: the DMA report's embedded
 * meters plus the asset inventory's site assignment. Our Postgres telemetry
 * never decides membership — it only fills in last-seen / totalizer / dev_eui
 * / flows for meters upstream doesn't report those for.
 */
interface Ctx {
  inv: Inventory;
  facts: Map<string, MeterFact>;
}

async function loadCtx(authHeader?: string): Promise<Ctx> {
  const [inv, facts] = await Promise.all([getInventory(authHeader), getMeterFacts()]);
  return { inv, facts: new Map(facts.map((f) => [f.meterId, f])) };
}

function embeddedOf(...rowSets: any[][]): Map<string, any> {
  const map = new Map<string, any>();
  for (const rows of rowSets) {
    for (const r of rows) for (const m of r.meters || []) if (m.meterId) map.set(m.meterId, m);
  }
  return map;
}

/** Meter ids under `node`: assets attached to it or any descendant, plus any embedded in its DMA row(s). */
async function memberIds(
  node: SiteNode,
  embeddedRows: any[],
  ctx: Ctx,
  authHeader?: string
): Promise<Set<string>> {
  const ids = new Set<string>();
  // The inventory holds only household-mapped meters, so it also vets the DMA
  // report's embedded ones (which today are all mapped already).
  for (const r of embeddedRows) {
    for (const m of r.meters || []) {
      if (m.meterId && ctx.inv.byMeter.has(m.meterId)) ids.add(m.meterId);
    }
  }
  const siteIds = [node.id, ...(await getDescendantIds(node.id, authHeader))];
  for (const sid of siteIds) for (const id of ctx.inv.bySite.get(sid) || []) ids.add(id);
  return ids;
}

function connOf(id: string, emb: Map<string, any>, ctx: Ctx): Conn {
  const e = emb.get(id);
  if (e?.connectivityStatus) return e.connectivityStatus as Conn;
  const inv = ctx.inv.byMeter.get(id);
  if (inv && ASSET_STATUS_TO_CONN[inv.status]) return ASSET_STATUS_TO_CONN[inv.status];
  const fact = ctx.facts.get(id);
  return fact ? connectivityOf(fact.lastSeen) : 'NEVER_SEEN';
}

function summarize(ids: Iterable<string>, emb: Map<string, any>, ctx: Ctx): Totals {
  const t: Totals = {
    totalDevices: 0, connected: 0, disconnected: 0, neverSeen: 0,
    yesterdayFlowM3: 0, todayFlowM3: 0, monthToDateFlowM3: 0,
  };
  for (const id of ids) {
    t.totalDevices++;
    const c = connOf(id, emb, ctx);
    if (c === 'CONNECTED') t.connected++;
    else if (c === 'DISCONNECTED') t.disconnected++;
    else t.neverSeen++;
    const e = emb.get(id);
    const f = ctx.facts.get(id);
    t.yesterdayFlowM3 += e ? e.yesterdayFlow || 0 : f?.yesterdayM3 ?? 0;
    t.todayFlowM3 += e ? e.todayFlow || 0 : f?.todayM3 ?? 0;
    t.monthToDateFlowM3 += e ? e.monthlyFlow || 0 : f?.monthM3 ?? 0;
  }
  t.yesterdayFlowM3 = Number(t.yesterdayFlowM3.toFixed(2));
  t.todayFlowM3 = Number(t.todayFlowM3.toFixed(2));
  t.monthToDateFlowM3 = Number(t.monthToDateFlowM3.toFixed(2));
  return t;
}

function toMeterRow(id: string, emb: Map<string, any>, ctx: Ctx) {
  const e = emb.get(id);
  const inv = ctx.inv.byMeter.get(id);
  const f = ctx.facts.get(id);
  return {
    assetId: e?.assetId ?? inv?.assetId ?? null,
    devEui: f?.devEui ?? null,
    meterId: id,
    consumerId: e?.consumerId ?? inv?.consumerId,
    consumerName: e?.consumerName ?? inv?.consumerName,
    address: e?.address ?? inv?.address,
    // null (not 0) when no source has a reading, so "no data" never reads as 0 m³.
    // Meter type/size aren't carried by any upstream endpoint, so they aren't sent.
    totalizerM3: e?.totalizer ?? f?.totalizerM3 ?? null,
    latestReadingAt: e?.decodedAt || f?.lastSeen?.toISOString() || undefined,
    connectivityStatus: connOf(id, emb, ctx),
  };
}

/** A node's own embedded meter row, which lives in its PARENT's DMA report. */
async function ownEmbeddedRows(node: SiteNode, authHeader?: string): Promise<any[]> {
  if (node.parentId == null) return [];
  const siblings = await fetchRealDmaReport(node.parentId, authHeader);
  return siblings.filter((r: any) => r.id === node.id);
}

interface OthersGroup {
  ids: string[];
  emb: Map<string, any>;
  totals: Totals;
}

/**
 * Meters that belong under `parent` but not under any of its real children
 * (attached straight to the site, or with no zone/DMA) — surfaced as one
 * synthetic "Others" child so no meter is dropped. Null when there are none.
 */
async function computeOthers(
  parent: SiteNode,
  childRows: any[],
  ctx: Ctx,
  authHeader?: string
): Promise<OthersGroup | null> {
  const own = await ownEmbeddedRows(parent, authHeader);
  const parentIds = await memberIds(parent, [...own, ...childRows], ctx, authHeader);

  const inChild = new Set<string>();
  for (const r of childRows) {
    const child = await getNode(r.id, authHeader);
    const ids = child ? await memberIds(child, [r], ctx, authHeader) : new Set<string>();
    for (const id of ids) inChild.add(id);
  }

  const ids = [...parentIds].filter((id) => !inChild.has(id));
  if (ids.length === 0) return null;
  const emb = embeddedOf(own, childRows);
  return { ids, emb, totals: summarize(ids, emb, ctx) };
}

/**
 * Freshness for a node row: the DMA report's own timestamp when the node has
 * one, otherwise when the inventory (which decides membership) was loaded —
 * never "now", which would claim data is fresher than it is.
 */
function freshness(reportTimestamp: string | undefined, ctx: Ctx): string {
  return reportTimestamp || new Date(ctx.inv.loadedAt).toISOString();
}

function othersNodeRow(parent: SiteNode, totals: Totals, ctx: Ctx) {
  return {
    id: `${OTHERS_ID_PREFIX}${parent.id}`,
    name: OTHERS_NAME,
    level: (parent.level ?? 0) + 1,
    parentId: String(parent.id),
    parentName: parent.name,
    hasChildren: false,
    // A synthetic group, not a real site-tree node: the UI must not count it as a configured area.
    synthetic: true,
    meterCount: totals.totalDevices,
    ...totals,
    dataTimestamp: freshness(undefined, ctx),
  };
}

/**
 * Failures are reported as failures: a 502 when cog-core-api (or the
 * Postgres telemetry) can't answer, a 500 for anything else — never a 200
 * with an empty list, which the UI would render as "this node has no data".
 */
function sendError(res: Response, what: string, err: any) {
  const upstream = err instanceof UpstreamError;
  console.warn(`[dashboard] ${what} failed:`, err?.message || err);
  res.status(upstream ? 502 : 500).json({
    error: upstream ? 'UPSTREAM_UNAVAILABLE' : 'INTERNAL_ERROR',
    message: upstream ? 'The water platform did not respond. Please retry.' : `Could not ${what}.`,
  });
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
    const ctx = await loadCtx(authHeader);

    if (!parentIdParam || parentIdParam === 'root') {
      const roots = await getRoots(authHeader);
      const results = await Promise.all(
        roots.map(async (root) => {
          const rows = await fetchRealDmaReport(root.id, authHeader);
          const hasRealChildren = await hasStructuralChildren(root.id, authHeader);
          // A top-level site's total is every meter attached to it or listed
          // under any of its children — including meters attached straight to
          // the site, which the DMA report never lists.
          const ids = await memberIds(root, rows, ctx, authHeader);
          const totals = summarize(ids, embeddedOf(rows), ctx);
          return {
            id: String(root.id),
            name: root.name,
            level: root.level,
            parentId: null,
            parentName: null,
            hasChildren: hasRealChildren,
            meterCount: ids.size,
            ...totals,
            dataTimestamp: freshness(rows[0]?.timestamp, ctx),
          };
        })
      );
      return res.json(results);
    }

    const parentId = Number(parentIdParam);
    if (!Number.isFinite(parentId)) return res.json([]);

    const rows = await fetchRealDmaReport(parentId, authHeader);
    const results: any[] = await Promise.all(
      rows.map(async (r: any) => {
        const node = await getNode(r.id, authHeader);
        const childCount = await hasStructuralChildren(r.id, authHeader);
        // A row the site tree doesn't know still gets the same vetting as
        // everywhere else: only meters the inventory knows (household-mapped).
        const ids: Set<string> = node
          ? await memberIds(node, [r], ctx, authHeader)
          : new Set<string>(
              (r.meters || []).map((m: any) => m.meterId).filter((id: string) => id && ctx.inv.byMeter.has(id))
            );
        const totals = summarize(ids, embeddedOf([r]), ctx);
        return {
          id: String(r.id),
          name: node?.name || r.name,
          level: node?.level ?? null,
          parentId: parentIdParam,
          parentName: node?.parentName ?? null,
          hasChildren: childCount,
          meterCount: ids.size,
          ...totals,
          dataTimestamp: freshness(r.timestamp, ctx),
        };
      })
    );
    const parentNode = await getNode(parentId, authHeader);
    if (parentNode && rows.length > 0) {
      const others = await computeOthers(parentNode, rows, ctx, authHeader);
      if (others) results.push(othersNodeRow(parentNode, others.totals, ctx));
    }
    return res.json(results);
  } catch (err: any) {
    return sendError(res, 'load dashboard nodes', err);
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
    if (req.params.nodeId.startsWith(OTHERS_ID_PREFIX)) {
      const parentKey = req.params.nodeId.slice(OTHERS_ID_PREFIX.length);
      const parentChain = Number.isFinite(Number(parentKey))
        ? await getAncestorChain(Number(parentKey), req.headers.authorization)
        : [];
      return res.json([
        ...parentChain.map((n) => ({ id: String(n.id), name: n.name, level: n.level })),
        { id: req.params.nodeId, name: OTHERS_NAME, level: null },
      ]);
    }
    const nodeId = Number(req.params.nodeId);
    if (!Number.isFinite(nodeId)) return res.json([]);
    const chain = await getAncestorChain(nodeId, req.headers.authorization);
    return res.json(chain.map((n) => ({ id: String(n.id), name: n.name, level: n.level })));
  } catch (err: any) {
    return sendError(res, 'resolve node ancestors', err);
  }
});

/**
 * GET /api/dashboard/nodes/:nodeId/meters
 * Returns the meters under this node: those embedded in its row of its
 * PARENT's dma-report (the node's own call returns its children instead), plus
 * any assets the inventory attaches to the node. For a node id of the form
 * `others:<parentId>` it returns the meters under that parent that no real
 * child lists. Consumer details come from the DMA report or, where that
 * doesn't list a meter, the asset inventory's household.
 */
router.get('/nodes/:nodeId/meters', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const ctx = await loadCtx(authHeader);

    if (req.params.nodeId.startsWith(OTHERS_ID_PREFIX)) {
      const parent = await getNode(Number(req.params.nodeId.slice(OTHERS_ID_PREFIX.length)), authHeader);
      if (!parent) return res.json([]);
      const childRows = await fetchRealDmaReport(parent.id, authHeader);
      const others = await computeOthers(parent, childRows, ctx, authHeader);
      return res.json((others?.ids ?? []).map((id) => toMeterRow(id, others!.emb, ctx)));
    }

    const nodeId = Number(req.params.nodeId);
    if (!Number.isFinite(nodeId)) return res.json([]);

    const node = await getNode(nodeId, authHeader);
    if (!node) return res.json([]);

    if (node.parentId == null) {
      // A top-level site with children shows them (and its "Others"); one
      // without carries its meters directly.
      if (await hasStructuralChildren(nodeId, authHeader)) return res.json([]);
    }

    const own = await ownEmbeddedRows(node, authHeader);
    const ids = await memberIds(node, own, ctx, authHeader);
    const emb = embeddedOf(own);
    return res.json([...ids].map((id) => toMeterRow(id, emb, ctx)));
  } catch (err: any) {
    return sendError(res, 'load node meters', err);
  }
});

export default router;
