import { runtimeConfig } from '@/config/runtimeConfig';

type DataMode = typeof runtimeConfig.APP_DATA_MODE;

/**
 * Spec 17.2: pages consume the interface, never a concrete seed service.
 * Factory returns the right implementation per APP_DATA_MODE. Hybrid
 * mode can override per-module (e.g. hydraulic is always seed).
 */
export function createRepository<T>(
  seedImpl: T,
  apiImpl: T,
  moduleOverride?: DataMode,
): T {
  const mode = moduleOverride ?? runtimeConfig.APP_DATA_MODE;
  switch (mode) {
    case 'seed': return seedImpl;
    case 'api': return apiImpl;
    case 'hybrid': return apiImpl; // default to api in hybrid; caller can override
    default: return seedImpl;
  }
}
