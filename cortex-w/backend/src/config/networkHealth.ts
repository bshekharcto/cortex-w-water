// Single source of truth for Command Center health thresholds (Cortex-W spec §16).
// The summary response carries these to the frontend so both sides always agree.
// Cadence-aware freshness. This fleet's meters transmit once a day, so "fresh" means "reported within the
// last day": live < 24h, stale 24-48h (missed one expected report), silent > 48h (missed two or more).
// Gateways aggregate the same daily meters, so they use the same limits.
export const networkHealthThresholds = {
  gatewayStaleMinutes: 24 * 60,
  gatewayCriticalMinutes: 48 * 60,
  meterStaleMinutes: 24 * 60,
  meterCriticalHours: 48,
  gatewayTrafficDropWarningPct: 30,
  gatewayTrafficDropCriticalPct: 60,
  rssiWeakDbm: -95,
  rssiCriticalDbm: -105,
  snrWeakDb: -10,
  snrCriticalDb: -18,
  // A trend needs at least this many frames in the previous period, or tiny samples read as huge swings.
  trendMinPrevFrames: 20,
  // Frame-count trends compare a window with the one before it. Right now that is not trustworthy: the stored
  // days mix two data shapes (older multi-frame days vs newer one-row-per-meter days) and recent days are cut
  // off by the 3,000-row ingestion limit, so "frames fell 25%" is an artefact. Keep this off until the database
  // project has fixed ingestion; then switch it on (or trend distinct meters instead of frames).
  trendsEnabled: false,
} as const;

export type NetworkHealthThresholds = typeof networkHealthThresholds;
