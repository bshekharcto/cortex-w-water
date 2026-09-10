import { runtimeConfig } from '@/config/runtimeConfig';
import { apiRequest } from '@/services/api/httpClient';
import type { DashboardScope } from '../models/dashboardScope';
import type { DashboardKpis } from '../models/dashboardKpis';
import type { ZoneRow, DmaRow, MeterRow } from '../models/dashboardRows';
import {
  aggregateGlobalKpis,
  aggregateZoneKpis,
  aggregateDmaKpis,
} from './dashboardAggregation';

// Lazy import for synthetic fixture data — tree-shaken when in pure api mode
async function getSeedData() {
  const { dashboardDrilldownSeed } = await import(
    '@/data/seed/dashboard/dashboardDrilldownSeed'
  );
  return dashboardDrilldownSeed;
}

/**
 * Fetches all Zone rows for the Global level overview table
 */
export async function fetchZoneRows(): Promise<ZoneRow[]> {
  if (runtimeConfig.APP_DATA_MODE === 'seed') {
    const seed = await getSeedData();
    return seed.zones.map((z) => ({
      zoneId: z.zoneId,
      zoneName: z.zoneName,
      totalDevices: z.totalDevices,
      connected: z.connected,
      disconnected: z.disconnected,
      neverSeen: z.neverSeen,
      yesterdayFlowM3: z.yesterdayFlowM3,
      todayFlowM3: z.todayFlowM3,
      monthToDateFlowM3: z.monthToDateFlowM3,
      dataTimestamp: new Date().toISOString(),
    }));
  }

  // API mode — call BFF
  try {
    const res = await apiRequest<ZoneRow[]>('/dashboard/zones');
    if (Array.isArray(res)) return res;
    return [];
  } catch (err) {
    console.warn('[dashboardDataService] Error fetching zone rows from API, falling back to empty:', err);
    return [];
  }
}

/**
 * Fetches DMA rows for a specific Zone
 */
export async function fetchDmaRows(zoneId: string): Promise<DmaRow[]> {
  if (runtimeConfig.APP_DATA_MODE === 'seed') {
    const seed = await getSeedData();
    const zone = seed.zones.find((z) => z.zoneId === zoneId);
    if (!zone) return [];
    return zone.dmas.map((d) => ({
      dmaId: d.dmaId,
      dmaName: d.dmaName,
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      totalDevices: d.totalDevices,
      connected: d.connected,
      disconnected: d.disconnected,
      neverSeen: d.neverSeen,
      yesterdayFlowM3: d.yesterdayFlowM3,
      todayFlowM3: d.todayFlowM3,
      monthToDateFlowM3: d.monthToDateFlowM3,
      dataTimestamp: new Date().toISOString(),
    }));
  }

  // API mode — call BFF
  try {
    const res = await apiRequest<DmaRow[]>(`/dashboard/zone/${encodeURIComponent(zoneId)}/dmas`);
    if (Array.isArray(res)) return res;
    return [];
  } catch (err) {
    console.warn('[dashboardDataService] Error fetching DMA rows from API:', err);
    return [];
  }
}

/**
 * Fetches Meter / Device rows for a specific DMA
 */
export async function fetchDmaMeterRows(zoneId: string, dmaId: string): Promise<MeterRow[]> {
  if (runtimeConfig.APP_DATA_MODE === 'seed') {
    const seed = await getSeedData();
    const zone = seed.zones.find((z) => z.zoneId === zoneId);
    const dma = zone?.dmas.find((d) => d.dmaId === dmaId);
    if (!dma) return [];
    return dma.meters.map((m) => ({
      zoneName: zone!.zoneName,
      dmaName: dma.dmaName,
      deviceId: m.deviceId,
      meterId: m.meterId,
      meterType: m.meterType,
      consumerId: m.consumerId,
      consumerName: m.consumerName,
      address: m.address,
      meterSize: m.meterSize,
      totalizerM3: m.totalizerM3,
      latestReadingAt: m.latestReadingAt,
      connectivityStatus: m.connectivityStatus,
    }));
  }

  // API mode — call BFF
  try {
    const res = await apiRequest<MeterRow[]>(`/dashboard/dma/${encodeURIComponent(dmaId)}/meters`);
    if (Array.isArray(res)) return res;
    return [];
  } catch (err) {
    console.warn('[dashboardDataService] Error fetching meter rows from API:', err);
    return [];
  }
}

/**
 * Fetches or calculates KPIs for the active scope
 */
export async function fetchScopeKpis(scope: DashboardScope): Promise<DashboardKpis> {
  if (scope.level === 'GLOBAL') {
    const zones = await fetchZoneRows();
    return aggregateGlobalKpis(zones);
  }

  if (scope.level === 'ZONE') {
    const dmas = await fetchDmaRows(scope.zoneId);
    return aggregateZoneKpis(dmas);
  }

  // DMA level
  const meters = await fetchDmaMeterRows(scope.zoneId, scope.dmaId);
  const dmas = await fetchDmaRows(scope.zoneId);
  const matchedDma = dmas.find((d) => d.dmaId === scope.dmaId);

  return aggregateDmaKpis(meters, {
    yesterdayFlowM3: matchedDma?.yesterdayFlowM3 ?? 0,
    todayFlowM3: matchedDma?.todayFlowM3 ?? 0,
    monthToDateFlowM3: matchedDma?.monthToDateFlowM3 ?? 0,
  });
}
