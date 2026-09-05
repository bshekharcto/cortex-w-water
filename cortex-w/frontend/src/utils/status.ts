import { differenceInHours, parseISO } from 'date-fns';
import { thresholds } from '@/config/thresholds';

export type MeterStatus = 'Reporting' | 'Delayed' | 'Silent' | 'Never Seen' | 'Data Quality Issue';
export type GatewayStatus = 'Reporting' | 'Degraded' | 'No Recent Traffic' | 'No Data in Period';
export type HealthStatus = 'Normal' | 'Warning' | 'Abnormal' | 'Unknown';

/**
 * Derive meter status from decoded-at (arrival time), NOT MeterTimestamp.
 * spec 34: "Do not use device MeterTimestamp as the sole connectivity indicator."
 */
export function classifyMeterStatus(decodedAt: string | null | undefined): MeterStatus {
  if (!decodedAt) return 'Never Seen';
  const hoursAgo = differenceInHours(new Date(), parseISO(decodedAt));
  if (hoursAgo <= thresholds.meterFreshnessHours * 0.5) return 'Reporting';
  if (hoursAgo <= thresholds.meterFreshnessHours) return 'Delayed';
  return 'Silent';
}

export function classifyGatewayStatus(latestMeterDecodedAt: string | null | undefined, metersCount: number): GatewayStatus {
  if (!latestMeterDecodedAt || metersCount === 0) return 'No Data in Period';
  const hoursAgo = differenceInHours(new Date(), parseISO(latestMeterDecodedAt));
  if (hoursAgo <= thresholds.meterFreshnessHours) return 'Reporting';
  if (hoursAgo <= thresholds.meterFreshnessHours * 2) return 'No Recent Traffic';
  return 'No Data in Period';
}

export function classifyHealth(value: string | undefined): HealthStatus {
  if (!value) return 'Unknown';
  const lower = value.toLowerCase();
  if (lower === 'normal') return 'Normal';
  if (lower === 'abnormal') return 'Abnormal';
  return 'Unknown';
}
