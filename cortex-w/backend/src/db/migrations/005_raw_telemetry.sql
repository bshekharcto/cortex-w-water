-- Migration 005: Raw Telemetry Packets (partitioned by month) + aggregation cache
--
-- Partitioned by decoded_at (RANGE, monthly) so that date-range queries only
-- scan the relevant month(s) instead of the whole table as data grows into
-- millions of rows. Postgres requires any UNIQUE/PRIMARY KEY on a partitioned
-- table to include the partition key column — the existing uq_packet
-- constraint already includes decoded_at, so it remains valid as-is.
--
-- Maintenance note: partitions below cover a fixed date range at creation
-- time. Whoever builds the ongoing ingestion job (planned to live in
-- cog-cortex) must also ensure future months' partitions get created ahead
-- of time (e.g. a small "ensure next partition exists" step each run) —
-- see ECOSYSTEM_ARCHITECTURE.md. A raw_telemetry_packets_default catch-all
-- partition exists below as a safety net for any date falling outside the
-- pre-created range, so inserts never fail — but rows landing there won't
-- benefit from partition pruning until a proper monthly partition is added
-- and the data is moved.

CREATE TABLE IF NOT EXISTS raw_telemetry_packets (
  id BIGSERIAL,
  meter_id VARCHAR(50) NOT NULL,
  gateway_id VARCHAR(50) NOT NULL,
  dev_eui VARCHAR(50),
  decoded_at TIMESTAMPTZ NOT NULL,
  date_key VARCHAR(10) NOT NULL,
  forward_flow_l DOUBLE PRECISION DEFAULT 0,
  reverse_flow DOUBLE PRECISION DEFAULT 0,
  battery_voltage DOUBLE PRECISION DEFAULT 0,
  battery_status VARCHAR(20) DEFAULT 'OK',
  battery_health VARCHAR(20) DEFAULT 'Normal',
  valve_health VARCHAR(20) DEFAULT 'Normal',
  valve_closed BOOLEAN DEFAULT FALSE,
  checksum_status VARCHAR(20) DEFAULT 'OK',
  status_byte INTEGER DEFAULT 0,
  rssi DOUBLE PRECISION DEFAULT -90,
  snr DOUBLE PRECISION DEFAULT -10,
  fcnt INTEGER DEFAULT 1,
  fport INTEGER DEFAULT 12,
  frequency BIGINT DEFAULT 865985000,
  dr INTEGER DEFAULT 0,
  adr BOOLEAN DEFAULT FALSE,
  confirmed BOOLEAN DEFAULT TRUE,
  meter_timestamp VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_packet UNIQUE (meter_id, gateway_id, decoded_at, fcnt)
) PARTITION BY RANGE (decoded_at);

-- Indexes defined on the partitioned parent are automatically created on
-- every partition (existing and future).
CREATE INDEX IF NOT EXISTS idx_raw_packets_date ON raw_telemetry_packets (date_key);
CREATE INDEX IF NOT EXISTS idx_raw_packets_decoded_at ON raw_telemetry_packets (decoded_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_packets_gateway ON raw_telemetry_packets (gateway_id, decoded_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_packets_meter ON raw_telemetry_packets (meter_id, decoded_at DESC);

-- Auto-create one partition per month, Jan 2026 through Dec 2027 (24 months —
-- comfortably covers backfill history plus ~1 year of runway before anyone
-- needs to add more).
DO $$
DECLARE
  month_start DATE := DATE '2026-01-01';
  month_end DATE;
  partition_name TEXT;
BEGIN
  FOR i IN 0..23 LOOP
    month_end := month_start + INTERVAL '1 month';
    partition_name := 'raw_telemetry_packets_' || TO_CHAR(month_start, 'YYYY_MM');

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF raw_telemetry_packets
       FOR VALUES FROM (%L) TO (%L)',
      partition_name, month_start, month_end
    );

    month_start := month_end;
  END LOOP;
END $$;

-- Safety-net partition: catches any row outside the pre-created monthly
-- range above instead of failing the insert. Should stay empty in normal
-- operation — its presence just prevents ingestion from breaking if a
-- partition is ever missing.
CREATE TABLE IF NOT EXISTS raw_telemetry_packets_default
  PARTITION OF raw_telemetry_packets DEFAULT;

CREATE TABLE IF NOT EXISTS telemetry_aggregation_cache (
  cache_key VARCHAR(100) PRIMARY KEY,
  from_date VARCHAR(10) NOT NULL,
  to_date VARCHAR(10) NOT NULL,
  summary_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
