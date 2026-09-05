import type { SeedProvenance } from '../provenance';

export const DASHBOARD_SEED_PROVENANCE: SeedProvenance = 'EXISTING_UI_REFERENCE';

/**
 * Spec 7.2 seed snapshot values. These are the numbers to show when
 * APP_DATA_MODE=seed. In API mode the repository calls the real endpoints.
 */
export const dashboardSeed = {
  installation: {
    householdsOnboarded: 193_125,
    metersConfigured: 27_996,
    householdsMapped: 18_364,
    installationsToday: 18,
    reportingMeters: 2_532,       // from 04-Sep raw seed unique count
  },
  supply: {
    totalConsumptionKL: 2_338.92,
    avgConsumptionPerMeterKL: 0.9,
    noSupply: 15_778,
    reverseFlowEvents: 0,
    valveAbnormal: 1_010,
  },
  network: {
    configuredGateways: 18,       // from existing gateway summary visual
    gatewaysReporting: 14,        // from 04-Sep raw seed
    reportingMeters: 2_532,
    checksumOk: 100,              // percent
  },
  attention: [
    { severity: 'critical', issue: 'Gateway stopped reporting', entity: 'GW-Lima', site: 'BHUBANESWAR', ageHours: 72, link: '/app/command-center' },
    { severity: 'high', issue: 'Battery abnormal', entity: '901 meters', site: 'BHUBANESWAR', ageHours: 24, link: '/app/ai/alarms' },
    { severity: 'high', issue: 'Valve abnormal', entity: '1,010 meters', site: 'BHUBANESWAR', ageHours: 24, link: '/app/ai/alarms' },
    { severity: 'medium', issue: 'Meter clock anomaly', entity: '5 meters', site: 'BHUBANESWAR', ageHours: 24, link: '/app/ai/alarms' },
    { severity: 'medium', issue: 'Consumer/meter mapping missing', entity: '328 meters', site: 'BHUBANESWAR', ageHours: 48, link: '/app/consumer/households' },
    { severity: 'low', issue: 'Poor SNR', entity: '~60% of fleet', site: 'BHUBANESWAR', ageHours: 24, link: '/app/command-center' },
  ],
  trend7d: {
    reportingMeters: [2_480, 2_495, 2_510, 2_502, 2_520, 2_516, 2_532],
    consumption: [2_200, 2_280, 2_310, 2_295, 2_340, 2_325, 2_339],
    gatewayCount: [14, 14, 14, 14, 14, 14, 14],
    alarmsOpened: [12, 8, 15, 6, 9, 11, 7],
    labels: ['29 Aug', '30 Aug', '31 Aug', '01 Sep', '02 Sep', '03 Sep', '04 Sep'],
  },
};
