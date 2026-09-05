# Cortex-W — Architecture Guide

> Water Intelligence SPA · Foundation Build · 04 Sep 2026

## 1. Overview

Cortex-W is a water-infrastructure intelligence application for Bhubaneswar Municipal Corporation's smart-meter deployment. It provides real-time visibility into 2,532+ LoRaWAN water meters across 14 gateways.

**Three services, one `docker compose up`:**

```
┌─────────────┐      ┌────────────────┐      ┌──────────────┐
│  Frontend   │      │  Backend BFF   │      │   Postgres   │
│  (Vite SPA  │ ───▶ │  (Express/TS)  │ ───▶ │  (16-alpine) │
│   + nginx)  │      │  Port 4000     │      │  Port 5432   │
│  Port 8088  │      │                │      │              │
└─────────────┘      │  ┌──── seed ──▶│ ───▶ │  Seed data   │
                     │  └──── api  ──▶│ ───▶ │  Upstream    │
                     └────────────────┘      └──────────────┘
```

## 2. Data Modes

| Mode | Behavior |
|------|----------|
| `seed` | All data served from Postgres seed tables. No upstream connection needed. |
| `api` | BFF proxies all requests to the upstream water backend, absorbing API quirks (§28). |
| `hybrid` | Per-module override. E.g. hydraulic is always seed (no backend contract exists). |

Set via `APP_DATA_MODE` in env vars or `docker-compose.yml`.

## 3. Design Decision: Command Center Dark Mode

**User explicitly requested** a dark Command Center, light mode for all other screens.
This contradicts spec sections 2.1, guardrails #6/#7 which mandate all screens light.

**Implementation:** scoped CSS class `.cw-scope-dark` wrapping only Command Center routes via `<CommandCenterDarkScope>`. Not a global toggle.

- `theme/tokens.css` — light tokens on `:root`
- `theme/commandCenterDarkTokens.css` — dark tokens scoped to `.cw-scope-dark`
- All components read CSS variables, so they render correctly in both palettes without prop changes.

## 4. Frontend Architecture

```
frontend/src/
├── app/             # Shell, router, providers, dark-scope wrapper
├── components/      # Shared: KpiCard, StatusBadge, Drawer, FilterBar, Sidebar, TopHeader
├── config/          # Runtime config (Zod), feature flags, thresholds
├── data/seed/       # Typed seed datasets with provenance tracking
├── modules/         # Feature modules (auth, dashboard, command-center, gis, consumer, ai-analysis, settings)
├── repositories/    # Factory pattern: seed vs API implementation per data mode
├── services/api/    # HTTP client, API-specific service files, query DSL, param encoding
├── theme/           # CSS tokens, icon map, global component styles
└── utils/           # date, signal, status, geo, number helpers
```

**Route tree:** spec §6, all lazy-loaded. Deep links survive refresh (nginx SPA fallback + sessionStorage auth).

**Auth:** JWT from response header (not body). Stored in sessionStorage, not localStorage (spec §20.2).

## 5. Backend BFF Architecture

```
backend/src/
├── config/       # Zod-validated env
├── db/           # Pool, migrations (schema + seed SQL)
├── middleware/    # JWT auth, local token issuer
├── routes/       # auth, commandCenter, households, billing, alarms, sites
├── services/     # upstreamProxy — absorbs all spec §28 quirks
└── server.ts     # Express entry — wires everything, runs migrations on start
```

**Key upstream quirks absorbed:**
- Date param inconsistency (endDate vs toDate) — §28.1
- siteIds encoding (comma vs repeated) — §28.2
- Billing trailing slash (`/api/billing` list vs `/api/billing/` create) — §28.3
- Spring Data REST HAL unwrapping — §28.4
- 204 = not-found sometimes — §28.5

## 6. Postgres Seed Data

Site BHUBANESWAR (ID 6394), 04-Sep-2026 snapshot:
- 14 gateways with real telemetry aggregates
- 10 representative meters (intentionally odd timestamps preserved)
- 5 households, 3 bills, 9 alarms
- All seeded via `002_seed_data.sql`, idempotent (ON CONFLICT DO NOTHING)

## 7. Getting Started

```bash
# Clone, then:
cp .env.example .env
docker compose up --build

# Frontend: http://localhost:8088
# Backend:  http://localhost:4000/health
# Login:    admin/admin  |  operations/operations  |  billing/billing
```

## 8. What's Built vs What's Pending

### Built (Foundation)
- Full route tree with lazy loading
- All 13 module pages rendered with seed data
- Complete design token system (light + scoped dark)
- Backend BFF with seed + api branching on all routes
- Postgres schema + seed data
- Docker orchestration (three services)
- Auth flow (seed demo + upstream proxy)

### Pending (Phase 2+)
- Google Maps components (need API key)
- Generate Bill modal + slab management
- Household create/edit form
- Full 2,532 meter seed import
- Command Center selectors (selectReportingMeters, etc.)
- Unit/component/integration/E2E tests
- CI/CD pipeline

