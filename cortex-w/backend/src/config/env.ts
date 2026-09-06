import { z } from 'zod';

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
});

export type AppConfig = z.infer<typeof EnvSchema>;

export const config: AppConfig = EnvSchema.parse(process.env);
