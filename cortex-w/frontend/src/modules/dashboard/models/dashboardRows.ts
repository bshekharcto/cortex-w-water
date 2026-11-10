// Generic node in the real site hierarchy (district / zone / DMA / ... —
// whatever depth cog-core-api's GET /api/site/ actually has right now).
// Nothing in this app hardcodes level names or a fixed depth; a node is
// just a node, distinguished only by `level` and `hasChildren`.
export interface NodeRow {
  id: string;
  name: string;
  level: number | null;
  levelLabel?: string;           // what this level is called for the client ("ULB", "Division"); "Area" when none is set
  levelLabelPlural?: string;
  parentId: string | null;
  parentName: string | null;
  hasChildren: boolean;
  totalDevices: number;
  connected: number;
  disconnected: number;
  neverSeen: number;
  active25h: number;             // meters with a frame in the last 25 hours
  everConnected: number;             // meters that have sent a frame, ever
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
  active25h: boolean;            // sent a frame in the last 25 hours
  subDmaName?: string;
  distanceMeters?: number;
  isWithin1km?: boolean;
}
