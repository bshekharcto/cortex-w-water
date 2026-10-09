-- The newest session token per client, encrypted at rest (AES-256-GCM, key in
-- SESSION_ENCRYPTION_KEY), so scheduled sync can run for a client whose users
-- are not currently making requests — e.g. a serverless cron where no
-- in-memory session exists. No password is ever stored; the token is the
-- upstream's own, expires on its own (expires_at), and is deleted on logout
-- or as soon as upstream stops accepting it.
--
-- ADDITIVE ONLY: one new table.
CREATE TABLE IF NOT EXISTS client_sessions (
    client_key   TEXT PRIMARY KEY,
    token_hash   TEXT NOT NULL,          -- sha256 of the token, to match it on logout without decrypting
    token_enc    TEXT NOT NULL,          -- iv.tag.ciphertext (base64url), client_key bound as AAD
    expires_at   TIMESTAMPTZ NOT NULL,
    last_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
