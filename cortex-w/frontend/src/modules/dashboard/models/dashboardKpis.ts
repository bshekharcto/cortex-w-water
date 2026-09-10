export interface DashboardKpis {
  childAreaCount?: number;       // Total Zones (global) or Total DMA Zones (zone) — omitted at DMA level

  totalDevices: number;
  connected: number;
  disconnected: number;
  neverSeen: number;

  connectedPct: number;          // connected / totalDevices * 100
  disconnectedPct: number;
  neverSeenPct: number;

  yesterdayFlowM3: number;
  todayFlowM3: number;
  monthToDateFlowM3: number;

  dataTimestamp?: string;        // ISO timestamp of data freshness
}
