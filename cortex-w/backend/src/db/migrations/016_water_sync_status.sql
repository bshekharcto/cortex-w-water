-- Migration 016: water_sync_status - when the cortex scheduler last looked for new readings.
--
-- WaterMeterHistoryToRdsScheduler notes its time here at the end of every run, even a run that found nothing new. The
-- screens show it as "Last updated": the last time the database was checked, not the last time a reading arrived (which
-- stands still at night when few meters send).
--
-- This only ADDS a table: it is safe while the current backend and scheduler are live. Until the scheduler has written its
-- first mark, the screens fall back to the newest update of water_meter_daily.

CREATE TABLE IF NOT EXISTS water_sync_status (
  job           VARCHAR(40)  PRIMARY KEY,
  last_run_at   TIMESTAMPTZ  NOT NULL,
  records_read  INTEGER      NOT NULL DEFAULT 0
);
