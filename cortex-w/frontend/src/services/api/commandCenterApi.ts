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
  kpis: NetworkKpiData & {
    batteryAbnormalCount?: number;
    valveAbnormalCount?: number;
    reverseFlowCount?: number;
  };
  thresholds: NetworkHealthThresholds;
  gateways: GatewayItem[];
  metersByGateway: Record<string, MeterTelemetryItem[]>;
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
  siteId: string = 'ALL'
): Promise<TelemetrySummaryResponse> {
  const query: Record<string, string | number | boolean> = { ...windowQuery(win) };
  if (refresh) query.refresh = true;
  if (siteId && siteId !== 'ALL') query.siteId = siteId;

  const data = await apiRequest<TelemetrySummaryResponse>('/command-center/summary', {
    method: 'GET',
    query,
  });

  setLocalCachedSummary(data, windowKey(win), siteId);
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

/**
 * Latest frame per meter for one gateway (loaded on selection; not part of the summary payload)
 */
export async function fetchGatewayMeters(gatewayId: string, win: WindowParams): Promise<MeterTelemetryItem[]> {
  return apiRequest<MeterTelemetryItem[]>(`/command-center/gateways/${encodeURIComponent(gatewayId)}/meters`, {
    method: 'GET',
    query: windowQuery(win),
  });
}

export async function searchMeters(
  q: string,
  win: WindowParams
): Promise<Array<{ gatewayId: string; meter: MeterTelemetryItem }>> {
  return apiRequest(`/command-center/meters/search`, {
    method: 'GET',
    query: { q, ...windowQuery(win) },
  });
}
