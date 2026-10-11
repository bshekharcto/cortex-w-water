import { apiRequest } from './httpClient';
import type { SensorRawDataDTO, GeofenceDTO, GatewayPlacementResult } from '@/modules/gis/shared/mapTypes';
import type { MeterWiseConsumptionDTO } from '@/modules/dashboard/types/dashboard.types';
import type { GisGateway, GisMeter } from '@/modules/gis/shared/gisData';

export interface LiveMetersResponse {
  summary: {
    totalMeters: number;
    activeCount: number;
    warningCount: number;
    problemCount: number;
    gatewayCount: number;
  };
  totalMatching: number;
  returnedCount: number;
  meters: GisMeter[];
}

/** One day of a meter: the last reading and the water used that day (the Dashboard's daily table). */
export interface MeterDayRow {
  date: string; // YYYY-MM-DD at the meter's site
  shortDate: string; // "Oct 09"
  readingM3: number;
  consumptionL: number;
  consumptionM3: number;
}

/** Contract of GET /api/gis/meter-detail/:assetId. A value nobody knows is null. */
export interface LiveMeterDetailResponse {
  assetId: number;
  meterId: string;
  assetName: string | null;
  status: string | null;
  latestReading: number | null;
  readingDate: string | null;
  /** Water used yesterday (m3) at the meter's site, null when there is no figure for that day. */
  consumption: number | null;
  monthToDateM3: number | null;
  signalRssi: number | null;
  signalSnr: number | null;
  lastSeen: string | null;
  gatewayId: string | null;
  devEui: string | null;
  lastFrame: { time: string; frequencyHz: number | null; dataRate: number | null; adr: boolean | null; fCnt: number | null } | null;
  consumer: {
    id: number | null;
    customId: string | null;
    name: string | null;
    mobile: string | null;
    location: string | null;
    ward: string | null;
    status: string | null;
    registrationDate: string | null;
    siteName: string | null;
  };
  replacement: {
    oldMeterNumber: string;
    oldMeterReading: number;
    newMeterNumber: string;
    newMeterReading?: number;
    date: string | null;
    status: string | null;
  } | null;
  photos: Array<{
    documentId?: number;
    name: string;
    category: string;
    url: string;
    uploadDate?: string;
  }>;
  latestBill?: any;
  /** Oldest first, only days that have a reading (up to 10). */
  dailyReadings: MeterDayRow[];
  /** True for the database-only answer; the contact, photo, bill and replacement parts are still to come. */
  partial: boolean;
  /** Parts of the beta API that could not be reached (e.g. "photos"). */
  unavailable: string[];
}

export const mapApi = {
  getGateways: (siteId?: string) =>
    apiRequest<GisGateway[]>('/gis/gateways', { query: { siteId } }),

  getMeters: (params?: { siteId?: string; gatewayId?: string; problemsOnly?: boolean; search?: string; limit?: number }) =>
    apiRequest<LiveMetersResponse>('/gis/meters', { query: params }),

  /** `core` answers from the database alone (fast); without it the beta API parts are included too (slower). */
  getMeterDetail: (assetId: number | string, meterId?: string, opts?: { core?: boolean }) =>
    apiRequest<LiveMeterDetailResponse>(`/gis/meter-detail/${assetId}`, { query: { meterId, core: opts?.core ? '1' : undefined } }),

  getGatewayPerformance: (params?: { siteId?: string; fromDate?: string; toDate?: string }) =>
    apiRequest<Array<{ gatewayId: string; date: string; activeMeterCount: number }>>('/gis/performance', { query: params }),

  getAssetLocations: (siteId: number = 6394) =>
    apiRequest<Record<string, SensorRawDataDTO>>('/gis/asset-locations', { query: { siteIds: siteId } }),

  getGeofences: (siteId: number = 6394) =>
    apiRequest<GeofenceDTO[]>('/gis/geofences', { query: { siteIds: siteId } }),

  getLatestMeterTelemetry: (assetId: string) =>
    apiRequest<MeterWiseConsumptionDTO>(`/gis/meters/${assetId}/latest`),

  getAssetDetail: (assetId: string) =>
    apiRequest<{ assetId: string; name: string; householdId?: string }>(`/gis/assets/${assetId}`),

  computeGatewayPlacement: (siteId: number, gatewayCount: number, coverageRadiusM: number) =>
    apiRequest<GatewayPlacementResult>('/gis/gateway-placement/compute', {
      method: 'POST',
      body: { siteId, gatewayCount, coverageRadiusM },
    }),
};

