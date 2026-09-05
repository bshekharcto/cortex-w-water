-- Cortex-W seed schema — loaded automatically by docker-entrypoint-initdb.d
-- These tables hold seed/staging data. The real system of record is the
-- upstream water backend reached via UPSTREAM_API_BASE_URL.

CREATE TABLE IF NOT EXISTS sites (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS gateways (
    gateway_id          TEXT PRIMARY KEY,
    alias               TEXT,
    site_id             INT REFERENCES sites(id),
    meters_observed     INT NOT NULL DEFAULT 0,
    linked_meters       INT NOT NULL DEFAULT 0,
    avg_rssi            REAL,
    avg_snr             REAL,
    battery_abnormal    INT NOT NULL DEFAULT 0,
    valve_abnormal      INT NOT NULL DEFAULT 0,
    latest_decoded_at   TIMESTAMPTZ,
    latitude            DOUBLE PRECISION,
    longitude           DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS meters (
    meter_id            TEXT PRIMARY KEY,
    household_id        TEXT,
    gateway_id          TEXT REFERENCES gateways(gateway_id),
    forward_flow_l      REAL,
    battery_voltage     REAL,
    battery_health      TEXT,
    valve_health        TEXT,
    rssi                REAL,
    snr                 REAL,
    valve_status        TEXT,
    decoded_at          TIMESTAMPTZ,
    meter_timestamp     TEXT,       -- kept as TEXT because some values are intentionally implausible
    checksum_status     TEXT DEFAULT 'OK',
    confirmed           BOOLEAN DEFAULT true,
    adr                 BOOLEAN DEFAULT false,
    site_id             INT REFERENCES sites(id),
    latitude            DOUBLE PRECISION,
    longitude           DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS households (
    id              SERIAL PRIMARY KEY,
    custom_id       TEXT UNIQUE,
    name            TEXT NOT NULL,
    location        TEXT,
    pin_code        TEXT,
    status          TEXT DEFAULT 'Active',
    registration_date DATE,
    country_code    TEXT DEFAULT 'IN',
    mobile          TEXT,
    site_id         INT REFERENCES sites(id),
    email           TEXT,
    zone            TEXT,
    locality        TEXT,
    ward            TEXT,
    dma             TEXT
);

CREATE TABLE IF NOT EXISTS bills (
    id              SERIAL PRIMARY KEY,
    household_id    TEXT,
    asset_id        TEXT,
    site_id         INT REFERENCES sites(id),
    bill_date       DATE NOT NULL,
    due_date        DATE NOT NULL,
    prev_reading    REAL NOT NULL DEFAULT 0,
    current_reading REAL NOT NULL DEFAULT 0,
    consumption     REAL NOT NULL DEFAULT 0,
    amount          NUMERIC(12,2) NOT NULL DEFAULT 0, -- server-computed
    status          TEXT DEFAULT 'Pending'
);

CREATE TABLE IF NOT EXISTS alarms (
    id              TEXT PRIMARY KEY,
    category        TEXT NOT NULL,
    rule            TEXT NOT NULL,
    severity        TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'Open',
    entity_type     TEXT NOT NULL,
    entity_id       TEXT NOT NULL,
    site            TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    description     TEXT,
    affected_count  INT
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_meters_gateway ON meters(gateway_id);
CREATE INDEX IF NOT EXISTS idx_meters_household ON meters(household_id);
CREATE INDEX IF NOT EXISTS idx_meters_decoded ON meters(decoded_at DESC);
CREATE INDEX IF NOT EXISTS idx_bills_household ON bills(household_id);
CREATE INDEX IF NOT EXISTS idx_alarms_severity ON alarms(severity);
