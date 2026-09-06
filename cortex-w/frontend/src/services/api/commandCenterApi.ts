import { apiRequest } from './httpClient';
import {
  GatewayItem,
  MeterTelemetryItem,
  RawFrameItem,
  NetworkKpiData,
} from '@/modules/command-center/types/commandCenter.types';

export interface TelemetrySummaryResponse {
  date: string;
  generatedAt: string;
  isCached: boolean;
  kpis: NetworkKpiData & {
    batteryAbnormalCount?: number;
    valveAbnormalCount?: number;
    reverseFlowCount?: number;
  };
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
 * Fetches the available sites
 */
export async function fetchSites(): Promise<Array<{ id: string; name: string }>> {
  try {
    const res = await apiRequest<Array<{ id: string; name: string }>>('/sites', {
      method: 'GET',
    });
    if (Array.isArray(res) && res.length > 0) return res;
    return [
      { id: 'ALL', name: 'All Sites' },
      { id: '6394', name: 'BHUBANESWAR' },
      { id: '6916', name: 'Cuttack' },
      { id: '6906', name: 'Puri' },
      { id: '6907', name: 'SCS College' },
      { id: '6908', name: 'Baliapunda' },
    ];
  } catch (err) {
    console.warn('[commandCenterApi] Failed to fetch sites, using fallback:', err);
    return [
      { id: 'ALL', name: 'All Sites' },
      { id: '6394', name: 'BHUBANESWAR' },
      { id: '6916', name: 'Cuttack' },
      { id: '6906', name: 'Puri' },
      { id: '6907', name: 'SCS College' },
      { id: '6908', name: 'Baliapunda' },
    ];
  }
}

/**
 * Fetches the aggregated live telemetry summary from the BFF backend
 */
export async function fetchCommandCenterSummary(
  days: number = 7,
  date?: string,
  refresh: boolean = false,
  siteId: string = 'ALL'
): Promise<TelemetrySummaryResponse> {
  const query: Record<string, string | number | boolean> = { days };
  if (date) query.date = date;
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
