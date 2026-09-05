import type { SeedProvenance } from '../provenance';

export const ALARM_SEED_PROVENANCE: SeedProvenance = 'RAW_EXPORT_2026_09_04';

export type AlarmSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AlarmStatus = 'Open' | 'Acknowledged' | 'Assigned' | 'Resolved';

export interface SeedAlarm {
  id: string;
  category: string;
  rule: string;
  severity: AlarmSeverity;
  status: AlarmStatus;
  entityType: 'meter' | 'gateway';
  entityId: string;
  site: string;
  createdAt: string;
  description: string;
  affectedCount?: number;
}

/** Spec 13.5 — seed alarm counts derived from 04 Sep telemetry */
export const alarmSeed: SeedAlarm[] = [
  { id: 'ALM-001', category: 'Device Health', rule: 'Battery Abnormal', severity: 'high', status: 'Open', entityType: 'meter', entityId: 'fleet', site: 'BHUBANESWAR', createdAt: '2026-09-04T10:00:00Z', description: 'Battery health reported as Abnormal', affectedCount: 901 },
  { id: 'ALM-002', category: 'Device Health', rule: 'Valve Abnormal', severity: 'high', status: 'Open', entityType: 'meter', entityId: 'fleet', site: 'BHUBANESWAR', createdAt: '2026-09-04T10:00:00Z', description: 'Valve health reported as Abnormal', affectedCount: 1010 },
  { id: 'ALM-003', category: 'Communication', rule: 'Weak SNR', severity: 'medium', status: 'Open', entityType: 'meter', entityId: 'fleet', site: 'BHUBANESWAR', createdAt: '2026-09-04T10:00:00Z', description: 'SNR below -10 dB marginal threshold', affectedCount: 1580 },
  { id: 'ALM-004', category: 'Communication', rule: 'Weak RSSI', severity: 'medium', status: 'Open', entityType: 'meter', entityId: 'fleet', site: 'BHUBANESWAR', createdAt: '2026-09-04T10:00:00Z', description: 'RSSI below -90 dBm weak threshold', affectedCount: 800 },
  { id: 'ALM-005', category: 'Data Quality', rule: 'Meter Clock Anomaly', severity: 'medium', status: 'Open', entityType: 'meter', entityId: '0024004083', site: 'BHUBANESWAR', createdAt: '2026-09-04T10:00:00Z', description: 'MeterTimestamp is implausible (year 20142)' },
  { id: 'ALM-006', category: 'Data Quality', rule: 'Meter Clock Anomaly', severity: 'medium', status: 'Open', entityType: 'meter', entityId: '0024004068', site: 'BHUBANESWAR', createdAt: '2026-09-04T10:00:00Z', description: 'MeterTimestamp is far-future (year 2074)' },
  { id: 'ALM-007', category: 'Coverage', rule: 'Unmapped Meter', severity: 'low', status: 'Open', entityType: 'meter', entityId: 'fleet', site: 'BHUBANESWAR', createdAt: '2026-09-04T10:00:00Z', description: 'Meter rows without Household ID', affectedCount: 328 },
  { id: 'ALM-008', category: 'Communication', rule: 'Gateway Low Traffic', severity: 'high', status: 'Open', entityType: 'gateway', entityId: '506f980000000341', site: 'BHUBANESWAR', createdAt: '2026-09-04T10:00:00Z', description: 'Gateway GW-Lima hearing only 5 meters' },
  { id: 'ALM-009', category: 'Communication', rule: 'Gateway Low Traffic', severity: 'critical', status: 'Open', entityType: 'gateway', entityId: '506f980000000297', site: 'BHUBANESWAR', createdAt: '2026-09-04T10:00:00Z', description: 'Gateway GW-November hearing only 1 meter' },
];
