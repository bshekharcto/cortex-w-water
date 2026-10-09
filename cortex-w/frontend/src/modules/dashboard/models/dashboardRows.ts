// Generic node in the real site hierarchy (district / zone / DMA / ... —
// whatever depth cog-core-api's GET /api/site/ actually has right now).
// Nothing in this app hardcodes level names or a fixed depth; a node is
// just a node, distinguished only by `level` and `hasChildren`.
export interface NodeRow {
  id: string;
  name: string;
  level: number | null;
  parentId: string | null;
  parentName: string | null;
  hasChildren: boolean;
  totalDevices: number;
  connected: number;
  disconnected: number;
  neverSeen: number;
  yesterdayFlowM3: number;
  todayFlowM3: number;
  monthToDateFlowM3: number;
  meterCount: number;
  dataTimestamp?: string;
  dataLocalTime?: string;        // when the numbers were built, as clock time at the area's site
}

export interface MeterRow {
  assetId?: number | null;       // real upstream asset id — required to look up live meter detail
  devEui?: string | null;        // real LoRaWAN DevEUI, looked up from synced Postgres telemetry — null if not yet synced
  meterId: string;               // physical meter number
  meterType?: string;
  consumerId?: string;
  consumerName?: string;
  address?: string;
  meterSize?: string;
  totalizerM3?: number;          // latest cumulative reading
  latestReadingAt?: string;      // ISO timestamp
  latestReadingLocal?: string;   // the same moment as clock time at the meter's site
  connectivityStatus: 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN';
  subDmaName?: string;
  distanceMeters?: number;
  isWithin1km?: boolean;
}
