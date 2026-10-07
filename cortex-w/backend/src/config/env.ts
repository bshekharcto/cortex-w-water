import { z } from 'zod';
import { existsSync } from 'fs';

if (existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch {
    // ignore
  }
}

const EnvSchema = z.object({
  PORT: z.coerce.number().default(4000),
  APP_DATA_MODE: z.enum(['seed', 'api', 'hybrid']).default('api'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/cortex_w'),
  // Upstream (cog-core-api) location and the service account used for
  // background/unauthenticated calls. Deliberately NO defaults: a default
  // would silently point a mis-configured (or dev) process at production.
  // They are required unless the app runs purely on seed data — see below.
  UPSTREAM_API_BASE_URL: z.string().url().optional(),
  UPSTREAM_DATA_REST_URL: z.string().url().optional(),
  COGNECTO_API_URL: z.string().url().optional(), // login host; falls back to UPSTREAM_API_BASE_URL
  UPSTREAM_SERVICE_USERNAME: z.string().min(1).optional(),
  UPSTREAM_SERVICE_PASSWORD: z.string().min(1).optional(),
  JWT_LOCAL_SIGNING_SECRET: z.string().default('change-me-in-real-deployment'),
  SEED_FRESHNESS_HOURS: z.coerce.number().default(36),
  // Comma-separated list of browser origins allowed to call this API
  // cross-origin, e.g. "https://app.example.com,http://localhost:5173".
  // "*" allows any origin (development only). Same-origin requests and
  // non-browser callers (no Origin header) are never affected.
  CORS_ORIGIN: z.string().default('*'),
  // Zone whose midnight defines "today" / "yesterday" / "month" for flow figures.
  TELEMETRY_TIMEZONE: z.string().default('Asia/Kolkata'),
  // A meter that reported within this many hours counts as CONNECTED when
  // neither the DMA report nor the asset inventory gives a status.
  METER_CONNECTED_WINDOW_HOURS: z.coerce.number().positive().default(24),
});

const parsed = EnvSchema.parse(process.env);

const REQUIRED_UNLESS_SEED = [
  'UPSTREAM_API_BASE_URL',
  'UPSTREAM_DATA_REST_URL',
  'UPSTREAM_SERVICE_USERNAME',
  'UPSTREAM_SERVICE_PASSWORD',
] as const;

if (parsed.APP_DATA_MODE !== 'seed') {
  const missing = REQUIRED_UNLESS_SEED.filter((key) => !parsed[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        `Set them in backend/.env (or the deployment's environment) — see .env.example.`
    );
  }
}

/** With APP_DATA_MODE other than "seed", the upstream settings above are guaranteed present. */
export type AppConfig = Omit<
  z.infer<typeof EnvSchema>,
  'UPSTREAM_API_BASE_URL' | 'UPSTREAM_DATA_REST_URL' | 'UPSTREAM_SERVICE_USERNAME' | 'UPSTREAM_SERVICE_PASSWORD'
> & {
  UPSTREAM_API_BASE_URL: string;
  UPSTREAM_DATA_REST_URL: string;
  UPSTREAM_SERVICE_USERNAME: string;
  UPSTREAM_SERVICE_PASSWORD: string;
};

export const config = parsed as AppConfig;
