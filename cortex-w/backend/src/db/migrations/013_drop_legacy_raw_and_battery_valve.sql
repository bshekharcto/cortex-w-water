-- Migration 013: clean-up after the switch to water_meter_readings_v2.
--   * drops the old raw_telemetry_packets table (its readings now live in water_meter_readings_v2)
--   * removes the fabricated battery / valve columns from the demo tables meters and gateways
--
-- APPLY BY HAND, only AFTER the new backend and frontend are deployed and verified. Running it earlier breaks the old
-- backend. It is deliberately not in the startup migration list in server.ts. The meters / gateways tables only exist
-- in databases that ever ran the demo-mode migrations (001, 002), so those two statements skip them if missing.

BEGIN;

DROP TABLE IF EXISTS raw_telemetry_packets;

ALTER TABLE IF EXISTS meters
  DROP COLUMN IF EXISTS battery_health,
  DROP COLUMN IF EXISTS battery_voltage,
  DROP COLUMN IF EXISTS valve_health,
  DROP COLUMN IF EXISTS valve_status;

ALTER TABLE IF EXISTS gateways
  DROP COLUMN IF EXISTS battery_abnormal,
  DROP COLUMN IF EXISTS valve_abnormal;

COMMIT;
