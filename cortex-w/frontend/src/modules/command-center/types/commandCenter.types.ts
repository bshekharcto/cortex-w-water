export interface NetworkHealthThresholds {
  gatewayStaleMinutes: number;
  gatewayCriticalMinutes: number;
  meterStaleMinutes: number;
  meterCriticalHours: number;
  gatewayTrafficDropWarningPct: number;
  gatewayTrafficDropCriticalPct: number;
  rssiWeakDbm: number;
  rssiCriticalDbm: number;
  snrWeakDb: number;
  snrCriticalDb: number;
  trendMinPrevFrames: number;
}

export type GatewayState = 'reporting' | 'degraded' | 'stale' | 'no-traffic' | 'never-observed';
export type MeterState = 'live' | 'stale' | 'silent' | 'weak-rssi' | 'poor-snr' | 'multi-gw' | 'fcnt-gap' | 'gw-changed';
export type GatewayTabType = 'METERS' | 'FRAMES' | 'TRAFFIC' | 'RADIO';
export type TimeWindow = '1H' | '6H' | '24H' | '7D' | '30D' | 'CUSTOM';

export interface GatewayItem {
  gatewayId: string;
  alias: string;
  uniqueMeters: number;
  frameCount: number;
  lastFrameDecodedAt: string | null;
  avgRssi: number | null;
  avgSnr: number | null;
  /** % change in frames vs the previous equal-length period; null when not comparable. */
  trendPct: number | null;
  status: GatewayState;
}

export interface MeterReceptionPath {
  gatewayId: string;
  alias: string;
  rssi: number | null;
  snr: number | null;
  lastSeenAt: string | null;
  isLatest: boolean;
}

export interface MeterTelemetryItem {
  meterId: string;
  devEui: string | null;
  lastSeenDate: string;
  frames1H: number;
  frames24H: number;
  lastRssi: number | null;
  lastSnr: number | null;
  fCnt: number | null;
  fPort: number | null;
  frequency: number | null;
  dr: number | null;
  adr: boolean;
  confirmed: boolean;
  otherGatewaysCount: number;
  /** Freshness status only: exactly one of live / stale / silent. */
  statusChips: MeterState[];
  /** Separate link-quality / reach flags (weak-rssi, poor-snr, multi-gw) used for filtering. */
  diagnostics: MeterState[];
  gatewaysHeard: MeterReceptionPath[];
}

export interface RawFrameItem {
  id: string;
  decodedAt: string;
  meterTimestamp: string;
  meterId: string;
  devEui: string | null;
  gatewayId: string;
  gatewayAlias: string;
  fCnt: number | null;
  fPort: number | null;
  frequency: number | null;
  dr: number | null;
  rssi: number | null;
  snr: number | null;
  confirmed: boolean;
  adr: boolean;
  checksumStatus: string;
  statusByte: number;
  statusEvent: 'FRAME_RECEIVED' | 'WEAK_RSSI' | 'POOR_LINK';
  /** True when more than one gateway heard this frame's meter in the selected window. */
  multiGateway?: boolean;
}

export interface NetworkKpiData {
  gatewaysWithTraffic: number;
  totalConfiguredGateways: number;
  noRecentTrafficGateways: number;
  uniqueMetersSeen: number;
  framesReceived: number;
  framesTrendPct: number | null;
  lastFrameAt: string | null;
  multiGatewayMeters: number;
  avgRssi: number | null;
  avgSnr: number | null;
}
