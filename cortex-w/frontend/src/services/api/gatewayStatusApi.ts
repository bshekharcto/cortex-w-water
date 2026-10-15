import { apiRequest } from './httpClient';

/** Contract of the backend's /api/gateway-status/* routes (backend/src/services/gatewayConnectivity.ts). */

export type GatewayState = 'online' | 'offline' | 'no-data';

export interface GatewayRange {
  startDate: string;
  endDate: string;
  timeZone: string;
}

export interface GatewayDay {
  date: string;
  onlineSeconds: number;
  offlineSeconds: number;
  outages: number;
  heartbeatsReceived: number;
  heartbeatsExpected: number;
}

export interface GatewayConnectivity {
  gatewayId: string;
  status: GatewayState;
  lastSeenAt: string | null;
  uptimePercent: number | null;
  onlineSeconds: number | null;
  /** Online + offline seconds over the range: what the online time is measured against. */
  observedSeconds: number | null;
  downtimeEvents: number;
  heartbeatsReceived: number | null;
  heartbeatsExpected: number | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  days: GatewayDay[];
}

export interface ConnectivityReport {
  range: GatewayRange;
  generatedAt: string;
  counts: { online: number; offline: number; noData: number; total: number };
  historyAvailableFrom: string | null;
  gateways: GatewayConnectivity[];
}

export interface TimelineSegment {
  status: 'online' | 'offline';
  start: string;
  end: string;
  durationSeconds: number;
  /** SCHEDULED_REBOOT, KEEPALIVE_ONLY, ... or null. */
  reason: string | null;
}

export interface GatewayTimeline {
  gatewayId: string;
  status: GatewayState | null;
  lastSeenAt: string | null;
  historyAvailableFrom: string | null;
  range: GatewayRange & { startAt: string; endAt: string };
  generatedAt: string;
  segments: TimelineSegment[];
  heartbeatDays: Array<{ date: string; received: number; expected: number }>;
}

/** The four quick ranges, all from one call, so switching between them needs no wait. */
export type PresetKey = '1D' | '3D' | '7D' | '14D';
export interface PresetBundle<T> {
  generatedAt: string;
  ranges: Record<PresetKey, T>;
}

export const gatewayStatusApi = {
  presets: (endDate: string, timeZone: string, signal?: AbortSignal) =>
    apiRequest<PresetBundle<ConnectivityReport>>('/gateway-status/presets', { query: { endDate, timeZone }, signal }),
  timelinePresets: (gatewayId: string, endDate: string, timeZone: string, signal?: AbortSignal) =>
    apiRequest<PresetBundle<GatewayTimeline>>(`/gateway-status/${encodeURIComponent(gatewayId)}/timeline-presets`, { query: { endDate, timeZone }, signal }),
  report: (range: GatewayRange, signal?: AbortSignal) =>
    apiRequest<ConnectivityReport>('/gateway-status', { query: { ...range }, signal }),
  timeline: (gatewayId: string, range: GatewayRange, signal?: AbortSignal) =>
    apiRequest<GatewayTimeline>(`/gateway-status/${encodeURIComponent(gatewayId)}/timeline`, { query: { ...range }, signal }),
};
