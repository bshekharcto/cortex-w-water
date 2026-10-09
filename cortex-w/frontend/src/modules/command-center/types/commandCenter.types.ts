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
  lastSeenLocal?: string; // lastSeenDate as clock time at the site
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
  localTime?: string; // decodedAt as clock time at the site
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
  statusEvent: 'FRAME_RECEIVED' | 'WEAK_RSSI' | 'POOR_LINK' | 'MULTI_GW' | 'DEGRADED';
  statusByte?: number | null;
  /** True when more than one gateway heard this frame. */
  multiGateway?: boolean;
}

export interface NetworkKpiData {
  gatewaysWithTraffic: number;
  totalConfiguredGateways: number;
  uniqueMetersSeen: number;
  configuredMeters: number;
  framesReceived: number;
  framesTrend: string;
  lastFrameAge: string;
  multiGatewayMeters: number;
  avgRssi: number;
  avgSnr: number;
}

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

export type TrafficBucket = '5m' | '15m' | '1h' | '1d';
export type TrafficMetric = 'frames' | 'meters';

export interface TrafficPoint {
  /** Start of the bucket on the site clock, "YYYY-MM-DDTHH:MM". */
  t: string;
  frames: number;
  meters: number;
}

export interface TrafficSeries {
  bucket: TrafficBucket;
  tz: string;
  current: TrafficPoint[];
  /** The previous equal-length period, aligned bucket for bucket with `current`. */
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
