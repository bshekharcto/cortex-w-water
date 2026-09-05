import { runtimeConfig } from './runtimeConfig';

export const featureFlags = {
  showDemoAuth: runtimeConfig.SHOW_DEMO_AUTH,
  enableHydraulicSeed: runtimeConfig.ENABLE_HYDRAULIC_SEED,
  // Hydraulic Analysis has no backend contract yet (spec 14.1) — always
  // seed-backed regardless of global data mode until a real API exists.
  hydraulicIsAlwaysSeed: true,
} as const;
