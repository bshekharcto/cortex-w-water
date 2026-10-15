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
  shortInterruptions: number | null;
  range: GatewayRange & { startAt: string; endAt: string };
  generatedAt: string;
  segments: TimelineSegment[];
  heartbeatDays: Array<{ date: string; received: number; expected: number }>;
}

export const gatewayStatusApi = {
  report: (range: GatewayRange, signal?: AbortSignal) =>
    apiRequest<ConnectivityReport>('/gateway-status', { query: { ...range }, signal }),
  timeline: (gatewayId: string, range: GatewayRange, signal?: AbortSignal) =>
    apiRequest<GatewayTimeline>(`/gateway-status/${encodeURIComponent(gatewayId)}/timeline`, { query: { ...range }, signal }),
};
