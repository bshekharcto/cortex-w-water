-- Serverless-safe coordination state. ADDITIVE ONLY (two new tables).
--
-- client_sync_state: one row per client so that
--   * overlapping cron runs (several serverless instances) can't sync the
--     same client twice at once (lock_until is a lease), and
--   * a time-boxed run can sync clients in rotation, least-recently-attempted
--     first, so one slow client can never starve the others.
CREATE TABLE IF NOT EXISTS client_sync_state (
    client_key        TEXT PRIMARY KEY,
    last_attempt_at   TIMESTAMPTZ,
    last_complete_at  TIMESTAMPTZ,
    last_status       TEXT,
    lock_until        TIMESTAMPTZ
);

-- rate_limit_hits: shared counters for the login lockout. An in-memory counter
-- is per serverless instance, so an attacker would simply be spread across them.
CREATE TABLE IF NOT EXISTS rate_limit_hits (
    key       TEXT PRIMARY KEY,
    hits      INT NOT NULL,
    reset_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_reset ON rate_limit_hits (reset_at);
