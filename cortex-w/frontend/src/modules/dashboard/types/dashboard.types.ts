// API DTOs — mirror the upstream backend exactly (spec 21). Keep these
// separate from any UI-facing view model that requires transformation.

export interface SpringPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  numberOfElements: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

export interface CursorPaginationResDTO<T> {
  content: T[];
  nextCursor: string | null;
  hasMore: boolean;
  estimatedTotal: number;
}

export interface WaterSummaryDTO {
  [propertyName: string]: { value: string; lastUpdated: string };
}

export type DailyMetricTrendDTO = Record<string, number>; // { "01 Sep": 2431, ... }

export interface ExecutiveSummaryDTO {
  householdsOnboarded: number;
  metersConfigured: number;
  householdsMapped: number;
  meterReplacementsYesterday: number;
  criticalAlerts: number;
  openMaintenanceRequests: number;
  closedMaintenanceRequests: number;
  topAlertTypes: string[];
  region: string;
  fromDate: string;
  toDate: string;
}

export interface GatewayMeterSummaryDTO {
  totalUniqueMeters: number;
  gatewayCount: number;
  metersOnMultipleGateways: number;
  perGateway: Array<{ gatewayId: string; uniqueMeterCount: number }>;
}

export interface MeterHealthDTO {
  assetId: number;
  meterId: string;
  householdId: string;
  gatewayId: string;
  lastSeenDate: string;
  decodedAt: string;
  rssi: number;
  batteryStatus: string;
  timeZone: string;
}

export interface GatewayPerformanceDTO {
  gatewayId: string;
  date: string;
  activeMeterCount: number;
}

/**
 * One optional-field DTO reused by several upstream endpoints (spec 21.3).
 * NOTE: the backend field is `reverseFlow`, never `reverseFlowL` — guardrail #14.
 */
export interface MeterWiseConsumptionDTO {
  meterId?: string;
  date?: string;
  consumption?: number;
  currentReading?: number;
  reverseFlow?: number;
  forwardFlowL?: number;
  batteryVoltage?: number;
  batteryStatus?: string;
  batteryHealth?: string;
  signalStrength?: number;
  signalQuality?: number;
  rssi?: number;
  snr?: number;
  valveStatus?: boolean;
  valveClosed?: boolean;
  valveHealth?: string;
  checksumStatus?: string;
  statusByte?: number;
  meterTimestamp?: string;
  decodedAt?: string;
  startReading?: number;
  endReading?: number;
  avgConsumption?: number;
  applicationId?: string;
  applicationName?: string;
  deviceProfileId?: string;
  deviceProfileName?: string;
  deviceName?: string;
  devEui?: string;
  devAddr?: string;
  measureName?: string;
  fPort?: number;
  fCnt?: number;
  dr?: number;
  frequency?: number;
  confirmed?: boolean;
  adr?: boolean;
  activeMeters?: number;
  assetId?: string;
  householdId?: string;
  tenantId?: string;
  tenantName?: string;
  siteId?: string;
  siteName?: string;
  gatewayId?: string;
  lastSeen?: string;
}
