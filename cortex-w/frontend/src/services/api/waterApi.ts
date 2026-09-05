import { apiRequest } from './httpClient';
import type {
  WaterSummaryDTO, DailyMetricTrendDTO, ExecutiveSummaryDTO,
  GatewayMeterSummaryDTO, MeterHealthDTO, GatewayPerformanceDTO,
  MeterWiseConsumptionDTO, SpringPage, CursorPaginationResDTO,
} from '@/modules/dashboard/types/dashboard.types';

export interface DateRangeFilter {
  fromDate: string; // YYYY-MM-DD
  toDate: string;
  siteIds?: number[];
  [key: string]: unknown;
}

/**
 * Every function here maps to one upstream capability from spec sections
 * 22 and 23. The BFF route it calls is responsible for the exact param
 * names/encodings the real backend expects (fromDate vs toDate vs endDate,
 * comma vs repeated siteIds) — this client always sends the same clean
 * shape no matter which upstream quirk is behind it.
 */
export const waterApi = {
  getWaterSummary: (filter: DateRangeFilter) =>
    apiRequest<WaterSummaryDTO>('/dashboard/water-summary', { query: filter }),

  getDailyTrend: (propertyNameList: string[], filter: Omit<DateRangeFilter, 'siteIds'>) =>
    apiRequest<DailyMetricTrendDTO>('/dashboard/daily-trend', {
      method: 'POST',
      body: { propertyNameList, ...filter },
    }),

  getExecutiveSummary: (filter: DateRangeFilter) =>
    apiRequest<ExecutiveSummaryDTO>('/dashboard/executive-summary', { query: filter }),

  getGatewayMeterSummary: (filter: DateRangeFilter) =>
    apiRequest<GatewayMeterSummaryDTO>('/command-center/gateway-summary', { query: filter }),

  getMeterHealth: (siteIds: number[]) =>
    apiRequest<MeterHealthDTO[]>('/command-center/meter-health', { query: { siteIds: siteIds.join(',') } }),

  getGatewayPerformance: (filter: DateRangeFilter) =>
    apiRequest<GatewayPerformanceDTO[]>('/command-center/gateway-performance', { query: filter }),

  getLatestMeterStatusPage: (page: number, size: number, search?: string) =>
    apiRequest<SpringPage<MeterWiseConsumptionDTO>>('/command-center/latest-meter-status', {
      method: 'POST',
      body: { page, size, search },
    }),

  getRawTelemetryCursor: (cursor: string | null, size: number, filter: DateRangeFilter) =>
    apiRequest<CursorPaginationResDTO<MeterWiseConsumptionDTO>>('/command-center/raw-telemetry', {
      method: 'POST',
      body: { cursor, size, ...filter },
    }),

  exportRawTelemetry: (siteId: number, date: string) =>
    apiRequest<Blob>('/command-center/raw-telemetry/export', { method: 'POST', body: { siteId, date } }),
};
