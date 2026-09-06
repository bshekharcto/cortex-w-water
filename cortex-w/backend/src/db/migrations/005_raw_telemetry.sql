-- Migration 005: Raw Telemetry Packets and 7-day Aggregations

CREATE TABLE IF NOT EXISTS raw_telemetry_packets (
  id BIGSERIAL PRIMARY KEY,
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
);

CREATE INDEX IF NOT EXISTS idx_raw_packets_date ON raw_telemetry_packets (date_key);
CREATE INDEX IF NOT EXISTS idx_raw_packets_decoded_at ON raw_telemetry_packets (decoded_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_packets_gateway ON raw_telemetry_packets (gateway_id, decoded_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_packets_meter ON raw_telemetry_packets (meter_id, decoded_at DESC);

CREATE TABLE IF NOT EXISTS telemetry_aggregation_cache (
  cache_key VARCHAR(50) PRIMARY KEY,
  from_date VARCHAR(10) NOT NULL,
  to_date VARCHAR(10) NOT NULL,
  summary_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
