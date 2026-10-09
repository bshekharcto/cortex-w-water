-- Migration 012: water_meter_readings_v2 - the Postgres copy of iot.water_meter_readings_v2 (Timestream).
--
-- The cortex scheduler WaterMeterHistoryToRdsScheduler fills it; the UI reads it. Column names are the SAME as in
-- Timestream so the two are easy to compare. Not copied: tenant_id, tenant_name, application_id, device_name,
-- raw_payload, byte24_raw, measure_name.
--
-- Everything is UTC:
--   time        = the meter's own reading time (the hour the reading belongs to); a stored day sits on its own day
--   decoded_at  = when ChirpStack received the frame
--   date_key    = the UTC date of `time` (computed)
-- Readings are in KL (forward_flow_kl) and m3 (reverse_flow_m3), exactly as in Timestream.
--
-- This only ADDS a new table: it is safe while the old backend and the old raw_telemetry_packets table are live.
-- The old table and the battery / valve columns are removed later by 013.

CREATE TABLE IF NOT EXISTS water_meter_readings_v2 (
  meter_id            VARCHAR(20)  NOT NULL,
  dev_eui             VARCHAR(20)  NOT NULL,
  dev_addr            VARCHAR(16),
  time                TIMESTAMPTZ  NOT NULL,
  decoded_at          TIMESTAMPTZ,
  gateway_id          VARCHAR(20),
  gateway_list        TEXT,
  gateway_count       INTEGER,
  forward_flow_kl     DOUBLE PRECISION,
  reverse_flow_m3     DOUBLE PRECISION,
  water_temp_c        DOUBLE PRECISION,
  no_water            BOOLEAN,
  status_word         INTEGER,
  rssi                DOUBLE PRECISION,
  snr                 DOUBLE PRECISION,
  f_cnt               INTEGER,
  f_port              INTEGER,
  frequency           BIGINT,
  dr                  INTEGER,
  adr                 BOOLEAN,
  confirmed           BOOLEAN,
  checksum_status     VARCHAR(8),
  meter_timestamp     VARCHAR(40),
  clock_offset_hours  INTEGER,
  is_history          BOOLEAN      NOT NULL DEFAULT FALSE,
  decoder_version     VARCHAR(20),
  date_key            DATE GENERATED ALWAYS AS ((time AT TIME ZONE 'UTC')::date) STORED,
  created_at          TIMESTAMPTZ  DEFAULT NOW(),
  PRIMARY KEY (meter_id, dev_eui, time)
) PARTITION BY RANGE (time);

-- One partition per month, Oct 2025 through Dec 2027. The bounds are written with an explicit +00 so they never
-- depend on the session time zone.
DO $$
DECLARE
  month_start DATE := DATE '2025-10-01';
  month_end DATE;
BEGIN
  FOR i IN 0..26 LOOP
    month_end := (month_start + INTERVAL '1 month')::date;
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF water_meter_readings_v2 FOR VALUES FROM (%L) TO (%L)',
      'water_meter_readings_v2_' || TO_CHAR(month_start, 'YYYY_MM'),
      TO_CHAR(month_start, 'YYYY-MM-DD') || ' 00:00:00+00',
      TO_CHAR(month_end, 'YYYY-MM-DD') || ' 00:00:00+00'
    );
    month_start := month_end;
  END LOOP;
END $$;

-- Safety net: a row outside the range above lands here instead of failing the insert. Should stay empty.
CREATE TABLE IF NOT EXISTS water_meter_readings_v2_default PARTITION OF water_meter_readings_v2 DEFAULT;

CREATE INDEX IF NOT EXISTS idx_wmrv2_meter_time    ON water_meter_readings_v2 (meter_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_wmrv2_date_key      ON water_meter_readings_v2 (date_key);
CREATE INDEX IF NOT EXISTS idx_wmrv2_gateway_time  ON water_meter_readings_v2 (gateway_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_wmrv2_decoded_at    ON water_meter_readings_v2 (decoded_at DESC);

-- The newest LIVE frame of every meter (is_history = false), one row per meter. The same scheduler keeps it up to date
-- while it inserts readings, so "when was this meter last heard" and its current reading never need a scan of the big
-- table. Rows are only replaced by a frame received later.
CREATE TABLE IF NOT EXISTS water_meter_latest (
  meter_id          VARCHAR(20)  PRIMARY KEY,
  dev_eui           VARCHAR(20),
  time              TIMESTAMPTZ  NOT NULL,
  decoded_at        TIMESTAMPTZ  NOT NULL,
  gateway_id        VARCHAR(20),
  forward_flow_kl   DOUBLE PRECISION,
  rssi              DOUBLE PRECISION,
  snr               DOUBLE PRECISION
);

-- fills the table from readings that are already there (a no-op on an empty database)
INSERT INTO water_meter_latest (meter_id, dev_eui, time, decoded_at, gateway_id, forward_flow_kl, rssi, snr)
SELECT DISTINCT ON (meter_id) meter_id, dev_eui, time, decoded_at, gateway_id, forward_flow_kl, rssi, snr
FROM water_meter_readings_v2
WHERE is_history = false AND decoded_at IS NOT NULL
ORDER BY meter_id, decoded_at DESC
ON CONFLICT (meter_id) DO NOTHING;
