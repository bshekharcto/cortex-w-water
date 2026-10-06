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
  UPSTREAM_API_BASE_URL: z.string().url().default('https://api.cognecto.com'),
  UPSTREAM_DATA_REST_URL: z.string().url().default('https://api.cognecto.com'),
  COGNECTO_API_URL: z.string().url().default('https://api.cognecto.com'),
  JWT_LOCAL_SIGNING_SECRET: z.string().default('change-me-in-real-deployment'),
  SEED_FRESHNESS_HOURS: z.coerce.number().default(36),
  CORS_ORIGIN: z.string().default('*'),
  // Zone whose midnight defines "today" / "yesterday" / "month" for flow figures.
  TELEMETRY_TIMEZONE: z.string().default('Asia/Kolkata'),
  // A meter that reported within this many hours counts as CONNECTED when
  // neither the DMA report nor the asset inventory gives a status.
  METER_CONNECTED_WINDOW_HOURS: z.coerce.number().positive().default(24),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export const config: AppConfig = EnvSchema.parse(process.env);
