import type { NodeRow, MeterRow } from './dashboardRows';

export type StatusFilter = 'ALL' | 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN';

export type MeterSortField =
  | 'devEui'
  | 'meterId'
  | 'consumerId'
  | 'consumerName'
  | 'totalizerM3'
  | 'latestReadingAt'
  | 'connectivityStatus';

/** Paging, filtering and sorting of a leaf's meter list — all applied by the server. */
export interface MeterQueryParams {
  page: number; // 0-based
  size: number;
  search: string;
  status: StatusFilter;
  sort: MeterSortField;
  dir: 'asc' | 'desc';
}

export interface MeterCounts {
  total: number;
  connected: number;
  disconnected: number;
  neverSeen: number;
}

export interface MeterPageData {
  items: MeterRow[];
  /** Meters matching the search and status filter (what the pager counts). */
  total: number;
  page: number;
  pageSize: number;
  /** Unfiltered status counts for the whole node. */
  counts: MeterCounts;
}

export interface Crumb {
  id: string;
  name: string;
  level?: number | null;
}

/** Everything one Dashboard screen needs, from GET /dashboard/view. */
export interface DashboardView {
  ancestors: Crumb[];
  /** The node's own row (totals, flows, hasChildren); null at the root. */
  node: NodeRow | null;
  children: NodeRow[];
  /** No children, so its meters (one page of them, in `meters`) are shown instead. */
  isLeaf: boolean;
  meters: MeterPageData | null;
}
