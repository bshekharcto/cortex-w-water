import { pool } from '../db/pool.js';
import { proxyUpstream } from './upstreamProxy.js';

/**
 * The Dashboard (district -> zone -> DMA ...) served from Postgres.
 *
 *   structure   site_metadata   (mirror of MySQL, filled by the cortex scheduler WaterMetaDataSyncScheduler)
 *   meters      meter_metadata  (same)
 *   readings    water_meter_daily (each meter's last reading and water used per day, kept current by the cortex history
 *               scheduler) and water_meter_latest (the newest frame of each meter)
 *
 * What a user may see is still decided by the beta API (GET /api/site/ with the user's own token returns only the sites
 * that user can open). That one small call is the only upstream dependency; every number comes from Postgres.
 * Without a token, or when the beta does not answer, nothing is shown (fail closed).
 *
 * The numbers follow the beta DMA report: a meter is CONNECTED when its last frame arrived today (site time zone),
 * DISCONNECTED when it arrived earlier, NEVER_SEEN when there is no frame. Flow of a day = the last reading of that
 * day minus the last reading of the previous day that has one, if that was at most 7 days earlier; the scheduler works that
 * out once, when the readings arrive, and stores it as used_kl in water_meter_daily. today / yesterday / month-to-date are
 * sums of those. A day with no usable earlier reading counts as zero.
 */

// readings are stored in UTC; every day, month and clock time shown follows the time zone of the site (site_metadata.tz_sql)
const DEFAULT_ZONE = 'UTC';
const SNAPSHOT_TTL_MS = 60 * 1000;
const ALLOWED_TTL_MS = 5 * 60 * 1000;
const ALLOWED_CACHE_MAX = 50;

export type Connectivity = 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN';

export interface SiteNode {
  id: number;
  name: string;
  level: number | null;
  parentId: number | null;
  parentName: string | null;
  timeZone: string; // a zone Postgres reads correctly, e.g. "UTC-05:30" (5 h 30 min east) or "Asia/Kolkata"
}

export interface DashboardMeter {
  assetId: number;
  meterId: string;
  siteId: number | null;
  devEui: string | null;
  consumerId: string | null;
  consumerName: string | null;
  address: string | null;
  totalizerKl: number;
  decodedAt: string | null;
  decodedLocal: string | null; // the same moment as clock time at the meter's site: "2026-10-08 17:38:01"
  connectivity: Connectivity;
  yesterdayKl: number;
  todayKl: number;
  monthKl: number;
}

interface NodeTotals {
  meters: DashboardMeter[];
  connected: number;
  disconnected: number;
  neverSeen: number;
  yesterdayKl: number;
  todayKl: number;
  monthKl: number;
}

interface Snapshot {
  builtAt: number;
  nowLocal: Map<string, string>; // zone -> the clock time there when the snapshot was built
  sites: Map<number, SiteNode>;
  childrenOf: Map<number, number[]>;
  totals: Map<number, NodeTotals>;
}

const METERS_SQL = `
  WITH mt AS (
    -- each meter's time zone is the one of its site
    SELECT m.meter_id, COALESCE(s.tz_sql, 'UTC') AS tz
    FROM meter_metadata m
    LEFT JOIN site_metadata s ON s.site_id = m.site_id
    WHERE m.is_active
  ),
  mtd AS (
    SELECT meter_id, tz, (NOW() AT TIME ZONE tz)::date AS today FROM mt
  ),
  -- water_meter_daily (kept current by the cortex history scheduler) holds the water each meter used per day, so the
  -- flows are a small sum, not a pass over the readings
  flows AS (
    SELECT w.meter_id,
           COALESCE(SUM(w.used_kl) FILTER (WHERE w.day = d.today), 0)     AS today_kl,
           COALESCE(SUM(w.used_kl) FILTER (WHERE w.day = d.today - 1), 0) AS yesterday_kl,
           COALESCE(SUM(w.used_kl) FILTER (WHERE w.day >= date_trunc('month', d.today)::date), 0) AS month_kl
    FROM water_meter_daily w
    JOIN mtd d ON d.meter_id = w.meter_id
    WHERE w.day >= LEAST(date_trunc('month', d.today)::date, d.today - 1)
    GROUP BY w.meter_id, d.today
  )
  SELECT m.meter_id, m.asset_id, m.site_id, m.household_custom_id, m.consumer_name, m.address,
         l.dev_eui, l.decoded_at, COALESCE(l.forward_flow_kl, 0) AS totalizer_kl,
         to_char(l.decoded_at AT TIME ZONE d.tz, 'YYYY-MM-DD HH24:MI:SS') AS decoded_local,
         CASE
           WHEN l.decoded_at IS NULL THEN 'NEVER_SEEN'
           WHEN (l.decoded_at AT TIME ZONE d.tz)::date = d.today THEN 'CONNECTED'
           ELSE 'DISCONNECTED'
         END AS connectivity,
         COALESCE(f.yesterday_kl, 0) AS yesterday_kl, COALESCE(f.today_kl, 0) AS today_kl,
         COALESCE(f.month_kl, 0) AS month_kl
  FROM meter_metadata m
  JOIN mtd d ON d.meter_id = m.meter_id
  LEFT JOIN water_meter_latest l ON l.meter_id = m.meter_id
  LEFT JOIN flows f  ON f.meter_id = m.meter_id
  WHERE m.is_active
`;

let snapshot: Snapshot | null = null;
let snapshotBuild: Promise<Snapshot> | null = null;

function emptyTotals(): NodeTotals {
  return { meters: [], connected: 0, disconnected: 0, neverSeen: 0, yesterdayKl: 0, todayKl: 0, monthKl: 0 };
}

function totalsOf(meters: DashboardMeter[]): NodeTotals {
  const t = emptyTotals();
  for (const m of meters) {
    t.meters.push(m);
    if (m.connectivity === 'CONNECTED') t.connected++;
    else if (m.connectivity === 'DISCONNECTED') t.disconnected++;
    else t.neverSeen++;
    t.yesterdayKl += m.yesterdayKl;
    t.todayKl += m.todayKl;
    t.monthKl += m.monthKl;
  }
  return t;
}

// A node that has sub-areas AND meters assigned straight to it (not to any sub-area) gets one extra row for those
// meters, "own-<id>", so they can be reached and the page's totals add up to the whole node.
const OWN_PREFIX = 'own-';
const OWN_NAME = 'Not in a sub-area';

function parseNodeRef(ref: string | number): { id: number; own: boolean } | null {
  const text = String(ref);
  const own = text.startsWith(OWN_PREFIX);
  const id = Number(own ? text.slice(OWN_PREFIX.length) : text);
  return Number.isFinite(id) ? { id, own } : null;
}

function directMeters(snap: Snapshot, siteId: number): DashboardMeter[] {
  return (snap.totals.get(siteId)?.meters ?? []).filter((m) => m.siteId === siteId);
}

/** The site and every site below it. */
function subtreeSiteIds(snap: Snapshot, siteId: number): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  const stack = [siteId];
  while (stack.length) {
    const current = stack.pop()!;
    if (seen.has(current) || !snap.sites.has(current)) continue;
    seen.add(current);
    ids.push(current);
    stack.push(...(snap.childrenOf.get(current) ?? []));
  }
  return ids;
}

async function buildSnapshot(): Promise<Snapshot> {
  const [siteRes, meterRes, zoneRes] = await Promise.all([
    pool.query(`SELECT site_id, name, level, parent_site_id, tz_sql FROM site_metadata WHERE is_active`),
    pool.query(METERS_SQL),
    pool.query(
      `SELECT tz, to_char(NOW() AT TIME ZONE tz, 'YYYY-MM-DD HH24:MI:SS') AS local
       FROM (SELECT DISTINCT tz_sql AS tz FROM site_metadata WHERE is_active) z`
    ),
  ]);
  const nowLocal = new Map<string, string>(zoneRes.rows.map((r: any) => [r.tz, r.local]));

  const sites = new Map<number, SiteNode>();
  for (const r of siteRes.rows) {
    sites.set(Number(r.site_id), {
      id: Number(r.site_id),
      name: r.name,
      level: r.level,
      parentId: r.parent_site_id != null ? Number(r.parent_site_id) : null,
      parentName: null,
      timeZone: r.tz_sql || DEFAULT_ZONE,
    });
  }
  const childrenOf = new Map<number, number[]>();
  for (const node of sites.values()) {
    if (node.parentId != null && sites.has(node.parentId)) {
      node.parentName = sites.get(node.parentId)!.name;
      if (!childrenOf.has(node.parentId)) childrenOf.set(node.parentId, []);
      childrenOf.get(node.parentId)!.push(node.id);
    } else {
      node.parentId = null; // its parent is not in the mirror: treat it as a top-level site
    }
  }

  // every meter counts in its own site and in every site above it
  const totals = new Map<number, NodeTotals>();
  for (const r of meterRes.rows) {
    const meter: DashboardMeter = {
      assetId: Number(r.asset_id),
      meterId: r.meter_id,
      siteId: r.site_id != null ? Number(r.site_id) : null,
      devEui: r.dev_eui ?? null,
      consumerId: r.household_custom_id ?? null,
      consumerName: r.consumer_name ?? null,
      address: r.address ?? null,
      totalizerKl: Number(r.totalizer_kl) || 0,
      decodedAt: r.decoded_at ? new Date(r.decoded_at).toISOString() : null,
      decodedLocal: r.decoded_local ?? null,
      connectivity: r.connectivity,
      yesterdayKl: Number(r.yesterday_kl) || 0,
      todayKl: Number(r.today_kl) || 0,
      monthKl: Number(r.month_kl) || 0,
    };

    const seen = new Set<number>();
    let siteId: number | null = meter.siteId;
    while (siteId != null && sites.has(siteId) && !seen.has(siteId)) {
      seen.add(siteId);
      let t = totals.get(siteId);
      if (!t) {
        t = emptyTotals();
        totals.set(siteId, t);
      }
      t.meters.push(meter);
      if (meter.connectivity === 'CONNECTED') t.connected++;
      else if (meter.connectivity === 'DISCONNECTED') t.disconnected++;
      else t.neverSeen++;
      t.yesterdayKl += meter.yesterdayKl;
      t.todayKl += meter.todayKl;
      t.monthKl += meter.monthKl;
      siteId = sites.get(siteId)!.parentId;
    }
  }

  return { builtAt: Date.now(), nowLocal, sites, childrenOf, totals };
}

function startBuild(): Promise<Snapshot> {
  // one build at a time: requests that arrive meanwhile share it
  if (!snapshotBuild) {
    snapshotBuild = buildSnapshot()
      .then((s) => {
        snapshot = s;
        return s;
      })
      .finally(() => {
        snapshotBuild = null;
      });
  }
  return snapshotBuild;
}

/**
 * The snapshot is rebuilt at most once a minute. A request that finds an older one gets it at once while the new one is
 * built in the background, so only the very first request after a restart waits for the build.
 */
async function getSnapshot(): Promise<Snapshot> {
  if (!snapshot) return startBuild();
  if (Date.now() - snapshot.builtAt >= SNAPSHOT_TTL_MS) {
    startBuild().catch((err) => console.warn('[dashboard] Snapshot refresh failed, serving the previous one:', err?.message || err));
  }
  return snapshot;
}

// ---------------------------------------------------------------------------
// Who may see what: the beta's own answer for this user's token, cached per token
// ---------------------------------------------------------------------------

const allowedCache = new Map<string, { at: number; ids: Set<number> }>();

/** The beta no longer accepts the caller's token: they have to sign in again. Routes answer it with a 401. */
export class SessionExpiredError extends Error {
  constructor() {
    super('The upstream session has expired');
    this.name = 'SessionExpiredError';
  }
}

export async function getAllowedSiteIds(authHeader?: string): Promise<Set<number>> {
  if (!authHeader || authHeader.length < 10) return new Set();

  const cached = allowedCache.get(authHeader);
  if (cached && Date.now() - cached.at < ALLOWED_TTL_MS) return cached.ids;

  const upstream = await proxyUpstream('GET', '/api/site/', { headers: { Authorization: authHeader } }).catch(
    (err: any) => {
      console.warn('[dashboard] The beta /api/site/ could not be reached:', err?.message || err);
      return { status: 0, data: null };
    }
  );
  if (upstream.status === 401 || upstream.status === 403) {
    console.warn(`[dashboard] The beta /api/site/ refused the token (${upstream.status}); the user has to sign in again`);
    throw new SessionExpiredError();
  }
  if (upstream.status !== 200) {
    console.warn(`[dashboard] The beta /api/site/ answered ${upstream.status}; no sites are shown`);
  }
  const ids = new Set<number>();
  if (upstream.status === 200 && Array.isArray(upstream.data)) {
    for (const r of upstream.data as any[]) {
      if (typeof r?.id === 'number') ids.add(r.id);
    }
  }
  if (ids.size > 0) {
    if (allowedCache.size >= ALLOWED_CACHE_MAX) allowedCache.delete(allowedCache.keys().next().value as string);
    allowedCache.set(authHeader, { at: Date.now(), ids });
  }
  return ids;
}

// ---------------------------------------------------------------------------
// What the routes need
// ---------------------------------------------------------------------------

export interface NodeSummary {
  id: string;
  name: string;
  level: number | null;
  parentId: string | null;
  parentName: string | null;
  hasChildren: boolean;
  meterCount: number;
  totalDevices: number;
  connected: number;
  disconnected: number;
  neverSeen: number;
  yesterdayFlowM3: number;
  todayFlowM3: number;
  monthToDateFlowM3: number;
  dataTimestamp: string;
  dataLocalTime: string; // when the numbers were built, as clock time at the area's site
}

const round2 = (n: number) => Number(n.toFixed(2));

function summarize(snap: Snapshot, node: SiteNode, allowed: Set<number>, parentIdParam: string | null): NodeSummary {
  return summaryOf(snap, node.id, node.name, node.level, node.parentName, snap.totals.get(node.id) ?? emptyTotals(), {
    parentIdParam,
    hasChildren: (snap.childrenOf.get(node.id) ?? []).some((c) => allowed.has(c)),
    zone: node.timeZone,
  });
}

function summaryOf(
  snap: Snapshot,
  id: number | string,
  name: string,
  level: number | null,
  parentName: string | null,
  t: NodeTotals,
  opts: { parentIdParam: string | null; hasChildren: boolean; zone: string }
): NodeSummary {
  return {
    id: String(id),
    name,
    level,
    parentId: opts.parentIdParam,
    parentName,
    hasChildren: opts.hasChildren,
    meterCount: t.meters.length,
    totalDevices: t.meters.length,
    connected: t.connected,
    disconnected: t.disconnected,
    neverSeen: t.neverSeen,
    yesterdayFlowM3: round2(t.yesterdayKl),
    todayFlowM3: round2(t.todayKl),
    monthToDateFlowM3: round2(t.monthKl),
    dataTimestamp: new Date(snap.builtAt).toISOString(),
    dataLocalTime: snap.nowLocal.get(opts.zone) ?? new Date(snap.builtAt).toISOString().slice(0, 19).replace('T', ' '),
  };
}

/** The direct children of `parentId`, or the top-level sites when it is null. Each carries its whole subtree's totals. */
export async function getNodeChildren(parentRef: string | null, authHeader?: string): Promise<NodeSummary[]> {
  const allowed = await getAllowedSiteIds(authHeader);
  if (allowed.size === 0) return [];
  const snap = await getSnapshot();

  const parsed = parentRef == null ? null : parseNodeRef(parentRef);
  if (parentRef != null && (!parsed || parsed.own)) return []; // a "not in a sub-area" row has nothing below it
  const parentId = parsed ? parsed.id : null;

  let nodes: SiteNode[];
  if (parentId == null) {
    nodes = [...snap.sites.values()].filter((n) => allowed.has(n.id) && (n.parentId == null || !allowed.has(n.parentId)));
  } else {
    if (!allowed.has(parentId)) return [];
    nodes = (snap.childrenOf.get(parentId) ?? []).map((id) => snap.sites.get(id)!).filter((n) => allowed.has(n.id));
  }
  nodes.sort((a, b) => a.name.localeCompare(b.name));
  const rows = nodes.map((n) => summarize(snap, n, allowed, parentId == null ? null : String(parentId)));

  const parent = parentId != null ? snap.sites.get(parentId) : undefined;
  const own = parent ? directMeters(snap, parent.id) : [];
  if (parent && own.length > 0 && rows.length > 0) {
    rows.push(
      summaryOf(
        snap,
        `${OWN_PREFIX}${parent.id}`,
        OWN_NAME,
        parent.level != null ? parent.level + 1 : null,
        parent.name,
        totalsOf(own),
        { parentIdParam: String(parent.id), hasChildren: false, zone: parent.timeZone }
      )
    );
  }
  return rows;
}

/** Every meter in the subtree of `nodeId` (the Dashboard asks for this only at the last level). */
export async function getNodeMeters(nodeRef: string, authHeader?: string): Promise<DashboardMeter[]> {
  const ref = parseNodeRef(nodeRef);
  if (!ref) return [];
  const allowed = await getAllowedSiteIds(authHeader);
  if (!allowed.has(ref.id)) return [];
  const snap = await getSnapshot();
  return ref.own ? directMeters(snap, ref.id) : snap.totals.get(ref.id)?.meters ?? [];
}

/** Root-to-node chain of names, for the breadcrumb on a fresh page load or a pasted link. */
export async function getNodeAncestors(
  nodeRef: string,
  authHeader?: string
): Promise<Array<{ ref: string; name: string; level: number | null }>> {
  const ref = parseNodeRef(nodeRef);
  if (!ref) return [];
  const allowed = await getAllowedSiteIds(authHeader);
  if (!allowed.has(ref.id)) return [];
  const snap = await getSnapshot();
  const chain: SiteNode[] = [];
  const seen = new Set<number>();
  let current = snap.sites.get(ref.id);
  while (current && !seen.has(current.id) && allowed.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId != null ? snap.sites.get(current.parentId) : undefined;
  }
  const result = chain.map((n) => ({ ref: String(n.id), name: n.name, level: n.level }));
  if (ref.own && chain.length > 0) {
    const last = chain[chain.length - 1];
    result.push({ ref: `${OWN_PREFIX}${last.id}`, name: OWN_NAME, level: last.level != null ? last.level + 1 : null });
  }
  return result;
}

/**
 * The site ids a Command Center site filter covers: each site in `siteId` (one id, or several separated by commas) and
 * everything below it. `null` = no filter ("ALL"). An empty list means the caller may see none of them, so the caller
 * must show nothing. A site the caller may not open is left out of the others.
 */
export async function resolveSiteScope(siteId: string | undefined, authHeader?: string): Promise<number[] | null> {
  if (!siteId || siteId === 'ALL') return null;
  const requested = siteId
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n));
  if (requested.length === 0) return [];
  const allowed = await getAllowedSiteIds(authHeader);
  const snap = await getSnapshot();
  const ids = new Set<number>();
  for (const id of requested) {
    if (!allowed.has(id)) continue;
    subtreeSiteIds(snap, id).forEach((s) => ids.add(s));
  }
  return [...ids];
}

export interface SiteOption {
  id: string;
  name: string;            // the plain site name
  parentId: string | null; // the nearest site above it that the caller may see, null for a top-level one
  label: string;           // the name drawn as a tree line: "├─ Satyanagar", "│  └─ DMA 1" (non-breaking spaces)
}

/** The sites the caller may filter by, depth first, each with its place in the tree drawn into `label`. */
export async function getSiteOptions(authHeader?: string): Promise<SiteOption[]> {
  const allowed = await getAllowedSiteIds(authHeader);
  if (allowed.size === 0) return [];
  const snap = await getSnapshot();
  const NBSP = '\u00A0';
  const options: SiteOption[] = [];
  const byName = (a: SiteNode, b: SiteNode) => a.name.localeCompare(b.name);

  // guides = the vertical lines of the ancestors that still have siblings below; a site the caller may not see is
  // skipped, and its children are drawn as top-level lines
  const visit = (
    node: SiteNode,
    guides: string,
    isLast: boolean,
    drawn: boolean,
    seen: Set<number>,
    parentOption: string | null
  ) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    const isAllowed = allowed.has(node.id);
    if (isAllowed) {
      const line = drawn ? `${guides}${isLast ? '└─ ' : '├─ '}` : '';
      options.push({
        id: String(node.id),
        name: node.name,
        parentId: parentOption,
        label: `${line}${node.name}`.replace(/ /g, NBSP),
      });
    }
    const kids = (snap.childrenOf.get(node.id) ?? []).map((k) => snap.sites.get(k)!).filter(Boolean).sort(byName);
    const childGuides = isAllowed && drawn ? `${guides}${isLast ? '   ' : '│  '}` : '';
    kids.forEach((kid, i) =>
      visit(kid, childGuides, i === kids.length - 1, isAllowed, seen, isAllowed ? String(node.id) : parentOption)
    );
  };

  const roots = [...snap.sites.values()].filter((n) => n.parentId == null).sort(byName);
  const seen = new Set<number>();
  roots.forEach((root) => visit(root, '', true, false, seen, null));
  return options;
}

// ---------------------------------------------------------------------------
// Consumption trend (the chart icon) and boundaries (the map icon)
// ---------------------------------------------------------------------------

export type TrendMode = 'DAILY' | 'MONTHLY';

export interface TrendPoint {
  label: string;        // 2026-10-08 (daily) or 2026-10 (monthly)
  consumption: number;  // KL used in that day / month, all meters of the node together
  reading: number;      // sum of the meters' last reading of that day / month (KL)
}

const TREND_TTL_MS = 5 * 60 * 1000;
const trendCache = new Map<string, { at: number; points: TrendPoint[] }>();

/**
 * Consumption of everything under a node, like the beta's consumption trend. DAILY: the last `days` days (1-90, default
 * 30); MONTHLY: the last 12 months. A meter's use on a day = its last reading of that day minus its last reading of the
 * previous day that has one (looking back a week before the window); only days with data appear.
 * Resolves to null when the caller may not see the node.
 */
export async function getNodeTrend(
  nodeRef: string,
  mode: TrendMode,
  days: number,
  authHeader?: string
): Promise<TrendPoint[] | null> {
  const ref = parseNodeRef(nodeRef);
  if (!ref) return [];
  const allowed = await getAllowedSiteIds(authHeader);
  if (!allowed.has(ref.id)) return null;

  const span = mode === 'MONTHLY' ? 0 : Math.max(1, Math.min(Math.floor(days) || 30, 90));
  const key = `${nodeRef}|${mode}|${span}`;
  const cached = trendCache.get(key);
  if (cached && Date.now() - cached.at < TREND_TTL_MS) return cached.points;

  const snap = await getSnapshot();
  const siteIds = ref.own ? [ref.id] : subtreeSiteIds(snap, ref.id);
  if (siteIds.length === 0) return [];
  const zone = snap.sites.get(ref.id)?.timeZone ?? DEFAULT_ZONE; // the days of the chart are the days at the node's site

  // water_meter_daily holds each meter's last reading and the water it used, per day (the days at the meter's site)
  const res =
    mode === 'MONTHLY'
      ? await pool.query(
          `WITH mine AS (
             SELECT meter_id FROM meter_metadata WHERE is_active AND site_id = ANY($1::bigint[])
           ),
           src AS (
             SELECT w.meter_id, date_trunc('month', w.day)::date AS mon, w.used_kl, w.day
             FROM water_meter_daily w
             JOIN mine USING (meter_id)
             WHERE w.day >= (date_trunc('month', (NOW() AT TIME ZONE $2)::date) - INTERVAL '11 months')::date
           ),
           per_month AS (
             SELECT meter_id, mon, SUM(used_kl) AS used, MAX(day) AS last_day FROM src GROUP BY meter_id, mon
           )
           SELECT p.mon AS bucket, COALESCE(SUM(p.used), 0) AS consumption, COALESCE(SUM(w2.reading_kl), 0) AS reading
           FROM per_month p
           JOIN water_meter_daily w2 ON w2.meter_id = p.meter_id AND w2.day = p.last_day
           GROUP BY p.mon
           ORDER BY p.mon`,
          [siteIds, zone]
        )
      : await pool.query(
          `SELECT w.day AS bucket, COALESCE(SUM(w.used_kl), 0) AS consumption, COALESCE(SUM(w.reading_kl), 0) AS reading
           FROM water_meter_daily w
           WHERE w.day >= ((NOW() AT TIME ZONE $2)::date - ($3::int - 1))
             AND w.meter_id IN (SELECT meter_id FROM meter_metadata WHERE is_active AND site_id = ANY($1::bigint[]))
           GROUP BY w.day
           ORDER BY w.day`,
          [siteIds, zone, span]
        );

  const points: TrendPoint[] = res.rows.map((r: any) => {
    const date = new Date(r.bucket);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return {
      label: mode === 'MONTHLY' ? iso.slice(0, 7) : iso,
      consumption: round2(Number(r.consumption) || 0),
      reading: round2(Number(r.reading) || 0),
    };
  });
  if (trendCache.size > 200) trendCache.delete(trendCache.keys().next().value as string);
  trendCache.set(key, { at: Date.now(), points });
  return points;
}

export interface Boundary {
  id: string;
  name: string;
  siteId: number | null;
  points: Array<{ lat: number; lng: number }>;
}

/**
 * The zone / DMA boundary polygons under a node (geofences of kind AREA at the node and below it). Resolves to null when
 * the caller may not see the node; the "not in a sub-area" row has none.
 */
export async function getNodeBoundaries(nodeRef: string, authHeader?: string): Promise<Boundary[] | null> {
  const ref = parseNodeRef(nodeRef);
  if (!ref) return [];
  const allowed = await getAllowedSiteIds(authHeader);
  if (!allowed.has(ref.id)) return null;
  if (ref.own) return [];

  const snap = await getSnapshot();
  const res = await pool.query(
    `SELECT geofence_id, name, site_id, points
     FROM geofence_metadata
     WHERE is_active AND kind = 'AREA' AND site_id = ANY($1::bigint[])
     ORDER BY site_id, geofence_id`,
    [subtreeSiteIds(snap, ref.id)]
  );
  return res.rows
    .map((r: any) => ({
      id: String(r.geofence_id),
      name: r.name || '',
      siteId: r.site_id != null ? Number(r.site_id) : null,
      points: (Array.isArray(r.points) ? r.points : []).map((p: number[]) => ({ lat: p[0], lng: p[1] })),
    }))
    .filter((b: Boundary) => b.points.length > 0);
}

/**
 * The time zone a Command Center view is shown in: the zone most of the chosen sites are in (all sites when `siteIds` is
 * null). Sites in one deployment normally share it; with a mix the most common one wins, so a view is never cut at two
 * different midnights.
 */
export async function resolveViewTimeZone(siteIds: number[] | null): Promise<string> {
  const snap = await getSnapshot();
  const counts = new Map<string, number>();
  const sites = siteIds ? siteIds.map((id) => snap.sites.get(id)).filter(Boolean) : [...snap.sites.values()];
  for (const site of sites) counts.set(site!.timeZone, (counts.get(site!.timeZone) ?? 0) + 1);
  let best = DEFAULT_ZONE;
  let bestCount = 0;
  for (const [zone, count] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (count > bestCount) {
      best = zone;
      bestCount = count;
    }
  }
  return best;
}
