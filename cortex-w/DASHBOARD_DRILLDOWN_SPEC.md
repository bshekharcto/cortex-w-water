# Cortex-W — Dashboard Drill-Down Modification

> **Scope:** Only `modules/dashboard/` and its route entries.
> Everything else in the application stays untouched.

> **⚠️ DATA SOURCE RULE — READ BEFORE BUILDING**
>
> Every number shown on the Dashboard must come from the **real backend API** at runtime.
> This spec contains reference values (zone counts, device counts, flow figures) taken from
> customer screenshots. Those numbers exist **only to explain what each metric means** —
> they are not data to be copied into the application. If you see a number like `4,371` or
> `529.299` in this document, it is an illustration. The production UI must fetch the
> equivalent value from the API. The only place reference numbers may appear in code is
> inside clearly marked seed/fixture/test files that are loaded exclusively when
> `APP_DATA_MODE=seed`. See **Section 9** for the seed-data boundary rules.

---

## 0. Why This Change

The current Dashboard (`DashboardPage.tsx`) shows a flat operational summary — installation counts, supply performance, network availability, trends, and an attention table. The customer's actual operating model is hierarchical:

```
All Zones  →  Zone  →  DMA  →  Meter
```

The Dashboard needs to reflect that hierarchy. When an operator clicks into a Zone, every metric on screen must immediately represent *only that Zone*. Same for DMA. No parent/global numbers should linger after drill-down.

The existing Cortex-W visual design — fonts, colors, cards, tables, sidebar, header, filters — stays exactly as-is. This spec changes only the Dashboard's **content, metrics, and navigation structure**.

---

## 1. What NOT to Touch

These are explicitly off-limits for this modification:

| Layer | Files / Components |
|-------|-------------------|
| **Shell** | `AppShell.tsx`, `Sidebar.tsx`, `TopHeader.tsx` |
| **Theme** | `tokens.css`, `commandCenterDarkTokens.css`, `global.css`, `cortexTheme.ts` |
| **Shared components** | `KpiCard.tsx`, `StatusBadge.tsx`, `Drawer.tsx`, `FilterBar.tsx`, `EmptyState.tsx` |
| **Other modules** | Command Center, GIS, Consumer, Billing, Alarms, Hydraulic, Settings |
| **Auth / Config** | Login, auth hooks, runtime config, feature flags |
| **Backend routes** | Existing BFF routes for command-center, households, billing, alarms, sites |

The `KpiCard`, table CSS classes (`cw-table`, `cw-table-wrap`), `StatusBadge`, `FilterBar`, and `EmptyState` components are reused as-is — they already support the patterns needed.

---

## 2. Drill-Down Hierarchy

```
GLOBAL (All Zones)
│   KPIs: Total Zones • Total Devices • Connected • Disconnected • Never Seen
│         Yesterday Flow • Today's Flow • Monthly Flow
│   Table: one row per Zone
│
├── ZONE (e.g. Awadhpuri)
│   │   KPIs: Total DMA Zones • Total Devices • Connected • Disconnected • Never Seen
│   │         Yesterday Flow • Today's Flow • Monthly Flow
│   │   Table: one row per DMA
│   │
│   └── DMA (e.g. DMA 1)
│           KPIs: Total Devices • Connected • Disconnected • Never Seen
│                 Yesterday Flow • Today's Flow • Monthly Flow
│           Table: one row per meter/device
│           (No "area count" card at DMA level — user is already inside one DMA)
```

**Critical rule:** KPI cards and the table below them always represent the *same selected scope*. When the user drills into Awadhpuri, every number on screen is Awadhpuri's number. Zero global residue.

---

## 3. Routes

Follow the existing router convention in `app/router.tsx`. The current Dashboard is a single route:

```tsx
<Route path="/app/dashboard" element={<DashboardPage />} />
```

Expand to support URL-addressable drill-down:

```tsx
<Route path="/app/dashboard" element={<DashboardPage />} />
<Route path="/app/dashboard/zone/:zoneId" element={<DashboardPage />} />
<Route path="/app/dashboard/zone/:zoneId/dma/:dmaId" element={<DashboardPage />} />
```

All three routes render the same `DashboardPage` component. The page reads `useParams()` to derive which scope level it's at. This keeps code-splitting simple (one chunk) and lets browser Back/Forward work naturally.

---

## 4. Breadcrumb

Render a breadcrumb bar above the KPI row. Use the existing Cortex-W typography — no new component style needed; a simple `<nav>` with the existing `cw-filter-bar` spacing pattern or a minimal dedicated `cw-breadcrumb` class is fine.

| Scope | Breadcrumb |
|-------|-----------|
| Global | `Dashboard` (plain text, not clickable) |
| Zone | `Dashboard` → `Awadhpuri` |
| DMA | `Dashboard` → `Awadhpuri` → `DMA 1` |

Parent segments are `<Link>` elements. The current (rightmost) segment is plain text.

---

## 5. KPI Cards — Metric Definitions

### 5.1 Metrics and Their Order

The card order is fixed and must not be rearranged:

| # | Metric | Shown At | Icon Suggestion | Tone |
|---|--------|----------|-----------------|------|
| 1 | **Total Zones** | Global only | `MapPin` | `primary` |
| 1 | **Total DMA Zones** | Zone only | `MapPin` | `primary` |
| — | *(hidden)* | DMA level | — | — |
| 2 | Total Devices | All levels | `Gauge` | `blue` |
| 3 | Connected | All levels | `Activity` | `green` |
| 4 | Disconnected | All levels | `WifiOff` | `orange` |
| 5 | Never Seen | All levels | `EyeOff` | `red` |
| 6 | Yesterday Flow (m³) | All levels | `Droplets` | `blue` |
| 7 | Today's Flow (m³) | All levels | `Droplets` | `teal` |
| 8 | Monthly Flow (m³) | All levels | `Droplets` | `primary` |

This tells the operator's story: *How big is the deployment → how many devices do we have → are they communicating → how much water is flowing.*

### 5.2 Connected / Disconnected / Never Seen

Each card shows **count** and **percentage**:

```
Connected
3,410  (78.01%)         ← display format example only, not a value to hardcode
```

Percentage formula: `count / totalDevices × 100`, displayed to two decimal places. Both `count` and `totalDevices` come from the API response for the current scope — they are never statically defined in frontend code.

**Mandatory invariant at every level:**

```
Connected + Disconnected + Never Seen = Total Devices
```

- **Connected:** device has qualifying recent telemetry per the approved connectivity rule
- **Disconnected:** device was previously seen but is now outside the connectivity window
- **Never Seen:** device is configured/provisioned but has never produced qualifying telemetry

These three states must remain distinct — do not merge Never Seen into Disconnected.

### 5.3 Flow Metrics

| Metric | Time Window | Boundary |
|--------|-------------|----------|
| Yesterday Flow | Previous complete local calendar day | `00:00:00` → `23:59:59` site timezone |
| Today's Flow | Current local calendar day so far | `00:00:00` → latest available reading |
| Monthly Flow | Month-to-date | 1st of current month `00:00` → latest reading |

These are **calendar-based**, not rolling windows. Display unit is always **m³**. If backend returns litres, divide by 1000. If KL, it's already 1:1 with m³ but confirm the conversion is applied, not just relabeled.

### 5.4 KPI Card Filtering (Optional Enhancement)

Clicking a connectivity card (Connected / Disconnected / Never Seen) can filter the table below to show only records matching that status. Use the existing `FilterBar` active-state styling. Provide a clear way to reset the filter (the existing "Reset" button in FilterBar handles this).

---

## 6. Tables — Per Scope Level

### 6.1 Global → Zone Overview

**Section heading:** "Zone Overview"

| Column | Notes |
|--------|-------|
| Zone | Clickable — navigates to `/app/dashboard/zone/:zoneId` |
| Devices | Total device count for the zone |
| Connected | `count (pct%)` |
| Disconnected | `count (pct%)` |
| Never Seen | `count (pct%)` |
| Yesterday Flow (m³) | |
| Today's Flow (m³) | |
| Monthly Flow (m³) | |
| Last Updated | Data-freshness timestamp, not browser render time |

Zone name is the drill-down trigger. Use the existing `cw-table-row--clickable` pattern and navigate via React Router (not modals).

### 6.2 Zone → DMA Overview

**Section heading:** "DMA Overview"

| Column | Notes |
|--------|-------|
| DMA | Clickable — navigates to `/app/dashboard/zone/:zoneId/dma/:dmaId` |
| Devices | |
| Connected | `count (pct%)` |
| Disconnected | `count (pct%)` |
| Never Seen | `count (pct%)` |
| Yesterday Flow (m³) | |
| Today's Flow (m³) | |
| Monthly Flow (m³) | |
| Last Updated | |

### 6.3 DMA → Meter / Device List

**Section heading:** "Meter Records" or "Device Records"

| Column | Notes |
|--------|-------|
| Zone | Parent zone name (contextual, since user came from breadcrumb) |
| DMA | Parent DMA name |
| Device ID | DevEUI / IMEI / registered device identifier — distinct from Meter ID |
| Meter ID | Physical/business meter identifier |
| Meter Type | e.g. "Axioma" |
| Consumer ID | Customer account identifier (not internal household DB id) |
| Consumer Name | Truncate + tooltip for long values |
| Address | Use existing table wrapping/truncation rules |
| Meter Size | e.g. "15mm" or "0.5" — display as-is from backend |
| Totalizer (m³) | Latest cumulative reading, not a flow delta |
| Last Data | Timestamp of latest reading |
| Status | `StatusBadge` — Connected / Disconnected / Never Seen |

If the existing meter detail drawer or page exists (the Command Center already has a drawer pattern), clicking a Device ID or Meter ID should open it. Do not build a duplicate detail interface.

### 6.4 All Tables — Preserve Existing Behavior

Use the existing `cw-table` / `cw-table-wrap` / `cw-table-row--clickable` CSS. Keep:
- Search (via `FilterBar`)
- Column sorting
- Pagination
- Loading skeleton / spinner
- Empty state (`EmptyState` component)
- Hover states
- Responsive horizontal scroll

Do not introduce new table styling, DataTables-style controls, or colored number pills.

---

## 7. Scope State Model

```ts
type DashboardScope =
  | { level: 'GLOBAL' }
  | { level: 'ZONE';  zoneId: string; zoneName: string }
  | { level: 'DMA';   zoneId: string; zoneName: string; dmaId: string; dmaName: string };
```

Derive this from `useParams()`. Zone/DMA names can be resolved from the data (don't require them in the URL — IDs are sufficient, names come from the fetched records).

Preserve the scope across:
- Refresh (URL-driven, so this is automatic)
- Return from meter detail (user should land back at the same DMA/Zone view, same page/sort/search if practical)

---

## 8. Domain Types

> These are **frontend display models**, not API response shapes. The data service
> maps backend DTOs into these interfaces. Components work exclusively with these
> types — they never see raw API payloads or seed fixtures.

### 8.1 KPI Summary

```ts
interface DashboardKpis {
  childAreaCount?: number;       // Total Zones (global) or Total DMA Zones (zone) — omitted at DMA level

  totalDevices: number;
  connected: number;
  disconnected: number;
  neverSeen: number;

  connectedPct: number;          // connected / totalDevices * 100
  disconnectedPct: number;
  neverSeenPct: number;

  yesterdayFlowM3: number;
  todayFlowM3: number;
  monthToDateFlowM3: number;

  dataTimestamp?: string;        // ISO timestamp of data freshness
}
```

### 8.2 Zone Row

```ts
interface ZoneRow {
  zoneId: string;
  zoneName: string;
  totalDevices: number;
  connected: number;
  disconnected: number;
  neverSeen: number;
  yesterdayFlowM3: number;
  todayFlowM3: number;
  monthToDateFlowM3: number;
  dataTimestamp?: string;
}
```

### 8.3 DMA Row

```ts
interface DmaRow {
  dmaId: string;
  dmaName: string;
  zoneId: string;
  zoneName: string;
  totalDevices: number;
  connected: number;
  disconnected: number;
  neverSeen: number;
  yesterdayFlowM3: number;
  todayFlowM3: number;
  monthToDateFlowM3: number;
  dataTimestamp?: string;
}
```

### 8.4 Meter Row

```ts
interface MeterRow {
  zoneName: string;
  dmaName: string;
  deviceId: string;              // DevEUI / IMEI
  meterId: string;               // physical meter number
  meterType?: string;
  consumerId?: string;
  consumerName?: string;
  address?: string;
  meterSize?: string;
  totalizerM3?: number;          // latest cumulative reading
  latestReadingAt?: string;      // ISO timestamp
  connectivityStatus: 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN';
}
```

---

## 9. Data Source Rules — Seed vs Real API

### 9.1 The Hard Rule

**Production data comes from the backend API. Period.**

The Dashboard data service (`dashboardDataService.ts`) must follow the existing repository-factory pattern used across Cortex-W: when `APP_DATA_MODE=seed` it returns local fixture data; when `APP_DATA_MODE=api` or `hybrid` it calls the real BFF endpoints. The page components and hooks must never import seed files directly — they consume the data service, which decides the source.

```
┌─────────────────────────────────┐
│  DashboardPage / hooks          │  ← never imports seed data
│         │                       │
│  dashboardDataService.ts        │  ← checks APP_DATA_MODE
│       /            \            │
│    seed              api        │
│  (fixtures)      (real BFF)     │
└─────────────────────────────────┘
```

### 9.2 What Seed Data Is For

Seed data exists so a developer can:
- Run the app locally without a backend connection
- Verify that drill-down navigation, KPI rendering, table sorting, breadcrumb, and loading states work correctly
- Demo the UI to stakeholders before API integration is complete

Seed data is **scaffolding**, not the product. It lives in `data/seed/` and is gated behind `APP_DATA_MODE=seed`. It must never leak into API-mode code paths.

### 9.3 What Seed Data Is NOT

- It is not the source of truth for zone names, DMA names, device counts, flow values, or connectivity status
- It is not a fallback for when the API is slow or fails — that's what loading states and error states are for
- It must not be used as default values, initial state, or placeholder content in production
- The numbers in this spec (e.g. "912 devices", "529.299 m³") are illustrations explaining what each metric means — they must not appear in any code path that runs when `APP_DATA_MODE=api`

### 9.4 Seed File Structure

Replace the current flat `dashboardSeed.ts` with a hierarchical fixture. Example shape:

```ts
// data/seed/dashboard/dashboardDrilldownSeed.ts

import type { SeedProvenance } from '../provenance';

export const DASHBOARD_DRILLDOWN_SEED_PROVENANCE: SeedProvenance = 'SYNTHETIC_DEMO';

/**
 * ⚠️  SYNTHETIC FIXTURE DATA — for local development and UI testing only.
 *
 * These numbers are invented to exercise the drill-down UI at all three
 * hierarchy levels. They do not represent real deployment data.
 * When APP_DATA_MODE=api, this file is never loaded.
 *
 * If you are wiring up real API endpoints, do NOT reference this file.
 * All production values come from dashboardDataService.ts → BFF → upstream API.
 */
export const dashboardDrilldownSeed = {
  zones: [
    {
      zoneId: 'seed-zone-1', zoneName: 'Demo Zone Alpha',
      totalDevices: 500, connected: 420, disconnected: 60, neverSeen: 20,
      yesterdayFlowM3: 310.5, todayFlowM3: 88.2, monthToDateFlowM3: 4200.0,
      dmas: [
        {
          dmaId: 'seed-dma-1a', dmaName: 'DMA A1',
          totalDevices: 200, connected: 170, disconnected: 22, neverSeen: 8,
          yesterdayFlowM3: 130.0, todayFlowM3: 35.0, monthToDateFlowM3: 1700.0,
        },
        {
          dmaId: 'seed-dma-1b', dmaName: 'DMA A2',
          totalDevices: 300, connected: 250, disconnected: 38, neverSeen: 12,
          yesterdayFlowM3: 180.5, todayFlowM3: 53.2, monthToDateFlowM3: 2500.0,
        },
      ],
    },
    // ... add 2-3 more zones so the global table has enough rows to test
    //     pagination, sorting, and search
  ],
};
```

Notice:
- **Provenance is `SYNTHETIC_DEMO`** — not `RAW_EXPORT`, not `EXISTING_UI_REFERENCE`
- **Zone/DMA names are generic** ("Demo Zone Alpha") — not the customer's real zone names
- **Numbers are round/obviously fake** — so no one mistakes them for real data
- The file-level doc comment spells out that this is fixture-only

### 9.5 Protecting the Boundary in Code

The `dashboardDataService.ts` must be the **only file** that imports seed data, and only inside an `APP_DATA_MODE === 'seed'` branch:

```ts
// dashboardDataService.ts

import { runtimeConfig } from '@/config/runtimeConfig';

// Lazy import — only loaded when seed mode is active
async function getSeedData() {
  const { dashboardDrilldownSeed } = await import(
    '@/data/seed/dashboard/dashboardDrilldownSeed'
  );
  return dashboardDrilldownSeed;
}

export async function fetchZoneRows(): Promise<ZoneRow[]> {
  if (runtimeConfig.APP_DATA_MODE === 'seed') {
    const seed = await getSeedData();
    return seed.zones.map(z => ({ /* map to ZoneRow */ }));
  }

  // Real API call — this is the production path
  const response = await httpClient.get('/api/dashboard/zones');
  return response.data.map(mapApiZoneToRow);
}
```

This way:
- Seed data is tree-shaken out of the production bundle when the dynamic import is never triggered
- Hooks and components never see seed data — they only see the `ZoneRow[]` / `DmaRow[]` / `MeterRow[]` shapes
- The API path is the default, not an afterthought

### 9.6 Checklist Before Marking API Integration Complete

- [ ] `dashboardDataService.ts` fetches from real BFF endpoints when `APP_DATA_MODE=api`
- [ ] No component or hook imports anything from `data/seed/`
- [ ] Zone names, DMA names, device counts, flow values all come from API responses
- [ ] Connectivity status (Connected / Disconnected / Never Seen) uses the backend's classification, not a locally invented threshold
- [ ] Flow time windows (yesterday, today, monthly) use the backend's calendar-day boundaries, not a frontend approximation
- [ ] Totalizer values are the backend's latest cumulative reading, not a computed delta
- [ ] Unit conversion (L → m³) happens in the service layer, not hardcoded display strings
- [ ] No customer reference numbers from this spec (4371, 912, 529.299, etc.) appear in any non-seed code path
- [ ] Switching `APP_DATA_MODE` from `seed` to `api` in `.env` produces a working dashboard with real data (or clean error states if the backend is unavailable)

---

## 10. Module File Structure

Restructure `modules/dashboard/` to separate concerns:

```
modules/dashboard/
├── models/
│   ├── dashboardScope.ts          # DashboardScope type
│   ├── dashboardKpis.ts           # DashboardKpis type
│   └── dashboardRows.ts           # ZoneRow, DmaRow, MeterRow types
├── services/
│   ├── dashboardDataService.ts    # fetches raw data (seed or API)
│   └── dashboardAggregation.ts    # computes KPIs from raw data, unit conversion
├── hooks/
│   ├── useDashboardScope.ts       # reads useParams() → DashboardScope
│   ├── useDashboardKpis.ts        # returns KPIs for current scope
│   ├── useZoneRows.ts             # global-level table data
│   ├── useDmaRows.ts              # zone-level table data
│   └── useDmaMeterRows.ts         # dma-level table data
├── components/
│   ├── DashboardBreadcrumb.tsx    # breadcrumb nav
│   ├── DashboardKpiRow.tsx        # renders the 7-8 KPI cards for current scope
│   ├── ZoneOverviewTable.tsx      # global table (zone rows)
│   ├── DmaOverviewTable.tsx       # zone table (dma rows)
│   └── DmaMeterTable.tsx          # dma table (meter rows)
├── pages/
│   └── DashboardPage.tsx          # orchestrator: scope → KPIs + table
└── types/
    └── dashboard.types.ts         # (existing, can be consolidated with models/)
```

Do not put API calls, aggregation logic, and rendering in a single file.

---

## 11. Data Composition Strategy

All data flows from the real backend through the BFF. The data service assembles the dashboard domain models from API responses — it does not generate, estimate, or substitute values locally.

```
     Real upstream backend (water platform)
                    │
     backend BFF (Express, absorbs API quirks)
                    │
     dashboardDataService.ts          ← single entry point for all dashboard data
       │                                 checks APP_DATA_MODE:
       │                                   'seed' → loads fixture file (dev only)
       │                                   'api'  → calls BFF endpoints (production)
       │
     dashboardAggregation.ts          ← unit conversion (L→m³), percentage calc,
       │                                 hierarchy rollup if needed
       │
     DashboardKpis / ZoneRow[] / DmaRow[] / MeterRow[]
       │
     Existing Cortex-W components     ← KpiCard, cw-table, StatusBadge, etc.
```

**Avoid N+1 calls.** The fleet is large (~4000+ devices). Prefer aggregate/batch endpoints. Use frontend aggregation where a single API call returns data that can be sliced by zone/DMA client-side. Only make per-scope API calls if the backend genuinely requires scope parameters.

**Do not invent data the API doesn't provide.** If the backend doesn't return a "Never Seen" count, don't compute one from a locally invented threshold. Flag the gap and request a backend enhancement. The frontend displays what the API provides, with formatting and unit conversion — it does not fabricate operational metrics.

For API binding details (paths, auth headers, date-param quirks, siteIds encoding), refer to the existing upstream proxy service at `backend/src/services/upstreamProxy.ts` and the route handlers in `backend/src/routes/`. For the real API contract, consult `CORTEX_W_API_BINDING_MEMORY.md`.

---

## 12. Unit Conversion

All flow values displayed on the Dashboard must use **m³**.

| Backend unit | Conversion |
|-------------|-----------|
| Litres (L) | ÷ 1000 |
| Kilolitres (KL) | 1:1 (KL = m³) |
| m³ | No conversion |

Apply conversion in the service/aggregation layer, not in the component. Use full precision during calculation; round only for display using the existing `formatNumber` / `formatDecimal` utilities.

---

## 13. Search and Filter Behavior

Use the existing `FilterBar` component at each level:

| Scope | Search placeholder | Optional status filter |
|-------|-------------------|----------------------|
| Global | "Search zones…" | — |
| Zone | "Search DMAs…" | — |
| DMA | "Search by device ID, meter ID, consumer…" | Connected / Disconnected / Never Seen |

At DMA level, the connectivity status filter can also be driven by clicking a KPI card (Connected / Disconnected / Never Seen). Clicking the same card again, or clicking the FilterBar reset button, clears the filter.

---

## 14. Loading and Error States

- Use the existing `cw-spinner` / `cw-page-loader` pattern during scope transitions
- Never show zeroes while data is still loading — show the loading state instead
- Use `EmptyState` for genuinely empty data ("No DMA records for this zone", "No meters in this DMA", "No records match the current filter")
- Distinguish "no data available" from "failed to load" — use existing error handling, not `window.alert()`

---

## 15. Refresh Behavior

When the user refreshes the browser at `/app/dashboard/zone/zone-awadhpuri/dma/dma-awdh-1`:
- The page must reload at DMA scope (DMA 1 inside Awadhpuri)
- KPIs and table must show DMA 1 data
- Do not bounce back to Global
- Preserve search/sort/page state where practical (URL search params or component state restored from the route)

---

## 16. Navigation

| Action | Result |
|--------|--------|
| Click zone name in table | Navigate to `/app/dashboard/zone/:zoneId` |
| Click DMA name in table | Navigate to `/app/dashboard/zone/:zoneId/dma/:dmaId` |
| Click breadcrumb "Dashboard" | Navigate to `/app/dashboard` |
| Click breadcrumb zone name | Navigate to `/app/dashboard/zone/:zoneId` |
| Browser Back from DMA | Returns to Zone view |
| Browser Back from Zone | Returns to Global view |
| Click meter row (Device ID / Meter ID) | Open existing meter detail (drawer or page, whatever Command Center already uses) |

When returning from meter detail, the user should land back at the same DMA scope — not be forced to re-navigate from Global.

---

## 17. Dashboard vs Other Modules — Boundaries

**Dashboard answers:** *How is the water deployment performing by Zone and DMA?*

**Dashboard does NOT replace:**

| Module | Responsibility |
|--------|---------------|
| Command Center | Gateway-level telemetry, RSSI/SNR, frame counts, gateway traffic |
| Consumer / Households | Household editing, documents, meter replacement workflows |
| Billing | Bill generation, slab management, payment status |
| Alarms | Alarm rules, severity management, acknowledgment workflows |

The DMA meter table shows consumer name/address for operational context, but any editing or detailed consumer workflows remain in their existing modules.

---

## 18. Data Reconciliation Rules

At every hierarchy level, validate:

```
Connected + Disconnected + Never Seen = Total Devices
```

If backend data doesn't reconcile, log the discrepancy during development — don't silently manufacture counts to force the math.

For flow totals:

```
sum(Zone Yesterday Flow) ≈ Global Yesterday Flow
sum(DMA Yesterday Flow)  ≈ Zone Yesterday Flow
```

(Within normal floating-point/rounding tolerance.)

If devices aren't mapped to any DMA, only introduce an "Unassigned" group after confirming that state exists in the source data.

---

## 19. Implementation Phases

### Phase 1 — Global Level
- New route entries in `router.tsx`
- `useDashboardScope` hook
- Replace current `DashboardPage.tsx` content with Global KPIs + Zone table
- New seed data with zone hierarchy
- Breadcrumb component

### Phase 2 — Zone Level
- Zone-scoped KPIs (first card becomes "Total DMA Zones")
- DMA overview table
- Zone drill-down navigation

### Phase 3 — DMA Level
- DMA-scoped KPIs (no area-count card)
- Meter/device table with all required columns
- Link to existing meter detail
- Connectivity status filter via KPI card click

### Phase 4 — Polish
- Search/sort/page state preservation across drill-down
- Back-navigation state restoration
- Performance optimization (caching, batch fetching)
- Data reconciliation logging

### Phase 5 — Production Data Verification
- Switch `APP_DATA_MODE` to `api` and confirm every KPI, table row, and meter record renders from real backend data
- Grep the entire `modules/dashboard/` directory for any literal numbers that match customer reference values — remove them
- Confirm that removing or emptying the seed file does not break `api` mode
- Confirm that connectivity status labels come from the backend classification, not a local rule
- Confirm flow values display in m³ after real unit conversion, not just a relabeled KL value

---

## 20. No Hardcoded Data — Enforcement Rules

This is important enough to get its own section.

**In `modules/dashboard/` (pages, hooks, components, services):**
- No static zone names (no `'Awadhpuri'`, `'DMA 1'` literals)
- No static device counts (no `4371`, `912`, `155` literals)
- No static flow values (no `529.299`, `1223.08` literals)
- No static percentages (no `78.01`, `93.42` literals)
- No static consumer names, addresses, or meter IDs

**Allowed exceptions:**
- Labels and UI strings: `"Total Zones"`, `"Yesterday Flow (m³)"`, `"Connected"` — these are metric *labels*, not data
- Formatting constants: decimal places (`2`), page sizes (`20`), column widths
- Enum values: `'CONNECTED'`, `'DISCONNECTED'`, `'NEVER_SEEN'` — these are domain states, not data values
- Seed files in `data/seed/` — clearly marked `SYNTHETIC_DEMO`, loaded only when `APP_DATA_MODE=seed`

**Simple test:** If you can change `APP_DATA_MODE` from `seed` to `api`, point the BFF at a real upstream, and the Dashboard renders real zone/DMA/meter data with zero code changes — the boundary is correct. If it crashes or shows stale fixture values — it's not.

---

## 21. Files Changed (Summary)

| File | Change |
|------|--------|
| `app/router.tsx` | Add two new Dashboard route entries (zone, dma) |
| `modules/dashboard/pages/DashboardPage.tsx` | Complete rewrite — scope-aware orchestrator |
| `modules/dashboard/` | New subdirectories: `models/`, `services/`, `hooks/`, `components/` |
| `data/seed/telemetry/dashboardSeed.ts` | Replace flat seed with hierarchical zone/dma/meter seed |

| File | NOT Changed |
|------|-------------|
| `components/cards/KpiCard.tsx` | Reused as-is |
| `components/status/StatusBadge.tsx` | Reused as-is |
| `components/filters/FilterBar.tsx` | Reused as-is |
| `components/empty-state/EmptyState.tsx` | Reused as-is |
| `components/drawer/Drawer.tsx` | Reused as-is |
| `theme/*` | Untouched |
| `app/AppShell.tsx` | Untouched |
| `components/layout/Sidebar.tsx` | Untouched |
| `components/layout/TopHeader.tsx` | Untouched |
| All other modules | Untouched |
