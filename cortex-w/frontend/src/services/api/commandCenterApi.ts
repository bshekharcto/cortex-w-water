import { apiRequest } from './httpClient';
import {
  GatewayItem,
  MeterTelemetryItem,
  RawFrameItem,
  NetworkKpiData,
  NetworkHealthThresholds,
} from '@/modules/command-center/types/commandCenter.types';

export interface TelemetrySummaryResponse {
  dateRange?: { fromDate: string; toDate: string; days: number; fromTs: string; toTs: string; window: string };
  generatedAt: string;
  isCached: boolean;
  kpis: NetworkKpiData;
  thresholds: NetworkHealthThresholds;
  /** True while a manual Refresh is still pulling fresh packets in the background. */
  refreshing?: boolean;
  gateways: GatewayItem[];
  recentFrames: RawFrameItem[];
  hourlyActivity: Array<{ hour: string; count: number }>;
  hourlyByGateway?: Record<string, Array<{ hour: string; count: number }>>;
}

/** Time window sent to the backend; the server resolves it against its own clock. */
export interface WindowParams {
  hours?: number;
  days?: number;
  from?: string; // YYYY-MM-DD (custom)
  to?: string;
}

/** Stable cache key for a window (mirrors the backend's window key). */
export function windowKey(w: WindowParams): string {
  if (w.from && w.to) return `c_${w.from}_${w.to}`;
  if (w.hours) return `h${w.hours}`;
  return `d${w.days ?? 7}`;
}

function windowQuery(w: WindowParams): Record<string, string | number> {
  if (w.from && w.to) return { from: w.from, to: w.to };
  if (w.hours) return { hours: w.hours };
  return { days: w.days ?? 7 };
}

const LOCAL_STORAGE_CACHE_KEY_PREFIX = 'cortex_w_cc_summary_cache_v2';
const LOCAL_CACHE_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Retrieves a recent cached summary from localStorage for an instant first render
 * (never older than an hour, so a stale day can't be shown as current).
 */
export function getLocalCachedSummary(key: string, siteId: string = 'ALL'): TelemetrySummaryResponse | null {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_CACHE_KEY_PREFIX}_${key}_${siteId}`);
    if (!raw) return null;
    const parsed: TelemetrySummaryResponse = JSON.parse(raw);
    const age = Date.now() - new Date(parsed.generatedAt).getTime();
    if (!Number.isFinite(age) || age > LOCAL_CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Persists summary to localStorage for subsequent instant loads
 */
export function setLocalCachedSummary(summary: TelemetrySummaryResponse, key: string, siteId: string = 'ALL'): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_CACHE_KEY_PREFIX}_${key}_${siteId}`, JSON.stringify(summary));
  } catch (err) {
    // In case localStorage is full or restricted, gracefully ignore
    console.warn('[commandCenterApi] LocalStorage cache write failed:', err);
  }
}

/**
 * Fetches the available sites
 */
export async function fetchSites(): Promise<Array<{ id: string; name: string }>> {
  return apiRequest<Array<{ id: string; name: string }>>('/command-center/sites', { method: 'GET' });
}

/**
 * Fetches the aggregated live telemetry summary from the BFF backend
 */
export async function fetchCommandCenterSummary(
  win: WindowParams,
  refresh: boolean = false,
  siteId: string = 'ALL',
  signal?: AbortSignal
): Promise<TelemetrySummaryResponse> {
  const query: Record<string, string | number | boolean> = { ...windowQuery(win) };
  if (refresh) query.refresh = true;
  if (siteId && siteId !== 'ALL') query.siteId = siteId;

  const data = await apiRequest<TelemetrySummaryResponse>('/command-center/summary', {
    method: 'GET',
    query,
    signal,
  });

  setLocalCachedSummary({ ...data, refreshing: false }, windowKey(win), siteId);
  return data;
}


/**
 * Latest frame per meter for one gateway (loaded on selection; not part of the summary payload)
 */
export async function fetchGatewayMeters(gatewayId: string, win: WindowParams, signal?: AbortSignal): Promise<MeterTelemetryItem[]> {
  return apiRequest<MeterTelemetryItem[]>(`/command-center/gateways/${encodeURIComponent(gatewayId)}/meters`, {
    method: 'GET',
    query: windowQuery(win),
    signal,
  });
}

export async function searchMeters(
  q: string,
  win: WindowParams,
  signal?: AbortSignal
): Promise<Array<{ gatewayId: string; meter: MeterTelemetryItem }>> {
  return apiRequest(`/command-center/meters/search`, {
    method: 'GET',
    query: { q, ...windowQuery(win) },
    signal,
  });
}

export type MeterStatusFilter = 'live' | 'stale' | 'silent';

export interface FleetMetersPage {
  total: number;
  limit: number;
  offset: number;
  items: MeterTelemetryItem[];
  /** Values present in the window/site, for the DR and frequency dropdowns. */
  facets: { dr: number[]; frequency: number[] };
}

/**
 * Fleet-wide meter list (each meter's latest frame), server-side searched, filtered and paginated.
 */
export async function fetchFleetMeters(opts: {
  win: WindowParams;
  siteId: string;
  q?: string;
  status?: MeterStatusFilter;
  dr?: number;
  frequency?: number;
  confirmed?: boolean;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}): Promise<FleetMetersPage> {
  const query: Record<string, string | number> = { ...windowQuery(opts.win), limit: opts.limit ?? 100, offset: opts.offset ?? 0 };
  if (opts.siteId && opts.siteId !== 'ALL') query.siteId = opts.siteId;
  if (opts.q) query.q = opts.q;
  if (opts.status) query.status = opts.status;
  if (opts.dr !== undefined) query.dr = opts.dr;
  if (opts.frequency !== undefined) query.frequency = opts.frequency;
  if (opts.confirmed !== undefined) query.confirmed = String(opts.confirmed);
  return apiRequest<FleetMetersPage>('/command-center/meters', { method: 'GET', query, signal: opts.signal });
}

export interface FramesPage {
  total: number;
  limit: number;
  offset: number;
  items: RawFrameItem[];
}

/** Newest frames received through one gateway in the window (paginated, newest first). */
export async function fetchGatewayFrames(
  gatewayId: string,
  win: WindowParams,
  opts: { limit?: number; offset?: number; signal?: AbortSignal } = {}
): Promise<FramesPage> {
  return apiRequest<FramesPage>(`/command-center/gateways/${encodeURIComponent(gatewayId)}/frames`, {
    method: 'GET',
    query: { ...windowQuery(win), limit: opts.limit ?? 100, offset: opts.offset ?? 0 },
    signal: opts.signal,
  });
}

/** Frames from one meter in the window, across every gateway that heard it (paginated, newest first). */
export async function fetchMeterFrames(
  meterId: string,
  win: WindowParams,
  opts: { limit?: number; offset?: number; signal?: AbortSignal } = {}
): Promise<FramesPage> {
  return apiRequest<FramesPage>(`/command-center/meters/${encodeURIComponent(meterId)}/frames`, {
    method: 'GET',
    query: { ...windowQuery(win), limit: opts.limit ?? 20, offset: opts.offset ?? 0 },
    signal: opts.signal,
  });
}
