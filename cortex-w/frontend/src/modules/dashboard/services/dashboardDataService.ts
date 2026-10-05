import { runtimeConfig } from '@/config/runtimeConfig';
import { apiRequest } from '@/services/api/httpClient';
import type { NodeRow, MeterRow } from '../models/dashboardRows';
import type { ScopeNode } from '../models/dashboardScope';

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

/**
 * Fetches the meters directly attached to a node (only meaningful for a
 * node with no further children — i.e. a real leaf).
 */
export async function fetchNodeMeters(nodeId: string): Promise<MeterRow[]> {
  if (isSeedMode()) return [];
  try {
    const res = await apiRequest<MeterRow[]>(`/dashboard/nodes/${encodeURIComponent(nodeId)}/meters`);
    if (Array.isArray(res)) return res;
  } catch (err) {
    console.warn('[dashboardDataService] Error fetching node meters from API:', err);
  }
  return [];
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
