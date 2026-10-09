import { runtimeConfig } from '@/config/runtimeConfig';
import { apiRequest } from '@/services/api/httpClient';
import type { NodeRow, MeterRow } from '../models/dashboardRows';
import type { ScopeNode } from '../models/dashboardScope';
import type { Boundary, TrendMode, TrendPoint } from '../models/dashboardTrend';

// Seed mode note: the old hand-written fixtures (dashboardDrilldownSeed.ts)
// describe a fixed 2-level Zone/DMA model and don't map onto the real,
// variable-depth site tree this module now drives everything from. Rather
// than force a fake tree shape onto them, seed mode here just reports
// honestly empty until/unless someone rebuilds those fixtures to describe a
// real tree (id/name/parentId/level, same shape as cog-core-api's own
// GET /api/site/) — never a silently wrong-shaped substitute.
function isSeedMode(): boolean {
  return runtimeConfig.APP_DATA_MODE === 'seed';
}

/**
 * Fetches the direct children of a node — or the real top-level sites if
 * `parentId` is null (root/global view). Depth-agnostic: works identically
 * at every level, so however deep the real hierarchy goes, this is the only
 * function that needs calling.
 */
export async function fetchNodeChildren(parentId: string | null): Promise<NodeRow[]> {
  if (isSeedMode()) return [];
  try {
    const res = await apiRequest<NodeRow[]>('/dashboard/nodes', {
      query: parentId ? { parentId } : {},
    });
    // Real API call succeeded — even a genuinely empty result is the truth,
    // not a reason to fall back to fake data.
    if (Array.isArray(res)) return res;
  } catch (err) {
    console.warn('[dashboardDataService] Error fetching node children from API:', err);
  }
  return [];
}

export type MeterSortField =
  | 'devEui'
  | 'meterId'
  | 'consumerId'
  | 'consumerName'
  | 'totalizerM3'
  | 'latestReadingAt'
  | 'connectivityStatus';

/** The totals of a whole node: the cards above its meter list. */
export interface NodeSummaryTotals {
  totalDevices: number;
  connected: number;
  disconnected: number;
  neverSeen: number;
  yesterdayFlowM3: number;
  todayFlowM3: number;
  monthToDateFlowM3: number;
  dataLocalTime?: string; // when the scheduler last updated the numbers, clock time at the node's site
}

export interface MeterPage {
  content: MeterRow[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
  summary: NodeSummaryTotals;
}

export const EMPTY_METER_PAGE: MeterPage = {
  content: [],
  page: 0,
  size: 15,
  total: 0,
  totalPages: 0,
  summary: { totalDevices: 0, connected: 0, disconnected: 0, neverSeen: 0, yesterdayFlowM3: 0, todayFlowM3: 0, monthToDateFlowM3: 0 },
};

/**
 * One page of the meters attached to a node (only meaningful for a node with no further children — a real leaf).
 * Sorting, search and the status filter happen on the server, so only `size` rows travel. Throws when it cannot be
 * loaded, so the page can say so instead of showing an empty list as if it were the truth.
 */
export async function fetchNodeMeters(
  nodeId: string,
  opts: { page: number; size: number; sort: MeterSortField; dir: 'asc' | 'desc'; q?: string; status?: string },
  signal?: AbortSignal
): Promise<MeterPage> {
  if (isSeedMode()) return EMPTY_METER_PAGE;
  const query: Record<string, string | number> = { page: opts.page, size: opts.size, sort: opts.sort, dir: opts.dir };
  if (opts.q && opts.q.trim()) query.q = opts.q.trim();
  if (opts.status && opts.status !== 'ALL') query.status = opts.status;
  return apiRequest<MeterPage>(`/dashboard/nodes/${encodeURIComponent(nodeId)}/meters`, { query, signal });
}

/**
 * Resolves the real root-to-node name chain for a node id — needed to
 * render the breadcrumb correctly on a fresh page load or a pasted deep
 * link, where the frontend hasn't navigated there via clicks and so doesn't
 * have the intermediate names cached.
 */
export async function fetchNodeAncestors(nodeId: string): Promise<ScopeNode[]> {
  if (isSeedMode()) return [];
  try {
    const res = await apiRequest<Array<{ id: string; name: string }>>(
      `/dashboard/nodes/${encodeURIComponent(nodeId)}/ancestors`
    );
    if (Array.isArray(res)) return res.map((n) => ({ id: n.id, name: n.name }));
  } catch (err) {
    console.warn('[dashboardDataService] Error resolving node ancestors from API:', err);
  }
  return [];
}

/**
 * Consumption of everything under an area, day by day (the last `days` days) or month by month (the last 12 months).
 * Throws when it cannot be loaded, so the dialog can say so instead of showing an empty chart as if it were the truth.
 */
export async function fetchNodeTrend(nodeId: string, mode: TrendMode, days: number): Promise<TrendPoint[]> {
  const res = await apiRequest<TrendPoint[]>(`/dashboard/nodes/${encodeURIComponent(nodeId)}/trend`, {
    query: mode === 'MONTHLY' ? { mode } : { mode, days },
  });
  return Array.isArray(res) ? res : [];
}

/** The zone / DMA boundary polygons under an area. Throws when they cannot be loaded. */
export async function fetchNodeBoundaries(nodeId: string): Promise<Boundary[]> {
  const res = await apiRequest<Boundary[]>(`/dashboard/nodes/${encodeURIComponent(nodeId)}/boundaries`);
  return Array.isArray(res) ? res : [];
}
