import express from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { config } from "./config/env.js";
import { pool } from "./db/pool.js";
import { authMiddleware, requireAuth } from "./middleware/auth.js";

import authRoutes from "./routes/auth.js";
import commandCenterRoutes from "./routes/commandCenter.js";
import householdsRoutes from "./routes/households.js";
import billingRoutes from "./routes/billing.js";
import alarmsRoutes from "./routes/alarms.js";
import sitesRoutes from "./routes/sites.js";
import gisRoutes from "./routes/gis.js";
import dashboardRoutes from "./routes/dashboard.js";
import { startTelemetrySyncScheduler } from "./services/telemetrySyncWorker.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// ============================================================
// Middleware
// ============================================================

// Browser origins allowed to call this API cross-origin come from CORS_ORIGIN
// (comma-separated; "*" = any, development only). Requests with no Origin
// header (same-origin, curl, server-to-server) are always let through, and a
// disallowed origin simply gets no CORS headers, so its browser blocks it.
// Auth is a bearer token, not a cookie, so credentialed CORS isn't needed.
const allowedOrigins = config.CORS_ORIGIN.split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const allowAnyOrigin = allowedOrigins.includes('*');

app.set("trust proxy", config.TRUST_PROXY);
app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowAnyOrigin) return callback(null, true);
      return callback(null, allowedOrigins.includes(origin));
    },
  }),
);

// Gzip/brotli-negotiated compression — the dashboard's upstream DMA-report
// responses embed full per-DMA meter arrays and were being proxied through
// uncompressed; this shrinks them substantially over the wire for free.
app.use(compression());

app.use(express.json({ limit: "100kb" }));

// Coarse per-address ceiling; /auth/login has its own, much stricter limit.
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 1200,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use(authMiddleware);
// Deny by default: everything except the public list requires a valid token.
app.use(requireAuth);

// ============================================================
// Root
// ============================================================
//===Route=====

app.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "cortex-w-backend",
    message: "Cortex-W backend is running",
  });
});

// ============================================================
// Health Check
// ============================================================

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");

    res.status(200).json({
      status: "ok",
      service: "cortex-w-backend",
      database: "connected",
    });
  } catch (err) {
    console.error("[health] Database connection failed:", err);

    res.status(503).json({
      status: "db_unreachable",
      service: "cortex-w-backend",
      database: "disconnected",
    });
  }
});

// ============================================================
// API Routes
// Mounted under /api only
// ============================================================

// Authentication
app.use("/api/auth", authRoutes);

// Command Center
app.use("/api/command-center", commandCenterRoutes);

// Households
app.use("/api/households", householdsRoutes);

// Billing
app.use("/api/billing", billingRoutes);

// Alarms
app.use("/api/alarms", alarmsRoutes);

// Sites
app.use("/api/sites", sitesRoutes);

// GIS
app.use("/api/gis", gisRoutes);

// Dashboard
app.use("/api/dashboard", dashboardRoutes);

// ============================================================
// Run Database Migrations
// ============================================================

async function runMigrations() {
  const distDir = join(__dirname, "db", "migrations");

  const srcDir = join(__dirname, "..", "src", "db", "migrations");

  const migrationsDir = existsSync(distDir) ? distDir : srcDir;

  console.log(`[db] Migration directory: ${migrationsDir}`);

  // Seed/demo-data migrations only run in seed mode — production (api/hybrid)
  // uses a real, metadata-free schema: only actual telemetry tables are created.
  const isSeedMode = config.APP_DATA_MODE === "seed";

  const migrations = [
    ...(isSeedMode
      ? ["001_initial_schema.sql", "002_seed_data.sql", "006_geographical_dma.sql"]
      : []),
    "005_raw_telemetry.sql",
    "007_water_rollup_tables.sql",
    "008_asset_inventory.sql",
    "009_client_scoping.sql",
  ];

  for (const file of migrations) {
    try {
      const migrationPath = join(migrationsDir, file);

      console.log(`[db] Running migration: ${file}`);

      const sql = readFileSync(migrationPath, "utf-8");

      await pool.query(sql);

      console.log(`[db] Ran migration: ${file}`);
    } catch (err: any) {
      // ON CONFLICT DO NOTHING makes reruns safe.
      // Some schema statements can still report already-existing
      // database objects, so handle those safely.

      if (
        err.message?.includes("already exists") ||
        err.message?.includes("duplicate")
      ) {
        console.log(`[db] Skipped (already applied): ${file}`);
      } else {
        console.error(`[db] Migration error in ${file}:`, err.message);

        throw err;
      }
    }
  }
}

// ============================================================
// Express App Export
//
// IMPORTANT:
// Vercel imports this application directly as a serverless
// function. Therefore app.listen() must NOT execute on Vercel.
// ============================================================

export default app;

// ============================================================
// Local / Traditional Server Startup
// ============================================================

async function start() {
  console.log(`[cortex-w bff] APP_DATA_MODE=${config.APP_DATA_MODE}`);

  try {
    await runMigrations();
  } catch (err) {
    console.warn("[db] Startup migration warning:", err);
  }

  app.listen(config.PORT, () => {
    console.log(`[cortex-w bff] Listening on :${config.PORT}`);
    // Start local in-process recurring scheduler (every 15 mins)
    startTelemetrySyncScheduler(15 * 60 * 1000);
  });
}

// ============================================================
// Do NOT start an HTTP listener on Vercel.
//
// Locally:
// npm run dev / npm start -> app.listen()
//
// Vercel:
// Vercel imports `app` above and handles the HTTP server.
// ============================================================

if (!process.env.VERCEL) {
  start().catch((err) => {
    console.error("Fatal startup error:", err);

    process.exit(1);
  });
} else {
  // On Vercel serverless, run migrations once on function cold-start
  runMigrations().catch((err) => {
    console.warn("[db] Vercel serverless cold-start migration notice:", err?.message || err);
  });
}
