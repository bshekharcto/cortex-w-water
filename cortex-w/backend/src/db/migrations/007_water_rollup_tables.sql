-- Migration 007: Daily and monthly consumption rollup tables
-- These make DMA/zone/district-level reports fast by pre-summing readings,
-- instead of scanning raw_telemetry_packets every time.
--
-- Deliberately keyed by meter_id ONLY — no site_id/dma_id/zone_id column.
-- A household's assignment to a DMA/zone can change over time, so hierarchy
-- must always be resolved live (via cog-core-api) at report time, never
-- baked into a stored row. See ECOSYSTEM_ARCHITECTURE.md section 5.2.

CREATE TABLE IF NOT EXISTS water_daily_summary (
    summary_date          DATE NOT NULL,
    meter_id              VARCHAR(50) NOT NULL,
    total_consumption_kl  NUMERIC(14,3) DEFAULT 0,  -- delta for that day
    end_reading_kl        NUMERIC(14,3),             -- cumulative index at day's last reading
    reading_count         INT DEFAULT 0,
    updated_at            TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (summary_date, meter_id)
);

CREATE INDEX IF NOT EXISTS idx_water_daily_summary_meter ON water_daily_summary (meter_id, summary_date);

CREATE TABLE IF NOT EXISTS water_monthly_summary (
    summary_month         DATE NOT NULL,  -- always the 1st of the month
    meter_id              VARCHAR(50) NOT NULL,
    total_consumption_kl  NUMERIC(14,3) DEFAULT 0,
    end_reading_kl        NUMERIC(14,3),
    updated_at            TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (summary_month, meter_id)
);

CREATE INDEX IF NOT EXISTS idx_water_monthly_summary_meter ON water_monthly_summary (meter_id, summary_month);
