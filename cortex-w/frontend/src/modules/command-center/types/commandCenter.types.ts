export type GatewayState = 'reporting' | 'degraded' | 'stale' | 'no-traffic' | 'never-observed';
export type MeterState = 'live' | 'stale' | 'silent' | 'weak-rssi' | 'poor-snr' | 'multi-gw' | 'fcnt-gap' | 'gw-changed';
export type GatewayTabType = 'METERS' | 'FRAMES' | 'TRAFFIC' | 'RADIO';
export type TimeWindow = '1H' | '6H' | '24H' | '7D' | '30D' | 'CUSTOM';

export interface GatewayItem {
  gatewayId: string;
  alias: string;
  uniqueMeters: number;
  frameCount: number;
  lastFrameText: string;
  lastFrameDecodedAt: string;
  avgRssi: number;
  avgSnr: number;
  trendText: string;
  status: GatewayState;
}

export interface MeterReceptionPath {
  gatewayId: string;
  alias: string;
  rssi: number;
  snr: number;
  lastSeenText: string;
  isLatest: boolean;
}

export interface MeterTelemetryItem {
  meterId: string;
  devEui: string;
  lastSeenDate: string;
  frameAge: string;
  frames1H: number;
  frames24H: number;
  lastRssi: number;
  lastSnr: number;
  fCnt: number;
  fPort: number;
  frequency: number;
  dr: number;
  adr: boolean;
  confirmed: boolean;
  otherGatewaysCount: number;
  statusChips: MeterState[];
  gatewaysHeard: MeterReceptionPath[];
  recentFrames?: MeterFrameRecord[];
}

export interface MeterFrameRecord {
  id: string;
  receivedTime: string;
  gatewayAlias: string;
  gatewayId: string;
  fCnt: number;
  fPort: number;
  rssi: number;
  snr: number;
  frequency: number;
  dr: number;
  confirmed: boolean;
  checksum: string;
}

export interface RawFrameItem {
  id: string;
  decodedAt: string;
  meterTimestamp: string;
  meterId: string;
  devEui: string;
  gatewayId: string;
  gatewayAlias: string;
  fCnt: number;
  fPort: number;
  frequency: number;
  dr: number;
  rssi: number;
  snr: number;
  confirmed: boolean;
  adr: boolean;
  checksumStatus: string;
  statusByte: number;
  statusEvent: 'FRAME_RECEIVED' | 'WEAK_RSSI' | 'POOR_LINK' | 'MULTI_GW' | 'DEGRADED';
}

export interface NetworkKpiData {
  gatewaysWithTraffic: number;
  totalConfiguredGateways: number;
  noRecentTrafficGateways: number;
  uniqueMetersSeen: number;
  configuredMeters: number;
  framesReceived: number;
  framesTrend: string;
  lastFrameAge: string;
  multiGatewayMeters: number;
  avgRssi: number;
  avgSnr: number;
}
