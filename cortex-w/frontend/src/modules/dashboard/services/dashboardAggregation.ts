import type { DashboardKpis } from '../models/dashboardKpis';
import type { NodeRow, MeterRow } from '../models/dashboardRows';

/**
 * Converts flow values from various units to m³
 * - Litres (L): ÷ 1000
 * - Kilolitres (KL): 1:1 with m³
 * - m³: no conversion
 */
export function convertFlowToM3(val: number, unit: 'L' | 'KL' | 'm3' = 'm3'): number {
  if (!val || isNaN(val)) return 0;
  if (unit === 'L') {
    return val / 1000;
  }
  // KL is 1:1 with m³
  return val;
}

/**
 * Invariant check: Connected + Disconnected + Never Seen = Total Devices
 */
export function validateDeviceInvariant(
  total: number,
  connected: number,
  disconnected: number,
  neverSeen: number
): boolean {
  return total === connected + disconnected + neverSeen;
}

export function convertLToM3(liters: number): number {
  return convertFlowToM3(liters, 'L');
}

export function convertKlToM3(kl: number): number {
  return convertFlowToM3(kl, 'KL');
}

/**
 * Computes rounded percentages ensuring two decimal places
 */
export function computePercentages(
  connected: number,
  disconnected: number,
  neverSeen: number,
  total: number
) {
  if (!total || total <= 0) {
    return { connectedPct: 0, disconnectedPct: 0, neverSeenPct: 0 };
  }
  const connectedPct = Number(((connected / total) * 100).toFixed(2));
  const disconnectedPct = Number(((disconnected / total) * 100).toFixed(2));
  const neverSeenPct = Number(((neverSeen / total) * 100).toFixed(2));
  return { connectedPct, disconnectedPct, neverSeenPct };
}

export function calculatePercentages(
  total: number,
  connected: number,
  disconnected: number,
  neverSeen: number
) {
  return computePercentages(connected, disconnected, neverSeen, total);
}

/**
 * Aggregates KPIs from a list of child nodes — works at any depth (root
 * sites, zones, DMAs, or whatever level cog-core-api's real hierarchy adds
 * next), since a NodeRow's shape doesn't depend on which level it's at.
 */
export function aggregateNodeKpis(nodes: NodeRow[]): DashboardKpis {
  let totalDevices = 0;
  let connected = 0;
  let disconnected = 0;
  let neverSeen = 0;
  let yesterdayFlowM3 = 0;
  let todayFlowM3 = 0;
  let monthToDateFlowM3 = 0;
  let latestTimestamp: string | undefined = undefined;

  for (const n of nodes) {
    totalDevices += n.totalDevices;
    connected += n.connected;
    disconnected += n.disconnected;
    neverSeen += n.neverSeen;
    yesterdayFlowM3 += n.yesterdayFlowM3;
    todayFlowM3 += n.todayFlowM3;
    monthToDateFlowM3 += n.monthToDateFlowM3;
    if (n.dataTimestamp && (!latestTimestamp || n.dataTimestamp > latestTimestamp)) {
      latestTimestamp = n.dataTimestamp;
    }
  }

  // Enforce invariant: Connected + Disconnected + Never Seen = Total Devices
  // If neverSeen wasn't provided, derive it
  if (neverSeen === 0 && (connected + disconnected) < totalDevices) {
    neverSeen = totalDevices - (connected + disconnected);
  }

  const { connectedPct, disconnectedPct, neverSeenPct } = computePercentages(
    connected,
    disconnected,
    neverSeen,
    totalDevices
  );

  return {
    // Real areas only: the synthetic "Others" group isn't a configured sub-area.
    childAreaCount: nodes.filter((n) => !n.synthetic).length,
    totalDevices,
    connected,
    disconnected,
    neverSeen,
    connectedPct,
    disconnectedPct,
    neverSeenPct,
    yesterdayFlowM3: Number(yesterdayFlowM3.toFixed(2)),
    todayFlowM3: Number(todayFlowM3.toFixed(2)),
    monthToDateFlowM3: Number(monthToDateFlowM3.toFixed(2)),
    dataTimestamp: latestTimestamp,
  };
}

/**
 * Aggregates KPIs from a list of meters — used at a real leaf node (one
 * with no further children), where the "child rows" are individual meters
 * instead of sub-nodes.
 */
export function aggregateMeterKpis(
  meters: MeterRow[],
  flowTotals?: { yesterdayFlowM3?: number; todayFlowM3?: number; monthToDateFlowM3?: number }
): DashboardKpis {
  const totalDevices = meters.length;
  let connected = 0;
  let disconnected = 0;
  let neverSeen = 0;
  let latestTimestamp: string | undefined = undefined;

  for (const m of meters) {
    if (m.connectivityStatus === 'CONNECTED') connected++;
    else if (m.connectivityStatus === 'DISCONNECTED') disconnected++;
    else neverSeen++;

    if (m.latestReadingAt && (!latestTimestamp || m.latestReadingAt > latestTimestamp)) {
      latestTimestamp = m.latestReadingAt;
    }
  }

  const { connectedPct, disconnectedPct, neverSeenPct } = computePercentages(
    connected,
    disconnected,
    neverSeen,
    totalDevices
  );

  return {
    // childAreaCount is omitted at leaf/meter level — there's nothing "under" a meter
    totalDevices,
    connected,
    disconnected,
    neverSeen,
    connectedPct,
    disconnectedPct,
    neverSeenPct,
    yesterdayFlowM3: flowTotals?.yesterdayFlowM3 ?? 0,
    todayFlowM3: flowTotals?.todayFlowM3 ?? 0,
    monthToDateFlowM3: flowTotals?.monthToDateFlowM3 ?? 0,
    dataTimestamp: latestTimestamp,
  };
}
