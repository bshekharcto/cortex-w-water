-- Migration 006: Geographical DMA & Sub-DMA hierarchy in Odisha (Bhubaneswar, Cuttack, Puri)

ALTER TABLE meters ADD COLUMN IF NOT EXISTS zone TEXT;
ALTER TABLE meters ADD COLUMN IF NOT EXISTS dma TEXT;
ALTER TABLE meters ADD COLUMN IF NOT EXISTS sub_dma TEXT;
ALTER TABLE meters ADD COLUMN IF NOT EXISTS is_within_1km BOOLEAN DEFAULT true;
ALTER TABLE meters ADD COLUMN IF NOT EXISTS distance_m REAL;
ALTER TABLE meters ADD COLUMN IF NOT EXISTS consumer_name TEXT;
ALTER TABLE meters ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE households ADD COLUMN IF NOT EXISTS sub_dma TEXT;

CREATE INDEX IF NOT EXISTS idx_meters_zone_dma ON meters(zone, dma);
CREATE INDEX IF NOT EXISTS idx_meters_sub_dma ON meters(sub_dma);
