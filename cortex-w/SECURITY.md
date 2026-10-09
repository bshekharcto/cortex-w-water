# Cortex-W: authentication, client isolation and operations

## How a request is authenticated

1. The user signs in at `POST /api/auth/login`. The backend forwards the username and
   password to the beta API (cog-core-api) and returns the token it issues. The password is
   never stored or logged.
2. The browser sends that token as `Authorization: Bearer ...` on every call.
3. On each request the backend asks cog-core-api whether the token is valid
   (`GET /api/site/?allSites=false`, result cached for 5 minutes). A 200 also returns the
   sites, and each site's `clientId`, that the token may see. A 401/403 means rejected.
   If cog-core-api is unreachable the answer is 503, never "let it through".
4. Everything after that runs inside that client's context (`services/clientContext.ts`).
   All upstream calls use the user's own token; there is no service account.

Every route except `/`, `/health`, `/api/auth/login`, `/api/auth/logout` and
`/api/command-center/sync-cron` (which needs `CRON_SECRET`) requires a valid token.

## How clients are kept apart

A *client* is a customer organisation (e.g. WATCO = 91). It is identified only from the sites
cog-core-api returns for the caller's own token, never from anything the browser sends.

- Site ids named in a request (`siteId`, `siteIds`, `nodeId`) are checked against the client's
  sites. Another client's id, or a mixed list, gets **404**; `ALL` means "all of my sites".
- Every cache (site tree, dashboard reports, GIS data, telemetry summaries, meter facts,
  inventory) is keyed by client.
- Our Postgres telemetry tables have no owner column, so every read is restricted to the
  client's own meters (`client_meter_owner`, filled by the inventory refresh) and ingestion
  stores only frames of meters the client owns.
- Endpoints whose upstream lookup is *not* scoped (household detail, meter detail by
  `meterId`, alerts by id) are checked against the client's own households / meters / sites
  before anything is fetched. These were real leaks found by `npm run test:isolation`.

**Adding a client needs no configuration here.** Create the client, its sites, meters and user
in cog-core-api; the first login builds their inventory (a few minutes for a large client).

## Data loading

This app does not pull telemetry from cog-core-api any more. The readings (`water_meter_readings_v2`) and the
metadata mirror (`site_metadata`, `meter_metadata`, `geofence_metadata`) are filled by two cortex schedulers
(`WaterMeterHistoryToRdsScheduler`, `WaterMetaDataSyncScheduler`), so there is no scheduled sync endpoint here.
Client isolation for readings goes through `meter_metadata.tenant_id` (see `services/tenantScope.ts`).

## Deploying

Required environment (backend): `NODE_ENV=production`, `APP_DATA_MODE=api`, `DATABASE_URL`,
`UPSTREAM_API_BASE_URL`, `UPSTREAM_DATA_REST_URL`, `JWT_LOCAL_SIGNING_SECRET` (random, 32+ chars),
`CORS_ORIGIN` (explicit origins), `CRON_SECRET`, `SESSION_ENCRYPTION_KEY` (`openssl rand -hex 32`),
`TRUST_PROXY=1`. The backend refuses to start in production without them.

GitHub Actions repo secrets: `CRON_SECRET` (same value as the backend) and optionally
`BACKEND_URL`.

Migrations `009`-`011` only add tables. **Take an RDS snapshot before the first deploy.**

## Operations

- **Rotate `CRON_SECRET`:** change it in Vercel and in the GitHub secret together.
- **Rotate `SESSION_ENCRYPTION_KEY`:** stored sessions stop decrypting and are ignored; clients
  resume syncing at their next login.
- **Rotate the Google Maps key:** restrict it by HTTP referrer in Google Cloud.
- **Tests:** `npm run test:isolation` (two real logins; use a throwaway `TEST_DB_URL`) and
  `npm run test:crypto`.

## Known limits

- The token lives in `sessionStorage` (cross-origin Vercel projects rule out an httpOnly
  cookie). The CSP in `frontend/vercel.json` is **report-only** until checked against the real
  pages; rename it to `Content-Security-Policy` to enforce.
- Authorisation within a client (who may write what) is decided by cog-core-api, which receives
  the user's own token. This service does not add roles of its own.
- Logout cannot revoke a token at cog-core-api; it only forgets it here.
- Telemetry ingestion keeps at most 3,000 frames per client per day (existing cap), so a backfilled
  day is a sample, not the full day. Removing the cap needs saved cursors and a database change.
