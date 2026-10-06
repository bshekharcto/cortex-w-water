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
  /** A backend-made grouping ("Others"), not a real site-tree area — don't count it as a configured area. */
  synthetic?: boolean;
  totalDevices: number;
  connected: number;
  disconnected: number;
  neverSeen: number;
  yesterdayFlowM3: number;
  todayFlowM3: number;
  monthToDateFlowM3: number;
  meterCount: number;
  dataTimestamp?: string;
}

export interface MeterRow {
  assetId?: number | null;       // real upstream asset id — required to look up live meter detail
  devEui?: string | null;        // real LoRaWAN DevEUI, looked up from synced Postgres telemetry — null if not yet synced
  meterId: string;               // physical meter number
  consumerId?: string;
  consumerName?: string;
  address?: string;
  totalizerM3?: number | null;   // latest cumulative reading — null when no source has one (never 0)
  latestReadingAt?: string;      // ISO timestamp
  connectivityStatus: 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN';
  subDmaName?: string;
  distanceMeters?: number;
  isWithin1km?: boolean;
}
