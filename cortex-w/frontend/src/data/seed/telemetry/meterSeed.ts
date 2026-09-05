import type { SeedProvenance } from '../provenance';

export const METER_SEED_PROVENANCE: SeedProvenance = 'RAW_EXPORT_2026_09_04';

/**
 * Spec 18.2 — representative meter rows. The full 2,532 rows live in the
 * Postgres seed table loaded via backend migrations; the frontend keeps a
 * small representative subset for fast component dev + unit tests.
 *
 * The intentionally odd MeterTimestamp values are preserved on purpose
 * (spec 18.2 note). The decoded timestamp is the reliable arrival time.
 */
export const meterSeedSample = [
  { meterId: '0024004061', householdId: 'WS/BMC/1520247', gatewayId: '506f9800000002a3', forwardFlowL: 229.97, batteryVoltage: 3.6, batteryHealth: 'Abnormal', valveHealth: 'Abnormal', rssi: -91, snr: -17.8, valveStatus: 'Closed', decodedAt: '2026-09-04T03:16:27.388821272Z', meterTimestamp: '2024-08-04 09:01:00', checksumStatus: 'OK', confirmed: true, adr: false, siteId: '6394', siteName: 'BHUBANESWAR' },
  { meterId: '0024004067', householdId: 'WS/BMC/1490971', gatewayId: '506f980000000340', forwardFlowL: 27.93, batteryVoltage: 3.6, batteryHealth: 'Normal', valveHealth: 'Abnormal', rssi: -91, snr: -9.8, valveStatus: 'Open', decodedAt: '2026-09-04T05:45:13.412918942Z', meterTimestamp: '2029-11-04 09:01:01', checksumStatus: 'OK', confirmed: true, adr: false, siteId: '6394', siteName: 'BHUBANESWAR' },
  { meterId: '0024004068', householdId: 'WS/BMC/1488809', gatewayId: '506f9800000002a8', forwardFlowL: 46.12, batteryVoltage: 3.6, batteryHealth: 'Abnormal', valveHealth: 'Abnormal', rssi: -91, snr: -18.8, valveStatus: 'Closed', decodedAt: '2026-09-04T06:10:13.956310598Z', meterTimestamp: '2074-11-04 09:01:00', checksumStatus: 'OK', confirmed: true, adr: false, siteId: '6394', siteName: 'BHUBANESWAR' },
  { meterId: '0024004081', householdId: 'WS/BMC/2500692', gatewayId: '506f9800000002a5', forwardFlowL: 38.63, batteryVoltage: 3.6, batteryHealth: 'Normal', valveHealth: 'Normal', rssi: -87, snr: -14.0, valveStatus: 'Closed', decodedAt: '2026-09-04T03:21:43.885584015Z', meterTimestamp: '2012-08-04 09:01:00', checksumStatus: 'OK', confirmed: true, adr: false, siteId: '6394', siteName: 'BHUBANESWAR' },
  { meterId: '0024004083', householdId: 'WS/BMC/2490326', gatewayId: '506f9800000002a3', forwardFlowL: 0.07, batteryVoltage: 3.6, batteryHealth: 'Normal', valveHealth: 'Abnormal', rssi: -91, snr: -17.8, valveStatus: 'Open', decodedAt: '2026-09-04T04:09:55.748170315Z', meterTimestamp: '20142-09-04 09:59:04', checksumStatus: 'OK', confirmed: true, adr: false, siteId: '6394', siteName: 'BHUBANESWAR' },
  { meterId: '0024004086', householdId: 'WS/BMC/1446931', gatewayId: '506f980000000261', forwardFlowL: 58.70, batteryVoltage: 3.6, batteryHealth: 'Normal', valveHealth: 'Normal', rssi: -97, snr: -22.0, valveStatus: 'Open', decodedAt: '2026-09-04T05:25:25.243328683Z', meterTimestamp: '2017-10-04 09:01:00', checksumStatus: 'OK', confirmed: true, adr: false, siteId: '6394', siteName: 'BHUBANESWAR' },
  { meterId: '0024004092', householdId: 'WS/BMC/1490019', gatewayId: '506f980000000340', forwardFlowL: 26.86, batteryVoltage: 3.6, batteryHealth: 'Abnormal', valveHealth: 'Abnormal', rssi: -92, snr: -9.8, valveStatus: 'Closed', decodedAt: '2026-09-04T03:46:36.285197246Z', meterTimestamp: '2030-09-04 09:01:00', checksumStatus: 'OK', confirmed: true, adr: false, siteId: '6394', siteName: 'BHUBANESWAR' },
  { meterId: '0024004094', householdId: 'WS/BMC/2379686', gatewayId: '506f980000000340', forwardFlowL: 612.35, batteryVoltage: 3.6, batteryHealth: 'Normal', valveHealth: 'Normal', rssi: -93, snr: -19.5, valveStatus: 'Closed', decodedAt: '2026-09-04T04:34:15.693351200Z', meterTimestamp: '2024-10-04 09:01:00', checksumStatus: 'OK', confirmed: true, adr: false, siteId: '6394', siteName: 'BHUBANESWAR' },
  { meterId: '0024004099', householdId: 'WS/BMC/1507661', gatewayId: '506f980000000299', forwardFlowL: 172.09, batteryVoltage: 3.6, batteryHealth: 'Abnormal', valveHealth: 'Abnormal', rssi: -87, snr: -17.0, valveStatus: 'Closed', decodedAt: '2026-09-04T06:37:45.777374065Z', meterTimestamp: '2023-12-04 09:01:01', checksumStatus: 'OK', confirmed: true, adr: false, siteId: '6394', siteName: 'BHUBANESWAR' },
  { meterId: '0024004110', householdId: 'WS/BMC/2501194', gatewayId: '506f98000000029e', forwardFlowL: 1.66, batteryVoltage: 3.6, batteryHealth: 'Normal', valveHealth: 'Abnormal', rssi: -90, snr: -13.2, valveStatus: 'Open', decodedAt: '2026-09-04T02:36:19.260165715Z', meterTimestamp: '2044-08-04 09:59:04', checksumStatus: 'OK', confirmed: true, adr: false, siteId: '6394', siteName: 'BHUBANESWAR' },
];
