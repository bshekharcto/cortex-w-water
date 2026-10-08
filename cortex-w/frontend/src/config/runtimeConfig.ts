import { z } from 'zod';

/**
 * Reads window.__CORTEX_W_RUNTIME_CONFIG__, injected by public/runtime-config.js
 * BEFORE this bundle runs, so one built image can move between environments.
 *
 * Precedence, highest first:
 *   1. a build-time VITE_* variable, when a deploy sets one deliberately (a
 *      static host such as Vercel has no container start to regenerate
 *      runtime-config.js, so this is its only per-environment switch);
 *   2. the injected runtime config;
 *   3. the schema defaults below.
 * Nothing here guesses a backend host: with no API_BASE_URL configured the
 * app calls the same origin's /api, and fails visibly if nothing answers there.
 */
const RuntimeConfigSchema = z.object({
  APP_DATA_MODE: z.enum(['seed', 'api', 'hybrid']).default('api'),
  API_BASE_URL: z.string().default('/api'),
  GOOGLE_MAPS_API_KEY: z.string().default(''),
  SHOW_DEMO_AUTH: z.boolean().default(false),
  // Off unless a deployment explicitly turns it on: absence must never mean fake data.
  ENABLE_HYDRAULIC_SEED: z.boolean().default(false),
  METER_FRESHNESS_HOURS: z.number().default(36),
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

declare global {
  interface Window {
    __CORTEX_W_RUNTIME_CONFIG__?: unknown;
  }
}

function readRuntimeConfig(): RuntimeConfig {
  const raw = { ...((window.__CORTEX_W_RUNTIME_CONFIG__ as Record<string, unknown>) ?? {}) };
  const env = (import.meta as any).env ?? {};

  if (!raw.GOOGLE_MAPS_API_KEY && env.VITE_GOOGLE_MAPS_API_KEY) {
    raw.GOOGLE_MAPS_API_KEY = env.VITE_GOOGLE_MAPS_API_KEY;
  }
  if (env.VITE_API_BASE_URL) raw.API_BASE_URL = env.VITE_API_BASE_URL;
  if (env.VITE_APP_DATA_MODE) raw.APP_DATA_MODE = env.VITE_APP_DATA_MODE;

  const parsed = RuntimeConfigSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('Invalid runtime config, falling back to defaults', parsed.error);
    return RuntimeConfigSchema.parse({
      API_BASE_URL: typeof raw.API_BASE_URL === 'string' && raw.API_BASE_URL ? raw.API_BASE_URL : '/api',
      APP_DATA_MODE: raw.APP_DATA_MODE === 'seed' || raw.APP_DATA_MODE === 'hybrid' ? raw.APP_DATA_MODE : 'api',
    });
  }
  return parsed.data;
}

export const runtimeConfig: RuntimeConfig = readRuntimeConfig();
