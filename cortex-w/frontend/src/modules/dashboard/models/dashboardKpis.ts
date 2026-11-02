export interface DashboardKpis {
  childAreaCount?: number;       // Total Zones (global) or Total DMA Zones (zone) — omitted at DMA level

  totalDevices: number;
  connected: number;
  disconnected: number;
  neverSeen: number;
  active25h: number;             // sent a frame in the last 25 hours
  active30d: number;             // sent a frame in the last 30 days

  connectedPct: number;          // connected / totalDevices * 100
  disconnectedPct: number;
  neverSeenPct: number;
  active25hPct: number;
  active30dPct: number;

  yesterdayFlowM3: number;
  todayFlowM3: number;
  monthToDateFlowM3: number;

  dataTimestamp?: string;        // ISO timestamp of data freshness
}
