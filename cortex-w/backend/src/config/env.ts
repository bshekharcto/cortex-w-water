import { z } from 'zod';
import { existsSync } from 'fs';

if (existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch {
    // ignore
  }
}

const DEFAULT_JWT_SECRET = 'change-me-in-real-deployment';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
  // Signs demo tokens in seed mode only. Never used to accept tokens in api mode.
  JWT_LOCAL_SIGNING_SECRET: z.string().default(DEFAULT_JWT_SECRET),
  // How the upstream (cog-core-api) JWT is verified. Set ONE of the two:
  // a PEM public key (RS256/ES256) or a shared secret (HS256). If neither is
  // set the signature cannot be checked and only expiry is enforced (warned).
  UPSTREAM_JWT_PUBLIC_KEY: z.string().optional(),
  UPSTREAM_JWT_SECRET: z.string().optional(),
  UPSTREAM_JWT_ISSUER: z.string().optional(),
  // Shared secret the scheduler must present to /command-center/sync-cron.
  CRON_SECRET: z.string().min(16).optional(),
  // Number of reverse proxies in front of the API (nginx = 1), so req.ip and
  // rate limiting see the real client. 0 = none.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
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

// There is no service account any more: every upstream call is made with the
// signed-in client's own token. UPSTREAM_SERVICE_* are accepted but unused.
const REQUIRED_UNLESS_SEED = ['UPSTREAM_API_BASE_URL', 'UPSTREAM_DATA_REST_URL'] as const;

if (parsed.APP_DATA_MODE !== 'seed') {
  const missing = REQUIRED_UNLESS_SEED.filter((key) => !parsed[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        `Set them in backend/.env (or the deployment's environment) — see .env.example.`
    );
  }
}

if (parsed.NODE_ENV === 'production') {
  const problems: string[] = [];
  if (parsed.APP_DATA_MODE === 'seed') problems.push('APP_DATA_MODE=seed (demo users) is not allowed');
  if (parsed.JWT_LOCAL_SIGNING_SECRET === DEFAULT_JWT_SECRET || parsed.JWT_LOCAL_SIGNING_SECRET.length < 32) {
    problems.push('JWT_LOCAL_SIGNING_SECRET must be set to a random value of at least 32 characters');
  }
  if (parsed.CORS_ORIGIN.split(',').some((o) => o.trim() === '*')) {
    problems.push('CORS_ORIGIN must list explicit origins, not "*"');
  }
  if (!parsed.CRON_SECRET) problems.push('CRON_SECRET is required');
  if (problems.length > 0) {
    throw new Error(`Insecure production configuration:\n - ${problems.join('\n - ')}`);
  }
}

/** With APP_DATA_MODE other than "seed", the upstream settings above are guaranteed present. */
export type AppConfig = Omit<z.infer<typeof EnvSchema>, 'UPSTREAM_API_BASE_URL' | 'UPSTREAM_DATA_REST_URL'> & {
  UPSTREAM_API_BASE_URL: string;
  UPSTREAM_DATA_REST_URL: string;
};

export const config = parsed as AppConfig;
