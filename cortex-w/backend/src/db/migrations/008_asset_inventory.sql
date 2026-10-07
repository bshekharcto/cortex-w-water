-- Migration 008: persisted copy of cog-core-api's meter inventory.
--
-- Loading the inventory from upstream (POST /api/asset/query: ~28k assets, 14
-- pages, 40-50s) on every cold start made the Dashboard unusable after each
-- restart, and does not fit a serverless function's time limit at all. It is
-- refreshed in the background (resumable, in chunks) into this table, and the
-- Dashboard reads it from here in milliseconds.
--
-- Only meters with a mapped household are stored (see assetInventory.ts).
-- Like the rollup tables, it deliberately holds no zone/DMA assignment:
-- hierarchy is resolved live from cog-core-api's site tree.

CREATE TABLE IF NOT EXISTS asset_inventory (
    meter_id       VARCHAR(50) PRIMARY KEY,
    asset_id       BIGINT NOT NULL,
    site_id        INT NOT NULL,
    status         VARCHAR(30),
    consumer_id    TEXT,
    consumer_name  TEXT,
    address        TEXT,
    run_id         BIGINT NOT NULL,         -- the refresh run that last saw this meter
    refreshed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_inventory_site ON asset_inventory (site_id);

-- Single-row state for the resumable refresh. A run walks the upstream pages
-- in order; `next_page` is where the next invocation resumes, and
-- `completed_at` is when the table last held a COMPLETE snapshot.
CREATE TABLE IF NOT EXISTS asset_inventory_refresh (
    id            INT PRIMARY KEY CHECK (id = 1),
    run_id        BIGINT NOT NULL DEFAULT 0,
    next_page     INT NOT NULL DEFAULT 0,
    total_pages   INT,
    in_progress   BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at  TIMESTAMPTZ,
    locked_until  TIMESTAMPTZ
);

INSERT INTO asset_inventory_refresh (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- The finished snapshot as ONE gzipped, base64-encoded JSON document (about a
-- tenth of the size of the rows). Readers fetch this single row instead of
-- streaming ~19k rows, which matters when the database is far from the
-- server (a laptop talking to RDS). Rebuilt when a refresh run completes.
CREATE TABLE IF NOT EXISTS asset_inventory_snapshot (
    id            INT PRIMARY KEY CHECK (id = 1),
    completed_at  TIMESTAMPTZ NOT NULL,
    row_count     INT NOT NULL,
    data_gz_b64   TEXT NOT NULL
);
