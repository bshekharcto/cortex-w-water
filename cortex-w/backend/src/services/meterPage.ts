// Server-side search / filter / sort / pagination for a node's meter list.
// "Others" under BHUBANESWAR alone is ~15,000 meters (4 MB of JSON), while the
// table shows 15 at a time — so only the requested page is sent, together with
// the unfiltered status counts (which feed the KPI cards).

export type Connectivity = 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN';

export const METER_SORT_FIELDS = [
  'devEui',
  'meterId',
  'consumerId',
  'consumerName',
  'totalizerM3',
  'latestReadingAt',
  'connectivityStatus',
] as const;
export type MeterSortField = (typeof METER_SORT_FIELDS)[number];

export interface MeterQuery {
  page: number; // 0-based
  size: number;
  search: string;
  status: 'ALL' | Connectivity;
  sort: MeterSortField;
  dir: 'asc' | 'desc';
}

export interface PageableMeter {
  meterId: string;
  devEui: string | null;
  consumerId?: string;
  consumerName?: string;
  address?: string;
  totalizerM3: number | null;
  latestReadingAt?: string;
  connectivityStatus: Connectivity;
}

export interface MeterPage<T> {
  items: T[];
  /** Meters matching the search and status filter (what the pager counts). */
  total: number;
  page: number;
  pageSize: number;
  /** Unfiltered status counts for the whole node, for the KPI cards. */
  counts: { total: number; connected: number; disconnected: number; neverSeen: number };
}

const DEFAULT_SIZE = 15;
const MAX_SIZE = 200;
const STATUSES = new Set(['CONNECTED', 'DISCONNECTED', 'NEVER_SEEN']);

function first(v: unknown): string {
  return Array.isArray(v) ? String(v[0] ?? '') : v == null ? '' : String(v);
}

/** Parses and clamps the query string; anything unrecognised falls back to the table's defaults. */
export function parseMeterQuery(q: Record<string, unknown>): MeterQuery {
  const page = Number.parseInt(first(q.page), 10);
  const size = Number.parseInt(first(q.size), 10);
  const status = first(q.status).toUpperCase();
  const sort = first(q.sort);
  return {
    page: Number.isFinite(page) && page > 0 ? page : 0,
    size: Number.isFinite(size) && size > 0 ? Math.min(size, MAX_SIZE) : DEFAULT_SIZE,
    search: first(q.search).trim().toLowerCase(),
    status: STATUSES.has(status) ? (status as Connectivity) : 'ALL',
    sort: (METER_SORT_FIELDS as readonly string[]).includes(sort) ? (sort as MeterSortField) : 'devEui',
    dir: first(q.dir).toLowerCase() === 'desc' ? 'desc' : 'asc',
  };
}

function matches(m: PageableMeter, search: string): boolean {
  return (
    m.meterId.toLowerCase().includes(search) ||
    (m.devEui != null && m.devEui.toLowerCase().includes(search)) ||
    (m.consumerName != null && m.consumerName.toLowerCase().includes(search)) ||
    (m.consumerId != null && m.consumerId.toLowerCase().includes(search)) ||
    (m.address != null && m.address.toLowerCase().includes(search))
  );
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

export function pageMeters<T extends PageableMeter>(rows: T[], q: MeterQuery): MeterPage<T> {
  const counts = { total: rows.length, connected: 0, disconnected: 0, neverSeen: 0 };
  for (const m of rows) {
    if (m.connectivityStatus === 'CONNECTED') counts.connected++;
    else if (m.connectivityStatus === 'DISCONNECTED') counts.disconnected++;
    else counts.neverSeen++;
  }

  let list = rows;
  if (q.status !== 'ALL') list = list.filter((m) => m.connectivityStatus === q.status);
  if (q.search) list = list.filter((m) => matches(m, q.search));

  const sign = q.dir === 'asc' ? 1 : -1;
  const sorted = [...list].sort((a, b) => {
    const vA: unknown = a[q.sort];
    const vB: unknown = b[q.sort];
    const aEmpty = isEmpty(vA);
    const bEmpty = isEmpty(vB);
    // Missing values sort last in either direction, so real data comes first.
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
    if (!aEmpty) {
      const x = typeof vA === 'string' ? vA.toLowerCase() : (vA as number);
      const y = typeof vB === 'string' ? (vB as string).toLowerCase() : (vB as number);
      if (x < y) return -sign;
      if (x > y) return sign;
    }
    return a.meterId < b.meterId ? -1 : a.meterId > b.meterId ? 1 : 0; // stable tie-break
  });

  const lastPage = Math.max(Math.ceil(sorted.length / q.size) - 1, 0);
  const page = Math.min(q.page, lastPage);
  return {
    items: sorted.slice(page * q.size, page * q.size + q.size),
    total: sorted.length,
    page,
    pageSize: q.size,
    counts,
  };
}
