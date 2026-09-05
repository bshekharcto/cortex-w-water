// Network health thresholds per Cortex-W specification §16
export const networkHealthThresholds = {
  gatewayStaleMinutes: 15,
  gatewayCriticalMinutes: 60,
  meterStaleMinutes: 60,
  meterCriticalHours: 24,
  gatewayTrafficDropWarningPct: 30,
  gatewayTrafficDropCriticalPct: 60,
  rssiWeakDbm: -95,
  rssiCriticalDbm: -105,
  snrWeakDb: -10,
  snrCriticalDb: -18,
};
