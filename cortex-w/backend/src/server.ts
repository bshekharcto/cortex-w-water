import express from 'express';
import cors from 'cors';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/env.js';
import { pool } from './db/pool.js';
import { authMiddleware } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import commandCenterRoutes from './routes/commandCenter.js';
import householdsRoutes from './routes/households.js';
import billingRoutes from './routes/billing.js';
import alarmsRoutes from './routes/alarms.js';
import sitesRoutes from './routes/sites.js';
import gisRoutes from './routes/gis.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(authMiddleware);

// ---------- Health check ----------
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', dataMode: config.APP_DATA_MODE });
  } catch (err) {
    res.status(503).json({ status: 'db_unreachable' });
  }
});

// ---------- Routes (support both /api/* and /* for bulletproof client routing) ----------
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

app.use('/api/command-center', commandCenterRoutes);
app.use('/command-center', commandCenterRoutes);

app.use('/api/households', householdsRoutes);
app.use('/households', householdsRoutes);

app.use('/api/billing', billingRoutes);
app.use('/billing', billingRoutes);

app.use('/api/alarms', alarmsRoutes);
app.use('/alarms', alarmsRoutes);

app.use('/api/sites', sitesRoutes);
app.use('/sites', sitesRoutes);

app.use('/api/gis', gisRoutes);
app.use('/gis', gisRoutes);

// ---------- Run migrations at startup ----------
async function runMigrations() {
  const distDir = join(__dirname, 'db', 'migrations');
  const srcDir = join(__dirname, '..', 'src', 'db', 'migrations');
  const migrationsDir = existsSync(distDir) ? distDir : srcDir;
  for (const file of ['001_initial_schema.sql', '002_seed_data.sql']) {
    try {
      const sql = readFileSync(join(migrationsDir, file), 'utf-8');
      await pool.query(sql);
      console.log(`[db] Ran migration: ${file}`);
    } catch (err: any) {
      // ON CONFLICT DO NOTHING makes reruns safe
      if (err.message?.includes('already exists') || err.message?.includes('duplicate')) {
        console.log(`[db] Skipped (already applied): ${file}`);
      } else {
        console.error(`[db] Migration error in ${file}:`, err.message);
        throw err;
      }
    }
  }
}

// ---------- Start ----------
export default app;

async function start() {
  console.log(`[cortex-w bff] APP_DATA_MODE=${config.APP_DATA_MODE}`);
  try {
    await runMigrations();
  } catch (e) {
    console.warn('[db] Startup migration warning:', e);
  }
  app.listen(config.PORT, () => {
    console.log(`[cortex-w bff] Listening on :${config.PORT}`);
  });
}

if (!process.env.VERCEL) {
  start().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}
