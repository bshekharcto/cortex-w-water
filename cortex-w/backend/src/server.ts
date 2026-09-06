import express from "express";
import cors from "cors";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { config } from "./config/env.js";
import { pool } from "./db/pool.js";
import { authMiddleware } from "./middleware/auth.js";

import authRoutes from "./routes/auth.js";
import commandCenterRoutes from "./routes/commandCenter.js";
import householdsRoutes from "./routes/households.js";
import billingRoutes from "./routes/billing.js";
import alarmsRoutes from "./routes/alarms.js";
import sitesRoutes from "./routes/sites.js";
import gisRoutes from "./routes/gis.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// ============================================================
// Middleware
// ============================================================

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json());

app.use(authMiddleware);

// ============================================================
// Root
// ============================================================

app.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "cortex-w-backend",
    message: "Cortex-W backend is running",
    dataMode: config.APP_DATA_MODE,
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
      dataMode: config.APP_DATA_MODE,
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
// Support both /api/* and /*
// ============================================================

// Authentication
app.use("/api/auth", authRoutes);
app.use("/auth", authRoutes);

// Command Center
app.use("/api/command-center", commandCenterRoutes);
app.use("/command-center", commandCenterRoutes);

// Households
app.use("/api/households", householdsRoutes);
app.use("/households", householdsRoutes);

// Billing
app.use("/api/billing", billingRoutes);
app.use("/billing", billingRoutes);

// Alarms
app.use("/api/alarms", alarmsRoutes);
app.use("/alarms", alarmsRoutes);

// Sites
app.use("/api/sites", sitesRoutes);
app.use("/sites", sitesRoutes);

// GIS
app.use("/api/gis", gisRoutes);
app.use("/gis", gisRoutes);

// ============================================================
// Run Database Migrations
// ============================================================

async function runMigrations() {
  const distDir = join(__dirname, "db", "migrations");

  const srcDir = join(__dirname, "..", "src", "db", "migrations");

  const migrationsDir = existsSync(distDir) ? distDir : srcDir;

  console.log(`[db] Migration directory: ${migrationsDir}`);

  const migrations = [
    "001_initial_schema.sql",
    "002_seed_data.sql",
    "005_raw_telemetry.sql",
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
}
