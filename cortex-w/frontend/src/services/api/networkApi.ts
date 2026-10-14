import { apiRequest } from './httpClient';

/** Contract of the backend's /api/network/* routes (backend/src/services/networkService.ts). */

export type NetMeterStatus = 'connected' | 'disconnected' | 'never';
export type NetGatewayStatus = 'reporting' | 'degraded' | 'stale' | 'no-traffic';
export type CoordinatesStatus = 'fresh' | 'stale' | 'unavailable';

export interface NetGateway {
  gatewayId: string;
  name: string | null;
  address: string | null;
  siteId: number | null;
  lat: number;
  lng: number;
  radiusM: number | null;
  status: NetGatewayStatus;
  metersHeard: number;
  liveMeters: number;
  avgRssi: number | null;
  avgSnr: number | null;
  lastFrameAt: string | null;
}

export interface NetUnplacedGateway {
  gatewayId: string;
  reason: 'no-geofence' | 'no-coordinates';
  status: NetGatewayStatus;
  metersHeard: number;
  liveMeters: number;
  avgRssi: number | null;
  avgSnr: number | null;
  lastFrameAt: string | null;
}

export interface NetGatewaysResponse {
  gateways: NetGateway[];
  unplaced: NetUnplacedGateway[];
}

export interface NetMeterMapResponse {
  latestFrameAt: string | null;
  coordinates: { status: CoordinatesStatus; fetchedAt: string | null };
  summary: { total: number; withCoordinates: number; withoutCoordinates: number; connected: number; disconnected: number; never: number };
  /** `status` column: an index into this list. */
  statuses: NetMeterStatus[];
  /** `gateway` column: an index into this list, or -1. */
  gatewayIds: string[];
  columns: string[];
  /** [meterId, assetId, lat, lng, status, gateway, rssi, snr, site (-1: none)] */
  rows: Array<[string, number, number, number, number, number, number | null, number | null, number]>;
  /** The meters without a position, per site and status: [site (-1: none), status index, count]. */
  unpositioned: Array<[number, number, number]>;
}

export interface NetMeterSuggestion {
  meterId: string;
  assetId: number;
  consumerId: string | null;
  consumerName: string | null;
  siteId: number | null;
}

export interface NetMeter {
  meterId: string;
  assetId: number;
  devEui: string | null;
  consumerName: string | null;
  householdId: string | null;
  locality: string | null;
  ward: string | null;
  zone: string | null;
  dma: string | null;
  siteId: number | null;
  siteName: string | null;
  lat: number | null;
  lng: number | null;
  gatewayId: string | null;
  distanceToGatewayM: number | null;
  status: NetMeterStatus;
  rssi: number | null;
  snr: number | null;
  lastSeen: string | null;
  currentReadingKl: number | null;
}

export interface NetMeterPage {
  total: number;
  limit: number;
  offset: number;
  coordinates: { status: CoordinatesStatus; fetchedAt: string | null };
  items: NetMeter[];
}

export interface NetMeterQuery {
  siteId?: string;
  limit?: number;
  offset?: number;
  search?: string;
  status?: NetMeterStatus;
  gatewayId?: string;
}

/** One entry of the site picker (GET /api/sites): `label` already carries the tree lines. */
export interface NetSiteOption {
  id: string;
  name: string;
  parentId: string | null;
  label: string;
}

export const networkApi = {
  getGateways: (siteId: string, signal?: AbortSignal) =>
    apiRequest<NetGatewaysResponse>('/network/gateways', { query: { siteId }, signal }),

  getMeterMap: (siteId: string, signal?: AbortSignal) =>
    apiRequest<NetMeterMapResponse>('/network/meters/map', { query: { siteId }, signal }),

  listMeters: (q: NetMeterQuery, signal?: AbortSignal) =>
    apiRequest<NetMeterPage>('/network/meters', { query: { ...q }, signal }),

  suggestMeters: (siteId: string, q: string, signal?: AbortSignal) =>
    apiRequest<{ items: NetMeterSuggestion[] }>('/network/meters/suggest', { query: { siteId, q }, signal }),

  listSites: (signal?: AbortSignal) => apiRequest<NetSiteOption[]>('/sites', { signal }),
};
