import { apiRequest } from './httpClient';
import {
  GatewayItem,
  MeterTelemetryItem,
  RawFrameItem,
  NetworkKpiData,
  RadioHealthData,
  TrafficSeries,
} from '@/modules/command-center/types/commandCenter.types';

/** A custom window: days at the site as YYYY-MM-DD, both inclusive. */
export interface CustomRange {
  from: string;
  to: string;
}

export interface TelemetrySummaryResponse {
  date: string;
  dateRange?: { fromDate: string; toDate: string; days: number }; // the days the numbers cover, days at the site
  generatedAt: string;
  isCached: boolean;
  kpis: NetworkKpiData & {
    reverseFlowCount?: number;
  };
  gateways: GatewayItem[];
  allMetersCount: number;
  recentFrames: RawFrameItem[];
  hourlyActivity: Array<{ hour: string; count: number }>;
  radioHealth: {
    avgRssi: number;
    avgSnr: number;
    rssiBuckets: { excellent: number; good: number; fair: number; poor: number };
    snrBuckets: { excellent: number; good: number; fair: number; poor: number };
  };
}

const LOCAL_STORAGE_CACHE_KEY_PREFIX = 'cortex_w_cc_summary_cache';

/**
 * Retrieves cached summary from localStorage for 0ms initial render
 */
export function getLocalCachedSummary(days: number = 7, date?: string, siteId: string = 'ALL'): TelemetrySummaryResponse | null {
  try {
    const key = `${LOCAL_STORAGE_CACHE_KEY_PREFIX}_${days}_${siteId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: TelemetrySummaryResponse = JSON.parse(raw);
    if (date && parsed.date && parsed.date !== date) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Persists summary to localStorage for subsequent instant loads
 */
export function setLocalCachedSummary(summary: TelemetrySummaryResponse, days: number = 7, siteId: string = 'ALL'): void {
  try {
    const key = `${LOCAL_STORAGE_CACHE_KEY_PREFIX}_${days}_${siteId}`;
    localStorage.setItem(key, JSON.stringify(summary));
  } catch (err) {
    // In case localStorage is full or restricted, gracefully ignore
    console.warn('[commandCenterApi] LocalStorage cache write failed:', err);
  }
}

/**
 * Fetches the sites the user may filter by (the real site tree, "All Sites" first).
 */
export async function fetchSites(): Promise<Array<{ id: string; name: string; parentId?: string | null }>> {
  try {
    const res = await apiRequest<Array<{ id: string; name: string; parentId?: string | null }>>('/sites', { method: 'GET' });
    if (Array.isArray(res) && res.length > 0) return res;
  } catch (err) {
    console.warn('[commandCenterApi] Failed to fetch sites:', err);
  }
  return [{ id: 'ALL', name: 'All Sites' }];
}

/**
 * Fetches the aggregated live telemetry summary from the BFF backend
 */
export async function fetchCommandCenterSummary(
  days: number = 7,
  date?: string,
  refresh: boolean = false,
  siteId: string = 'ALL',
  custom?: CustomRange
): Promise<TelemetrySummaryResponse> {
  const query: Record<string, string | number | boolean> = { days };
  if (date) query.date = date; // only to look back from an earlier day; by default it is today at the site
  if (custom) {
    query.from = custom.from;
    query.to = custom.to;
  }
  if (refresh) query.refresh = true;
  if (siteId && siteId !== 'ALL') query.siteId = siteId;

  const data = await apiRequest<TelemetrySummaryResponse>('/command-center/summary', {
    method: 'GET',
    query,
  });

  // Save to client cache keyed by days and siteId
  setLocalCachedSummary(data, days, siteId);
  return data;
}

/**
 * Fetches the latest live frame feed
 */
export async function fetchLiveTelemetryFeed(
  date?: string,
  limit: number = 100
): Promise<RawFrameItem[]> {
  return apiRequest<RawFrameItem[]>('/command-center/feed', {
    method: 'GET',
    query: { ...(date ? { date } : {}), limit },
  });
}

/** The window and site a per-gateway request covers. */
export interface GatewayScope {
  days: number;
  custom?: CustomRange;
  siteId?: string;
}

function scopeQuery(scope: GatewayScope): Record<string, string | number> {
  return {
    days: scope.days,
    ...(scope.siteId && scope.siteId !== 'ALL' ? { siteId: scope.siteId } : {}),
    ...(scope.custom ? { from: scope.custom.from, to: scope.custom.to } : {}),
  };
}

export interface GatewayRadioHealthData {
  frames: number;
  rssi: { strong: number; good: number; weak: number; critical: number };
  snr: { excellent: number; good: number; marginal: number; poor: number };
}

export type GatewayHourlyData = Array<{ hour: string; normal: number; degraded: number }>;

/** How the frames one gateway received split into RSSI and SNR bands. */
export async function fetchGatewayRadioHealth(gatewayId: string, scope: GatewayScope): Promise<GatewayRadioHealthData> {
  return apiRequest<GatewayRadioHealthData>(`/command-center/gateways/${encodeURIComponent(gatewayId)}/radio-health`, {
    method: 'GET',
    query: scopeQuery(scope),
  });
}

/** Frames one gateway received by hour of the day; degraded = weak RSSI or poor SNR. */
export async function fetchGatewayHourly(gatewayId: string, scope: GatewayScope): Promise<GatewayHourlyData> {
  return apiRequest<GatewayHourlyData>(`/command-center/gateways/${encodeURIComponent(gatewayId)}/hourly`, {
    method: 'GET',
    query: scopeQuery(scope),
  });
}

export type MeterFilterKey = 'ALL' | 'LIVE' | 'STALE' | 'WEAK_RSSI' | 'POOR_SNR' | 'MULTI_GW';

export interface GatewayMetersPage {
  content: MeterTelemetryItem[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

/**
 * One page of the meters a gateway heard. Filtering and paging happen on the server, so the table only ever
 * receives `size` rows.
 */
export async function fetchGatewayMeters(
  gatewayId: string,
  opts: { days: number; page: number; size: number; filter: MeterFilterKey; custom?: CustomRange; siteId?: string }
): Promise<GatewayMetersPage> {
  return apiRequest<GatewayMetersPage>(`/command-center/gateways/${encodeURIComponent(gatewayId)}/meters`, {
    method: 'GET',
    query: {
      days: opts.days,
      page: opts.page,
      size: opts.size,
      filter: opts.filter,
      ...(opts.siteId && opts.siteId !== 'ALL' ? { siteId: opts.siteId } : {}),
      ...(opts.custom ? { from: opts.custom.from, to: opts.custom.to } : {}),
    },
  });
}

/** Meters whose id or DevEUI contains `q` (at least 3 characters), each with the gateway that heard it last. */
export async function searchMeters(
  q: string,
  days: number = 7,
  custom?: CustomRange,
  siteId?: string
): Promise<Array<MeterTelemetryItem & { gatewayId: string }>> {
  return apiRequest<Array<MeterTelemetryItem & { gatewayId: string }>>('/command-center/meters/search', {
    method: 'GET',
    query: {
      q,
      days,
      ...(siteId && siteId !== 'ALL' ? { siteId } : {}),
      ...(custom ? { from: custom.from, to: custom.to } : {}),
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Frames, fleet meters, one meter, traffic over time and radio analysis
// ---------------------------------------------------------------------------------------------------------------------

/** The window and site of a request (the Command Center's days at the site, or a custom range). */
export type WindowParams = GatewayScope;

/** Changes whenever the window or the site does: what a list reloads on. */
export function windowKey(w: WindowParams): string {
  return [w.days, w.custom?.from ?? '', w.custom?.to ?? '', w.siteId ?? 'ALL'].join('|');
}

function windowQuery(w: WindowParams, siteId?: string): Record<string, string | number> {
  const query: Record<string, string | number> = { ...scopeQuery(w) };
  const site = siteId ?? w.siteId;
  if (site && site !== 'ALL') query.siteId = site;
  else delete query.siteId;
  return query;
}

export type MeterStatusFilter = 'live' | 'stale' | 'silent';

export interface FleetMetersPage {
  total: number;
  limit: number;
  offset: number;
  items: MeterTelemetryItem[];
  /** Values present in the window/site, for the data-rate and frequency drop-downs. */
  facets: { dr: number[]; frequency: number[] };
}

/** Every meter's latest frame, searched, filtered and paginated on the server. */
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
  const query: Record<string, string | number> = { ...windowQuery(opts.win, opts.siteId), limit: opts.limit ?? 100, offset: opts.offset ?? 0 };
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

/** Newest frames one gateway took (paginated, newest first). */
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

/** Frames from one meter across every gateway that took them (paginated, newest first). */
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

/** Newest frames across the fleet or one site (paginated): "Load more" in the live feed. */
export async function fetchFleetFrames(
  win: WindowParams,
  siteId: string,
  opts: { limit?: number; offset?: number; signal?: AbortSignal } = {}
): Promise<FramesPage> {
  return apiRequest<FramesPage>('/command-center/frames', {
    method: 'GET',
    query: { ...windowQuery(win, siteId), limit: opts.limit ?? 100, offset: opts.offset ?? 0 },
    signal: opts.signal,
  });
}

/** Frames and distinct meters per time bucket, with the previous equal period, for a gateway, a site or the fleet. */
export async function fetchTraffic(
  win: WindowParams,
  scope: { siteId: string; gatewayId?: string },
  signal?: AbortSignal
): Promise<TrafficSeries> {
  const query = windowQuery(win, scope.siteId);
  if (scope.gatewayId) query.gatewayId = scope.gatewayId;
  return apiRequest<TrafficSeries>('/command-center/traffic', { method: 'GET', query, signal });
}

/** RSSI / SNR distributions, data rate, frequency and the weakest / strongest meters. */
export async function fetchRadioHealth(
  win: WindowParams,
  scope: { siteId: string; gatewayId?: string },
  signal?: AbortSignal
): Promise<RadioHealthData> {
  const query = windowQuery(win, scope.siteId);
  if (scope.gatewayId) query.gatewayId = scope.gatewayId;
  return apiRequest<RadioHealthData>('/command-center/radio', { method: 'GET', query, signal });
}

/** One meter by exact Meter ID / DevEUI (its latest frame in the window); null when it sent none there. */
export async function fetchMeter(
  meterId: string,
  win: WindowParams,
  signal?: AbortSignal
): Promise<{ gatewayId: string; meter: MeterTelemetryItem } | null> {
  try {
    return await apiRequest(`/command-center/meters/${encodeURIComponent(meterId)}`, { method: 'GET', query: windowQuery(win), signal });
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
}
