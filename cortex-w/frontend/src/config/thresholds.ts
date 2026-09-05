import { runtimeConfig } from './runtimeConfig';

/**
 * Display-only thresholds (spec section 19 / 34). These drive UI banding
 * ONLY. They must never be sent to the backend as if they were backend
 * semantics, and the backend's own 36h meter-health freshness window
 * (spec 23.2) must not be silently redefined here — it is exposed as a
 * config default, not hard-coded logic.
 */
export const thresholds = {
  meterFreshnessHours: runtimeConfig.METER_FRESHNESS_HOURS,

  rssiBandsDbm: {
    strong: -80,   // >= -80
    good: -90,     // -81 to -90
    weak: -100,    // -91 to -100
    // < -100 => veryWeak
  },

  snrBandsDb: {
    excellent: 5,  // >= 5
    good: 0,       // 0 to <5
    marginal: -10, // -10 to <0
    // < -10 => poor
  },
} as const;
