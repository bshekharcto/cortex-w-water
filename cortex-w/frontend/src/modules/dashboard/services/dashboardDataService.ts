import { runtimeConfig } from '@/config/runtimeConfig';
import { apiRequest } from '@/services/api/httpClient';
import type { NodeRow, MeterRow } from '../models/dashboardRows';
import type { ScopeNode } from '../models/dashboardScope';

// Every fetcher here lets failures propagate (a rejected promise) instead of
// returning an empty list: an outage must reach the UI as an error, not be
// rendered as "this node has no children / no meters". A successful but
// genuinely empty response still returns [].

// Seed mode note: the old hand-written fixtures (dashboardDrilldownSeed.ts)
// describe a fixed 2-level Zone/DMA model and don't map onto the real,
// variable-depth site tree this module now drives everything from, so seed
// mode has no dashboard data. It says so explicitly rather than showing a
// silently empty dashboard.
class DashboardDataUnavailableError extends Error {
  constructor() {
    super('The Dashboard has no data in seed mode. Set APP_DATA_MODE to "api" to load live data.');
    this.name = 'DashboardDataUnavailableError';
  }
}

function assertLiveData(): void {
  if (runtimeConfig.APP_DATA_MODE === 'seed') throw new DashboardDataUnavailableError();
}

function assertList<T>(res: unknown, what: string): T[] {
  if (!Array.isArray(res)) throw new Error(`Unexpected response while loading ${what}.`);
  return res as T[];
}

/**
 * Turns whatever a fetcher threw into text for the error banner. The HTTP
 * client throws plain UiApiError objects (not Error instances), so reading
 * `.message` alone would lose the real reason.
 */
export function describeError(err: unknown, fallback = 'Failed to load'): string {
  if (err && typeof err === 'object') {
    const e = err as { operatorMessage?: string; message?: string };
    if (e.operatorMessage) return e.operatorMessage;
    if (e.message) return e.message;
  }
  return fallback;
}

/**
 * Fetches the direct children of a node — or the real top-level sites if
 * `parentId` is null (root/global view). Depth-agnostic: works identically
 * at every level, so however deep the real hierarchy goes, this is the only
 * function that needs calling.
 */
export async function fetchNodeChildren(parentId: string | null): Promise<NodeRow[]> {
  assertLiveData();
  const res = await apiRequest<NodeRow[]>('/dashboard/nodes', {
    query: parentId ? { parentId } : {},
  });
  return assertList<NodeRow>(res, 'areas');
}

/**
 * Fetches the meters directly attached to a node (only meaningful for a
 * node with no further children — i.e. a real leaf).
 */
export async function fetchNodeMeters(nodeId: string): Promise<MeterRow[]> {
  assertLiveData();
  const res = await apiRequest<MeterRow[]>(`/dashboard/nodes/${encodeURIComponent(nodeId)}/meters`);
  return assertList<MeterRow>(res, 'meters');
}

/**
 * Resolves the real root-to-node name chain for a node id — needed to
 * render the breadcrumb correctly on a fresh page load or a pasted deep
 * link, where the frontend hasn't navigated there via clicks and so doesn't
 * have the intermediate names cached.
 */
export async function fetchNodeAncestors(nodeId: string): Promise<ScopeNode[]> {
  assertLiveData();
  const res = await apiRequest<Array<{ id: string; name: string }>>(
    `/dashboard/nodes/${encodeURIComponent(nodeId)}/ancestors`
  );
  return assertList<{ id: string; name: string }>(res, 'the breadcrumb').map((n) => ({ id: n.id, name: n.name }));
}
