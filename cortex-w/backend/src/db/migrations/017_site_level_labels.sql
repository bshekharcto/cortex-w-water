-- Migration 017: site_level_labels - what the Dashboard calls each level of a client's site tree.
--
-- The Dashboard shows "3 Areas Below" and the column "Area". For WATCO the top level is really a ULB, the next a
-- Division, and so on; another client may have only 2 or 3 levels, or call them something else. So the names are kept
-- here, per client and level, and are filled BY HAND (SQL). Nothing syncs or overwrites this table.
--
-- A client or level with no row here shows the plain words "Area" / "Areas", so a new client works from day one.
-- client_id is the MySQL client id (the same number that tenant_id holds in the metadata mirror).
--
-- Add a client:   INSERT INTO site_level_labels (client_id, level, label, label_plural) VALUES (101, 1, 'Town', 'Towns');
-- Rename a level: UPDATE site_level_labels SET label = 'Zone', label_plural = 'Zones' WHERE client_id = 91 AND level = 2;
--
-- This only ADDS a table: it is safe while the current backend is live (the backend falls back to "Area" until it exists).

CREATE TABLE IF NOT EXISTS site_level_labels (
  client_id     BIGINT       NOT NULL,
  level         INTEGER      NOT NULL,
  label         VARCHAR(60)  NOT NULL,
  label_plural  VARCHAR(60)  NOT NULL,
  PRIMARY KEY (client_id, level)
);

-- WATCO (client 91), six levels. Client 101 is left without rows on purpose: it shows "Area" / "Areas".
INSERT INTO site_level_labels (client_id, level, label, label_plural) VALUES
  (91, 1, 'ULB',          'ULBs'),
  (91, 2, 'Division',     'Divisions'),
  (91, 3, 'Sub-Division', 'Sub-Divisions'),
  (91, 4, 'Section',      'Sections'),
  (91, 5, 'DMA',          'DMAs'),
  (91, 6, 'Sub-DMA',      'Sub-DMAs')
ON CONFLICT (client_id, level) DO NOTHING;
