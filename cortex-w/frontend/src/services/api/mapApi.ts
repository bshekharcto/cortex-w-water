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

export interface LiveMeterDetailResponse {
  assetId: number;
  meterId: string;
  assetName: string;
  status: string;
  latestReading: number | null;
  readingDate: string | null;
  consumption: number;
  batteryVoltage: number | null;
  batteryStatus: string | null;
  signalRssi: number | null;
  signalSnr: number | null;
  valveStatus: boolean | null;
  valveClosed: boolean | null;
  lastSeen: string | null;
  consumer: {
    id: number | null;
    customId: string | null;
    name: string;
    mobile: string | null;
    location: string | null;
    ward: string | null;
    status: string;
    registrationDate: string | null;
    siteName: string | null;
  };
  replacement: {
    oldMeterNumber: string;
    oldMeterReading: number;
    newMeterNumber: string;
    newMeterReading?: number;
    date: string;
    status: string;
  } | null;
  photos: Array<{
    documentId?: number;
    name: string;
    category: string;
    url: string;
    uploadDate?: string;
  }>;
  latestBill?: any;
  dailyReadings: Array<{
    date: string | null;
    shortDate: string;
    readingM3: number;
    consumptionL: number;
    consumptionM3: number;
    minFlowLph: number | null;
    maxFlowLph: number | null;
    uplinksReceived: number | null;
    uplinksExpected: number | null;
    flag: string;
  }>;
}

export const mapApi = {
  getGateways: (siteId?: string) =>
    apiRequest<GisGateway[]>('/gis/gateways', { query: { siteId } }),

  getMeters: (params?: { siteId?: string; gatewayId?: string; problemsOnly?: boolean; search?: string; limit?: number }) =>
    apiRequest<LiveMetersResponse>('/gis/meters', { query: params }),

  getMeterDetail: (assetId: number | string, meterId?: string) =>
    apiRequest<LiveMeterDetailResponse>(`/gis/meter-detail/${assetId}`, { query: { meterId } }),

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

