-- Migration 010: read-only mirror of the MySQL metadata the new UI needs (sites and water meters).
--
-- MySQL (cog-core-api) stays the master; nobody edits these tables. The cortex scheduler WaterMetaDataSyncScheduler
-- overwrites them every 15 minutes: new rows are inserted, changed rows updated, rows that vanished from MySQL are
-- kept but flagged is_active = false (so old readings still resolve to a site). row_hash is the md5 of the copied
-- fields; the scheduler compares it to skip unchanged rows.
--
-- tenant_id is the MySQL client id, on every row, so a second client is just more rows.
-- Not copied: mobile, email, aadhar, guardian details and anything else the UI never shows.
-- Free text is TEXT, so a long real value can never make the sync fail.

CREATE TABLE IF NOT EXISTS site_metadata (
  site_id          BIGINT       PRIMARY KEY,
  tenant_id        BIGINT       NOT NULL,
  name             TEXT         NOT NULL,
  parent_site_id   BIGINT,
  level            INTEGER,
  category         TEXT,
  code             TEXT,
  state            TEXT,
  district         TEXT,
  status           TEXT,
  time_zone        TEXT,                              -- as MySQL has it: "+05:30" or "Asia/Kolkata"
  tz_sql           TEXT         NOT NULL DEFAULT 'UTC', -- the same zone spelled so that AT TIME ZONE reads it correctly
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  row_hash         CHAR(32)     NOT NULL,
  synced_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_meta_parent ON site_metadata (parent_site_id);
CREATE INDEX IF NOT EXISTS idx_site_meta_tenant ON site_metadata (tenant_id);

CREATE TABLE IF NOT EXISTS meter_metadata (
  meter_id             VARCHAR(20)  PRIMARY KEY,      -- the same 10-digit id as meter_id in water_meter_readings_v2
  tenant_id            BIGINT       NOT NULL,
  asset_id             BIGINT       NOT NULL,
  asset_name           TEXT,
  site_id              BIGINT,
  household_id         BIGINT,
  household_custom_id  TEXT,
  consumer_name        TEXT,
  address              TEXT,
  zone                 TEXT,
  ward                 TEXT,
  locality             TEXT,
  dma                  TEXT,
  installed_date       TEXT,
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  row_hash             CHAR(32)     NOT NULL,
  synced_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Geofences: how the installed gateways and the zone / DMA areas are stored in MySQL.
--   kind GATEWAY  an installed gateway: gateway_id is its EUI, (center_lat, center_lng) where it stands, radius_m how far
--                 it covers, site_id / tenant_id which site and client it belongs to, address the place name
--   kind AREA     the polygon of a zone / DMA: points is [[lat, lng], ...] in the stored order
--   kind OTHER    any other geofence
CREATE TABLE IF NOT EXISTS geofence_metadata (
  geofence_id   BIGINT       PRIMARY KEY,
  tenant_id     BIGINT       NOT NULL,
  site_id       BIGINT,
  kind          TEXT         NOT NULL,
  gateway_id    TEXT,
  name          TEXT,
  address       TEXT,
  type          TEXT,
  radius_m      DOUBLE PRECISION,
  color         TEXT,
  center_lat    DOUBLE PRECISION,
  center_lng    DOUBLE PRECISION,
  points        JSONB        NOT NULL DEFAULT '[]'::jsonb,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  row_hash      CHAR(32)     NOT NULL,
  synced_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geofence_meta_gateway ON geofence_metadata (gateway_id) WHERE gateway_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_geofence_meta_site    ON geofence_metadata (site_id);
CREATE INDEX IF NOT EXISTS idx_geofence_meta_tenant  ON geofence_metadata (tenant_id, kind);

CREATE INDEX IF NOT EXISTS idx_meter_meta_site   ON meter_metadata (site_id);
CREATE INDEX IF NOT EXISTS idx_meter_meta_tenant ON meter_metadata (tenant_id);
CREATE INDEX IF NOT EXISTS idx_meter_meta_asset  ON meter_metadata (asset_id);

-- one row per sync run per table: when it last worked and how many rows changed (for a "metadata updated at" label)
CREATE TABLE IF NOT EXISTS metadata_sync_log (
  table_name     TEXT         PRIMARY KEY,
  last_run_at    TIMESTAMPTZ  NOT NULL,
  rows_source    INTEGER      NOT NULL,
  rows_inserted  INTEGER      NOT NULL,
  rows_updated   INTEGER      NOT NULL,
  rows_deactivated INTEGER    NOT NULL
);
