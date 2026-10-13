// Single source of truth for Command Center health thresholds (Cortex-W spec §16).
// The summary response carries these to the frontend so both sides always agree.
// Cadence-aware freshness. This fleet's meters transmit once a day. A METER is "connected" when its last frame arrived
// within meterConnectedHours (7 days), "disconnected" when it arrived earlier, and "never seen" when it has no frame at
// all. Every page (Dashboard, Command Center, Network Explorer) reads this one number.
// A GATEWAY aggregates the same daily meters: live < 24h, stale 24-48h, no-traffic when it sent nothing in the window.
export const networkHealthThresholds = {
  gatewayStaleMinutes: 24 * 60,
  gatewayCriticalMinutes: 48 * 60,
  meterConnectedHours: 7 * 24,
  gatewayTrafficDropWarningPct: 30,
  gatewayTrafficDropCriticalPct: 60,
  rssiWeakDbm: -95,
  rssiCriticalDbm: -105,
  snrWeakDb: -10,
  snrCriticalDb: -18,
  // A gateway whose average over the window is this bad is "degraded" (looser than the per-frame weak limits above).
  avgRssiDegradedDbm: -105,
  avgSnrDegradedDb: -15,
  // A gateway that sent a frame within this many days is "known": it is listed, as "no traffic" when it is silent.
  knownGatewayDays: 30,
  // A trend needs at least this many frames in the previous period, or tiny samples read as huge swings.
  trendMinPrevFrames: 20,
  // Frame-count trends compare a window with the one before it. Right now that is not trustworthy: the stored
  // days mix two data shapes (older multi-frame days vs newer one-row-per-meter days) and recent days are cut
  // off by the 3,000-row ingestion limit, so "frames fell 25%" is an artefact. Keep this off until the database
  // project has fixed ingestion; then switch it on (or trend distinct meters instead of frames).
  trendsEnabled: false,
  // Radio Health display bands (UI defaults from the spec, kept here so there is one source of truth)
  rssiBands: { strong: -80, good: -90, weak: -100 }, // >= strong | >= good | >= weak | below
  snrBands: { excellent: 5, good: 0, marginal: -10 }, // >= excellent | >= good | >= marginal | below
} as const;

export type NetworkHealthThresholds = typeof networkHealthThresholds;

/**
 * The timezone operators work in. Traffic charts bucket days and hours in it, so "today" and "09:00"
 * mean the same thing to everyone looking at the page (India has no daylight saving).
 */
export const OPERATIONAL_TZ = 'Asia/Kolkata';

/**
 * The 12 hex characters the gateway EUIs of this fleet share: the ingestion keeps only the last 4 in gateway_list.
 * Set GATEWAY_EUI_PREFIX for another vendor or tenant.
 */
export const GATEWAY_EUI_PREFIX = (process.env.GATEWAY_EUI_PREFIX ?? '506f98000000').toLowerCase();
