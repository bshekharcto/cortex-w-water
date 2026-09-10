import type { DashboardKpis } from '../models/dashboardKpis';
import type { ZoneRow, DmaRow, MeterRow } from '../models/dashboardRows';

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
 * Aggregates Global KPIs from an array of ZoneRows
 */
export function aggregateGlobalKpis(zones: ZoneRow[]): DashboardKpis {
  let totalDevices = 0;
  let connected = 0;
  let disconnected = 0;
  let neverSeen = 0;
  let yesterdayFlowM3 = 0;
  let todayFlowM3 = 0;
  let monthToDateFlowM3 = 0;
  let latestTimestamp: string | undefined = undefined;

  for (const z of zones) {
    totalDevices += z.totalDevices;
    connected += z.connected;
    disconnected += z.disconnected;
    neverSeen += z.neverSeen;
    yesterdayFlowM3 += z.yesterdayFlowM3;
    todayFlowM3 += z.todayFlowM3;
    monthToDateFlowM3 += z.monthToDateFlowM3;
    if (z.dataTimestamp && (!latestTimestamp || z.dataTimestamp > latestTimestamp)) {
      latestTimestamp = z.dataTimestamp;
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
    childAreaCount: zones.length, // "Total Zones"
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
    dataTimestamp: latestTimestamp || new Date().toISOString(),
  };
}

/**
 * Aggregates Zone KPIs from an array of DmaRows
 */
export function aggregateZoneKpis(dmas: DmaRow[]): DashboardKpis {
  let totalDevices = 0;
  let connected = 0;
  let disconnected = 0;
  let neverSeen = 0;
  let yesterdayFlowM3 = 0;
  let todayFlowM3 = 0;
  let monthToDateFlowM3 = 0;
  let latestTimestamp: string | undefined = undefined;

  for (const d of dmas) {
    totalDevices += d.totalDevices;
    connected += d.connected;
    disconnected += d.disconnected;
    neverSeen += d.neverSeen;
    yesterdayFlowM3 += d.yesterdayFlowM3;
    todayFlowM3 += d.todayFlowM3;
    monthToDateFlowM3 += d.monthToDateFlowM3;
    if (d.dataTimestamp && (!latestTimestamp || d.dataTimestamp > latestTimestamp)) {
      latestTimestamp = d.dataTimestamp;
    }
  }

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
    childAreaCount: dmas.length, // "Total DMA Zones"
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
    dataTimestamp: latestTimestamp || new Date().toISOString(),
  };
}

/**
 * Aggregates DMA KPIs from an array of MeterRows
 */
export function aggregateDmaKpis(
  meters: MeterRow[],
  dmaFlowTotals?: { yesterdayFlowM3?: number; todayFlowM3?: number; monthToDateFlowM3?: number }
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
    // childAreaCount is omitted at DMA level as per spec
    totalDevices,
    connected,
    disconnected,
    neverSeen,
    connectedPct,
    disconnectedPct,
    neverSeenPct,
    yesterdayFlowM3: dmaFlowTotals?.yesterdayFlowM3 ?? 0,
    todayFlowM3: dmaFlowTotals?.todayFlowM3 ?? 0,
    monthToDateFlowM3: dmaFlowTotals?.monthToDateFlowM3 ?? 0,
    dataTimestamp: latestTimestamp || new Date().toISOString(),
  };
}
