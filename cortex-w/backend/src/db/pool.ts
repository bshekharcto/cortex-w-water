import pg from 'pg';
import { config } from '../config/env.js';

const isCloudDb =
  config.DATABASE_URL.includes('neon.tech') ||
  config.DATABASE_URL.includes('sslmode=require') ||
  config.DATABASE_URL.includes('amazonaws.com') ||
  Boolean(process.env.VERCEL);

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  ssl: isCloudDb ? { rejectUnauthorized: false } : undefined,
});

