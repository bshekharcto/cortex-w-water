export interface ZoneRow {
  zoneId: string;
  zoneName: string;
  totalDevices: number;
  connected: number;
  disconnected: number;
  neverSeen: number;
  yesterdayFlowM3: number;
  todayFlowM3: number;
  monthToDateFlowM3: number;
  dataTimestamp?: string;
}

export interface DmaRow {
  dmaId: string;
  dmaName: string;
  zoneId: string;
  zoneName: string;
  totalDevices: number;
  connected: number;
  disconnected: number;
  neverSeen: number;
  yesterdayFlowM3: number;
  todayFlowM3: number;
  monthToDateFlowM3: number;
  dataTimestamp?: string;
}

export interface MeterRow {
  zoneName: string;
  dmaName: string;
  deviceId: string;              // DevEUI / IMEI
  meterId: string;               // physical meter number
  meterType?: string;
  consumerId?: string;
  consumerName?: string;
  address?: string;
  meterSize?: string;
  totalizerM3?: number;          // latest cumulative reading
  latestReadingAt?: string;      // ISO timestamp
  connectivityStatus: 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN';
  subDmaName?: string;
  distanceMeters?: number;
  isWithin1km?: boolean;
}
