-- Migration 015: water_meter_daily - one row per meter per day, so the Dashboard never has to add up raw readings.
--
-- The cortex scheduler WaterMeterHistoryToRdsScheduler keeps it current in the same run that stores the readings: for the
-- meters that just received readings it recalculates their days. The Dashboard sums this small table for today /
-- yesterday / this month, and for the consumption trend.
--
--   day         = the calendar day on the clock of the meter's site (site_metadata.tz_sql; UTC when the site is unknown),
--                 cut from the reading's own time (a stored day sits on its own day)
--   reading_kl  = the last reading of that day (KL)
--   last_time   = when that last reading was taken
--   used_kl     = water used that day = reading_kl minus the reading of the previous day that has one. Zero when the
--                 previous day is more than 7 days back (a meter that was silent for long has no honest daily figure),
--                 and never negative (a counter that went back is not consumption). The same rules the Dashboard used
--                 when it added up the readings itself.
--
-- This only ADDS a table: it is safe while the current backend is live. Fill it once from the existing readings (the
-- one-off query given with this migration), then the scheduler keeps it current.

CREATE TABLE IF NOT EXISTS water_meter_daily (
  meter_id    VARCHAR(20)      NOT NULL,
  day         DATE             NOT NULL,
  reading_kl  DOUBLE PRECISION NOT NULL,
  last_time   TIMESTAMPTZ      NOT NULL,
  used_kl     DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  PRIMARY KEY (meter_id, day)
);

-- the Dashboard reads the newest days of every meter
CREATE INDEX IF NOT EXISTS idx_water_meter_daily_day ON water_meter_daily (day);
