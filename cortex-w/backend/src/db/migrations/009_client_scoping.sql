-- Per-client (tenant) storage for the meter inventory and meter ownership.
--
-- ADDITIVE ONLY: creates new tables; nothing existing is altered, renamed or
-- dropped, so older builds sharing this database keep working. The singleton
-- tables from 008 (asset_inventory, asset_inventory_refresh,
-- asset_inventory_snapshot) are no longer read; they can be dropped later once
-- this has been running.
--
-- client_key is the sorted client id(s) the signed-in user belongs to, e.g.
-- '91' (WATCO) or '101' (Ayodhya Nagar Nigam), taken from the sites the
-- upstream returns for that user's own token — never from the browser.

-- Mapped Water Meters (those with a household), per client. Same shape as 008.
CREATE TABLE IF NOT EXISTS client_asset_inventory (
    client_key     TEXT NOT NULL,
    meter_id       VARCHAR(50) NOT NULL,
    asset_id       BIGINT NOT NULL,
    site_id        INT NOT NULL,
    status         VARCHAR(30),
    consumer_id    TEXT,
    consumer_name  TEXT,
    address        TEXT,
    run_id         BIGINT NOT NULL,
    refreshed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (client_key, meter_id)
);
CREATE INDEX IF NOT EXISTS idx_client_asset_inventory_site ON client_asset_inventory (client_key, site_id);

-- EVERY Water Meter a client owns (mapped or not). Telemetry tables carry no
-- owner column, so reads are restricted to rows whose meter_id is in here.
CREATE TABLE IF NOT EXISTS client_meter_owner (
    client_key  TEXT NOT NULL,
    meter_id    VARCHAR(50) NOT NULL,
    asset_id    BIGINT NOT NULL,
    site_id     INT NOT NULL,
    run_id      BIGINT NOT NULL,
    PRIMARY KEY (client_key, meter_id)
);
CREATE INDEX IF NOT EXISTS idx_client_meter_owner_asset ON client_meter_owner (client_key, asset_id);

CREATE TABLE IF NOT EXISTS client_inventory_refresh (
    client_key    TEXT PRIMARY KEY,
    run_id        BIGINT NOT NULL DEFAULT 0,
    next_page     INT NOT NULL DEFAULT 0,
    total_pages   INT,
    in_progress   BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at  TIMESTAMPTZ,
    locked_until  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS client_inventory_snapshot (
    client_key    TEXT PRIMARY KEY,
    completed_at  TIMESTAMPTZ NOT NULL,
    row_count     INT NOT NULL,
    data_gz_b64   TEXT NOT NULL
);
