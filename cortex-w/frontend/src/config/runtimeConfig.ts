import { z } from 'zod';

/**
 * Reads window.__CORTEX_W_RUNTIME_CONFIG__, injected by public/runtime-config.js
 * BEFORE this bundle runs. Never read import.meta.env for anything that must
 * differ between deployed environments of the same built image — see spec
 * section 17.1 / 42.
 */
const RuntimeConfigSchema = z.object({
  APP_DATA_MODE: z.enum(['seed', 'api', 'hybrid']).default('api'),
  API_BASE_URL: z.string().default('/api'),
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
  const env = (import.meta as any).env ?? {};

  const isCloud = typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1');

  if (!raw.GOOGLE_MAPS_API_KEY && env.VITE_GOOGLE_MAPS_API_KEY) {
    raw.GOOGLE_MAPS_API_KEY = env.VITE_GOOGLE_MAPS_API_KEY;
  }
  if (env.VITE_API_BASE_URL) {
    raw.API_BASE_URL = env.VITE_API_BASE_URL;
  } else if (isCloud && (!raw.API_BASE_URL || raw.API_BASE_URL.includes('localhost'))) {
    raw.API_BASE_URL = 'https://cortex-w-backend.vercel.app/api';
  }
  if (env.VITE_APP_DATA_MODE) {
    raw.APP_DATA_MODE = env.VITE_APP_DATA_MODE;
  } else if (isCloud) {
    raw.APP_DATA_MODE = 'api';
  }

  const parsed = RuntimeConfigSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('Invalid runtime config, falling back to defaults', parsed.error);
    return RuntimeConfigSchema.parse({
      API_BASE_URL: raw.API_BASE_URL || (isCloud ? 'https://cortex-w-backend.vercel.app/api' : '/api'),
      APP_DATA_MODE: raw.APP_DATA_MODE || 'api',
    });
  }
  return parsed.data;
}

export const runtimeConfig: RuntimeConfig = readRuntimeConfig();
