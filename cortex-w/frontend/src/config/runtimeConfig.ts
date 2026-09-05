import { z } from 'zod';

/**
 * Reads window.__CORTEX_W_RUNTIME_CONFIG__, injected by public/runtime-config.js
 * BEFORE this bundle runs. Never read import.meta.env for anything that must
 * differ between deployed environments of the same built image — see spec
 * section 17.1 / 42.
 */
const RuntimeConfigSchema = z.object({
  APP_DATA_MODE: z.enum(['seed', 'api', 'hybrid']).default('seed'),
  API_BASE_URL: z.string().url(),
  GOOGLE_MAPS_API_KEY: z.string().default(''),
  SHOW_DEMO_AUTH: z.boolean().default(false),
  ENABLE_HYDRAULIC_SEED: z.boolean().default(true),
  METER_FRESHNESS_HOURS: z.number().default(36),
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

declare global {
  interface Window {
    __CORTEX_W_RUNTIME_CONFIG__?: unknown;
  }
}

function readRuntimeConfig(): RuntimeConfig {
  const raw = (window.__CORTEX_W_RUNTIME_CONFIG__ as any) ?? {};
  if (!raw.GOOGLE_MAPS_API_KEY && (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY) {
    raw.GOOGLE_MAPS_API_KEY = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY;
  }
  const parsed = RuntimeConfigSchema.safeParse(raw);
  if (!parsed.success) {
    // Fail loud in dev, degrade to safe seed-mode defaults in prod rather
    // than crashing the whole shell on a misconfigured container.
    // eslint-disable-next-line no-console
    console.error('Invalid runtime config, falling back to seed mode', parsed.error);
    return RuntimeConfigSchema.parse({ API_BASE_URL: 'http://localhost:4000/api' });
  }
  return parsed.data;
}

export const runtimeConfig: RuntimeConfig = readRuntimeConfig();
