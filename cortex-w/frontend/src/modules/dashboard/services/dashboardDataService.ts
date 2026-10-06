import { runtimeConfig } from '@/config/runtimeConfig';
import { apiRequest } from '@/services/api/httpClient';
import type { DashboardView, MeterQueryParams } from '../models/dashboardView';

// Failures propagate (a rejected promise) instead of returning an empty
// view: an outage must reach the UI as an error, not be rendered as "this
// node has no children / no meters".

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
 * One round trip for one screen: the breadcrumb, the node's own row, its
 * children, and — when it is a leaf — one page of its meters with the
 * search / status filter / sort already applied. `nodeId` null is the root
 * (the real top-level sites). Depth-agnostic: the same call serves every level.
 */
export async function fetchDashboardView(nodeId: string | null, meters: MeterQueryParams): Promise<DashboardView> {
  if (runtimeConfig.APP_DATA_MODE === 'seed') throw new DashboardDataUnavailableError();
  const view = await apiRequest<DashboardView>('/dashboard/view', {
    query: {
      nodeId: nodeId ?? undefined,
      page: meters.page,
      size: meters.size,
      search: meters.search || undefined,
      status: meters.status === 'ALL' ? undefined : meters.status,
      sort: meters.sort,
      dir: meters.dir,
    },
  });
  if (!view || !Array.isArray(view.children) || !Array.isArray(view.ancestors)) {
    throw new Error('Unexpected response while loading the dashboard.');
  }
  return view;
}
