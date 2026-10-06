import type { NetworkHealthThresholds } from '../../config/networkHealth.js';

/** One row of raw_telemetry_packets as it comes back from Postgres. */
export interface PacketRow {
  id?: string | number;
  meter_id: string;
  gateway_id: string;
  dev_eui: string | null;
  decoded_at: Date | string;
  date_key: string;
  checksum_status: string | null;
  status_byte: number | null;
  rssi: number | null;
  snr: number | null;
  /** -1 means "upstream sent none" (it is part of the dedupe key, so it can't be NULL). */
  fcnt: number;
  fport: number | null;
  /** BIGINT: Postgres returns it as a string. */
  frequency: string | number | null;
  dr: number | null;
  adr: boolean | null;
  confirmed: boolean | null;
  meter_timestamp: string | null;
}

export type MeterState = 'live' | 'stale' | 'silent' | 'weak-rssi' | 'poor-snr' | 'multi-gw';

/** A frame as the Command Center renders it. */
export interface FrameDto {
  multiGateway: boolean;
  id: string;
  decodedAt: Date | string;
  meterTimestamp: string | Date;
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
  confirmed: boolean | null;
  adr: boolean | null;
  checksumStatus: string | null;
  statusByte: number | null;
  statusEvent: 'FRAME_RECEIVED' | 'WEAK_RSSI' | 'POOR_LINK';
}

export interface TelemetrySummary {
  dateRange: { fromDate: string; toDate: string; days: number; fromTs: string; toTs: string; window: string };
  generatedAt: string;
  source: 'postgresql';
  thresholds: NetworkHealthThresholds;
  /** True while a manual Refresh is still pulling and rebuilding in the background. Added per response, never cached. */
  refreshing?: boolean;
  kpis: {
    gatewaysWithTraffic: number;
    totalConfiguredGateways: number;
    noRecentTrafficGateways: number;
    uniqueMetersSeen: number;
    framesReceived: number;
    /** % change in frames vs the previous equal-length period; null when it can't be compared honestly. */
    framesTrendPct: number | null;
    lastFrameAt: string | null;
    multiGatewayMeters: number;
    avgRssi: number | null;
    avgSnr: number | null;
  };
  gateways: Array<{
    gatewayId: string;
    alias: string;
    uniqueMeters: number;
    frameCount: number;
    lastFrameDecodedAt: string | null;
    avgRssi: number | null;
    avgSnr: number | null;
    /** % change in frames vs the previous equal-length period; null when it can't be compared honestly. */
    trendPct: number | null;
    /** Meters on this gateway that at least one other gateway also heard in the window. */
    multiGatewayMeters: number;
    status: 'reporting' | 'degraded' | 'stale' | 'no-traffic';
  }>;
  recentFrames: FrameDto[];
}
