import { Router, type Response } from 'express';
import { fetchUpstreamOrThrow, UpstreamError } from '../services/upstreamProxy.js';
import { singleFlight } from '../services/inflight.js';
import { getAuthToken } from './gis.js';
import {
  getRoots,
  getAllNodes,
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
import { pageMeters, parseMeterQuery } from '../services/meterPage.js';

const router = Router();

/**
 * Warm the sources (meter inventory snapshot from Postgres, telemetry scan,
 * and every node's DMA report) so the first dashboard load isn't the one that
 * pays for them. Called once from the long-running server's startup, not at
 * import, so serverless cold starts (which only import the app) don't each
 * trigger a full load.
 */
export function warmDashboardCaches(): void {
  const warn = (what: string) => (err: any) => console.warn(`[dashboard] ${what} warm-up failed:`, err?.message || err);
  getInventory().catch(warn('Inventory'));
  getMeterFacts().catch(warn('Telemetry'));
  getAllNodes()
    .then((nodes) => Promise.all(nodes.map((n) => fetchRealDmaReport(n.id).catch(warn(`DMA report ${n.id}`)))))
    .catch(warn('Site tree'));
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
// upstream DMA report, which takes 1-10s to fetch. It is stale-while-
// revalidate: inside FRESH it is served as is; past that (up to STALE_MAX) the
// cached copy is still served instantly while a refresh runs in the
// background, so no request waits for upstream except the very first. A failed
// fetch throws (UpstreamError) and is never cached — an outage must surface,
// not be passed off as "this node has zero devices" — except that a failed
// background refresh simply leaves the stale copy to be retried.
interface CachedDmaReport {
  timestamp: number;
  rows: any[];
}
const dmaReportCache = new Map<number, CachedDmaReport>();
const dmaReportInflight = new Map<number, Promise<any[]>>();
const DMA_REPORT_FRESH_MS = 60 * 1000;
const DMA_REPORT_STALE_MAX_MS = 10 * 60 * 1000;

function fetchRealDmaReport(siteId: number, authHeader?: string): Promise<any[]> {
  const cached = dmaReportCache.get(siteId);
  const age = cached ? Date.now() - cached.timestamp : Infinity;
  if (cached && age < DMA_REPORT_FRESH_MS) return Promise.resolve(cached.rows);

  // Concurrent requests for the same node share one (large) upstream fetch.
  const refresh = singleFlight(dmaReportInflight, siteId, () => loadDmaReport(siteId, authHeader));
  if (cached && age < DMA_REPORT_STALE_MAX_MS) {
    refresh.catch((err) =>
      console.warn(`[dashboard] Background refresh of DMA report ${siteId} failed, serving stale:`, err?.message || err)
    );
    return Promise.resolve(cached.rows);
  }
  return refresh;
}

async function loadDmaReport(siteId: number, authHeader?: string): Promise<any[]> {
  const token = await getAuthToken(authHeader);
  const headers: Record<string, string> = token ? { Authorization: token } : {};
  const path = `/api/water/dma-report/zones/${siteId}`;
  const data = await fetchUpstreamOrThrow('GET', path, { headers });
  if (!Array.isArray(data)) throw new UpstreamError(path, 200, 'response was not a list');
  // An empty list is a legitimate answer (a leaf node has no children), and
  // is cached too so opening a leaf doesn't cost an upstream round trip.
  dmaReportCache.set(siteId, { timestamp: Date.now(), rows: data });
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
  const [inv, facts] = await Promise.all([getInventory(), getMeterFacts()]);
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

interface NodeRowOut {
  id: string;
  name: string;
  level: number | null;
  parentId: string | null;
  parentName: string | null;
  hasChildren: boolean;
  synthetic?: boolean;
  meterCount: number;
  dataTimestamp: string;
  totalDevices: number;
  connected: number;
  disconnected: number;
  neverSeen: number;
  yesterdayFlowM3: number;
  todayFlowM3: number;
  monthToDateFlowM3: number;
}

function buildNodeRow(
  node: SiteNode,
  parentId: string | null,
  ids: Set<string>,
  emb: Map<string, any>,
  hasChildren: boolean,
  reportTimestamp: string | undefined,
  ctx: Ctx
): NodeRowOut {
  return {
    id: String(node.id),
    name: node.name,
    level: node.level ?? null,
    parentId,
    parentName: parentId === null ? null : node.parentName ?? null,
    hasChildren,
    meterCount: ids.size,
    ...summarize(ids, emb, ctx),
    dataTimestamp: freshness(reportTimestamp, ctx),
  };
}

/** A top-level site: every meter attached to it or listed under any child, including ones attached straight to the site (which the DMA report never lists). */
async function rootRow(root: SiteNode, ctx: Ctx, authHeader?: string): Promise<NodeRowOut> {
  const rows = await fetchRealDmaReport(root.id, authHeader);
  const [hasChildren, ids] = await Promise.all([
    hasStructuralChildren(root.id, authHeader),
    memberIds(root, rows, ctx, authHeader),
  ]);
  return buildNodeRow(root, null, ids, embeddedOf(rows), hasChildren, rows[0]?.timestamp, ctx);
}

/** A row of the DMA report of `parentId`, as a node row. */
async function childRow(parentId: string, r: any, ctx: Ctx, authHeader?: string): Promise<NodeRowOut> {
  const node = await getNode(r.id, authHeader);
  const hasChildren = await hasStructuralChildren(r.id, authHeader);
  const emb = embeddedOf([r]);
  if (!node) {
    // A row the site tree doesn't know still gets the same vetting as
    // everywhere else: only meters the inventory knows (household-mapped).
    const ids = new Set<string>(
      (r.meters || []).map((m: any) => m.meterId).filter((id: string) => id && ctx.inv.byMeter.has(id))
    );
    return buildNodeRow(
      { id: r.id, name: r.name, level: 0, parentId: null, parentName: null },
      parentId, ids, emb, hasChildren, r.timestamp, ctx
    );
  }
  const ids = await memberIds(node, [r], ctx, authHeader);
  return buildNodeRow(node, parentId, ids, emb, hasChildren, r.timestamp, ctx);
}

/** The direct children of `parent` (its DMA-report rows) plus the synthetic "Others" group when some meters sit under no real child. */
async function childrenOf(parent: SiteNode, ctx: Ctx, authHeader?: string): Promise<NodeRowOut[]> {
  const rows = await fetchRealDmaReport(parent.id, authHeader);
  const children = await Promise.all(rows.map((r: any) => childRow(String(parent.id), r, ctx, authHeader)));
  if (rows.length > 0) {
    const others = await computeOthers(parent, rows, ctx, authHeader);
    if (others) children.push(othersNodeRow(parent, others.totals, ctx));
  }
  return children;
}

function meterPageOf(ids: Iterable<string>, emb: Map<string, any>, ctx: Ctx, query: Record<string, unknown>) {
  const rows = [...ids].map((id) => toMeterRow(id, emb, ctx));
  return pageMeters(rows, parseMeterQuery(query));
}

function crumb(n: SiteNode) {
  return { id: String(n.id), name: n.name, level: n.level };
}

/**
 * GET /api/dashboard/view?nodeId=<id|others:<id>>   (omit nodeId for the root)
 *     &page=&size=&search=&status=&sort=&dir=        (meter-list paging, leaves only)
 *
 * Everything the Dashboard needs to draw one screen, in a single round trip:
 *   ancestors  root-to-node breadcrumb
 *   node       this node's own row (totals, flows, hasChildren); null at the root
 *   children   its direct child rows (incl. the synthetic "Others" row)
 *   isLeaf     true when it has no children, so its meters are shown instead
 *   meters     for a leaf, ONE page of its meters (search/status/sort applied
 *              here) plus the unfiltered status counts; null otherwise
 * Works at any depth — the site tree, not this code, decides how deep it goes.
 */
router.get('/view', async (req, res) => {
  const authHeader = req.headers.authorization;
  const nodeIdParam = String(req.query.nodeId ?? '').trim();

  try {
    const ctx = await loadCtx(authHeader);

    // Root: the real top-level sites.
    if (!nodeIdParam || nodeIdParam === 'root') {
      const roots = await getRoots(authHeader);
      const children = await Promise.all(roots.map((r) => rootRow(r, ctx, authHeader)));
      return res.json({ ancestors: [], node: null, children, isLeaf: false, meters: null });
    }

    // "Others" of a parent: a synthetic leaf holding the meters no real child lists.
    if (nodeIdParam.startsWith(OTHERS_ID_PREFIX)) {
      const parent = await getNode(Number(nodeIdParam.slice(OTHERS_ID_PREFIX.length)), authHeader);
      if (!parent) return res.status(404).json({ error: 'NOT_FOUND', message: 'Unknown area.' });
      const childRows = await fetchRealDmaReport(parent.id, authHeader);
      const others = await computeOthers(parent, childRows, ctx, authHeader);
      const ids = others?.ids ?? [];
      const emb = others?.emb ?? new Map<string, any>();
      const chain = (await getAncestorChain(parent.id, authHeader)).map(crumb);
      return res.json({
        ancestors: [...chain, { id: nodeIdParam, name: OTHERS_NAME, level: null }],
        node: othersNodeRow(parent, others?.totals ?? summarize([], emb, ctx), ctx),
        children: [],
        isLeaf: true,
        meters: meterPageOf(ids, emb, ctx, req.query),
      });
    }

    const nodeId = Number(nodeIdParam);
    const node = Number.isFinite(nodeId) ? await getNode(nodeId, authHeader) : null;
    if (!node) return res.status(404).json({ error: 'NOT_FOUND', message: 'Unknown area.' });

    const [ancestors, children, hasStructural, own] = await Promise.all([
      getAncestorChain(node.id, authHeader),
      childrenOf(node, ctx, authHeader),
      hasStructuralChildren(node.id, authHeader),
      ownEmbeddedRows(node, authHeader),
    ]);

    // This node's own row: for a top-level site from its own report, otherwise
    // from its row in its parent's report (which is where its totals live).
    const nodeRow =
      node.parentId == null
        ? await rootRow(node, ctx, authHeader)
        : own[0]
        ? await childRow(String(node.parentId), own[0], ctx, authHeader)
        : buildNodeRow(node, String(node.parentId), await memberIds(node, [], ctx, authHeader), new Map(), hasStructural, undefined, ctx);

    // Leaf: no children in the report AND none in the site tree. (A node the
    // tree says has children but whose report came back empty is NOT a leaf:
    // the client reports it as an error rather than showing a wrong meter list.)
    const isLeaf = children.length === 0 && !hasStructural;
    let meters = null;
    if (isLeaf) {
      const ids = await memberIds(node, own, ctx, authHeader);
      meters = meterPageOf(ids, embeddedOf(own), ctx, req.query);
    }
    return res.json({ ancestors: ancestors.map(crumb), node: nodeRow, children, isLeaf, meters });
  } catch (err: any) {
    return sendError(res, 'load the dashboard view', err);
  }
});

export default router;
