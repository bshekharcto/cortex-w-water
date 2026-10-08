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
  trendsEnabled: boolean;
  rssiBands: { strong: number; good: number; weak: number };
  snrBands: { excellent: number; good: number; marginal: number };
}

export type GatewayState = 'reporting' | 'degraded' | 'stale' | 'no-traffic' | 'never-observed';
export type MeterState = 'live' | 'stale' | 'silent' | 'weak-rssi' | 'poor-snr' | 'multi-gw' | 'fcnt-gap' | 'gw-changed';
export type GatewayTabType = 'METERS' | 'FRAMES' | 'TRAFFIC' | 'RADIO';
export type TimeWindow = '1H' | '6H' | 'TODAY' | '7D' | '30D' | 'CUSTOM';

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
  /** Meters on this gateway that at least one other gateway also heard in the window. */
  multiGatewayMeters?: number;
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
  checksumStatus?: string | null;
  statusByte?: number | null;
  /** The meter's own clock, as reported. Often wrong, so it is shown separately and never used for freshness. */
  meterTimestamp?: string | null;
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

export type TrafficBucket = '5m' | '15m' | '1h' | '1d';
export type TrafficMetric = 'frames' | 'meters';

export interface TrafficPoint {
  /** Start of the bucket in the operational timezone, "YYYY-MM-DDTHH:MM". */
  t: string;
  frames: number;
  meters: number;
}

export interface TrafficSeries {
  bucket: TrafficBucket;
  tz: string;
  current: TrafficPoint[];
  previous: TrafficPoint[];
  totals: { frames: number; meters: number; prevFrames: number; prevMeters: number };
  comparable: boolean;
}

export interface RadioMeterStat {
  meterId: string;
  avgRssi: number;
  avgSnr: number | null;
  frames: number;
}

export interface RadioHealthData {
  totals: { frames: number; meters: number; avgRssi: number | null; avgSnr: number | null };
  rssiBuckets: { strong: number; good: number; weak: number; veryWeak: number };
  snrBuckets: { excellent: number; good: number; marginal: number; poor: number };
  byDr: Array<{ dr: number | null; frames: number }>;
  byFrequency: Array<{ frequencyHz: number | null; frames: number }>;
  weakLinkMeters: number;
  repeatWeakMeters: number;
  strongest: RadioMeterStat[];
  weakest: RadioMeterStat[];
}
