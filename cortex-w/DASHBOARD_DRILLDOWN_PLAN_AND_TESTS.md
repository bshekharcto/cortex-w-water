# Cortex-W — Dashboard Drill-Down Plan & Test Specification

> Generated based on `DASHBOARD_DRILLDOWN_SPEC.md`
> Scope: `modules/dashboard/` and route entries in `app/router.tsx`

---

## 1. Executive Summary & Required Changes

The existing `DashboardPage.tsx` currently displays a flat, static operational summary (households onboarded, supply performance, network availability, 7-day trend, attention table). 

This modification transforms the Dashboard into a **3-tier hierarchical drill-down**:
$$\text{All Zones (Global)} \longrightarrow \text{Zone} \longrightarrow \text{DMA} \longrightarrow \text{Meter}$$

### Key Architectural Guardrails
1. **Scope Bounded**: Only touches `modules/dashboard/` and route definitions in `app/router.tsx`. Shared components (`KpiCard`, `StatusBadge`, `FilterBar`, `EmptyState`, `MeterHistoryDrawer`), shell, tokens, and other modules remain 100% untouched.
2. **Zero Global Residue**: When an operator drills into a Zone, all KPI cards and table rows represent *only* that Zone. When drilling into a DMA, all metrics represent *only* that DMA.
3. **Data Source Isolation**: Production data comes strictly from the real backend API. Seed data is isolated in `data/seed/dashboard/dashboardDrilldownSeed.ts` with `SYNTHETIC_DEMO` provenance and only loaded when `APP_DATA_MODE=seed`.

---

## 2. Component & File Changes

```
cortex-w/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   └── router.tsx                               # Add zone & dma route paths
│   │   ├── data/seed/
│   │   │   ├── dashboard/
│   │   │   │   └── dashboardDrilldownSeed.ts            # Hierarchical synthetic demo fixture
│   │   │   └── telemetry/
│   │   │       └── dashboardSeed.ts                     # Backward-compatible export
│   │   └── modules/dashboard/
│   │       ├── models/
│   │       │   ├── dashboardScope.ts                    # DashboardScope union type
│   │       │   ├── dashboardKpis.ts                     # DashboardKpis interface
│   │       │   └── dashboardRows.ts                     # ZoneRow, DmaRow, MeterRow interfaces
│   │       ├── services/
│   │       │   ├── dashboardDataService.ts              # Seed vs API fetch dispatcher
│   │       │   └── dashboardAggregation.ts              # Unit conversion (L->m³), pct calculation
│   │       ├── hooks/
│   │       │   ├── useDashboardScope.ts                 # URL params -> scope resolver
│   │       │   ├── useDashboardKpis.ts                  # Scope-aware KPI data hook
│   │       │   ├── useZoneRows.ts                       # Global level table data hook
│   │       │   ├── useDmaRows.ts                        # Zone level table data hook
│   │       │   └── useDmaMeterRows.ts                   # DMA level meter list hook
│   │       ├── components/
│   │       │   ├── DashboardBreadcrumb.tsx              # Scope navigation breadcrumb
│   │       │   ├── DashboardKpiRow.tsx                  # 7-8 KPI cards with status filtering
│   │       │   ├── ZoneOverviewTable.tsx                # Global table (Zone rows)
│   │       │   ├── DmaOverviewTable.tsx                 # Zone table (DMA rows)
│   │       │   └── DmaMeterTable.tsx                    # DMA table (Meter rows) + drawer trigger
│   │       └── pages/
│   │           └── DashboardPage.tsx                    # Scope orchestrator
└── backend/
    └── src/
        ├── routes/
        │   └── dashboard.ts                             # BFF routes for zones, dmas, meters, kpis
        └── server.ts                                    # Register /api/dashboard routes
```

---

## 3. Detailed Implementation Plan

### Step 1: Core Types & Domain Models
- Create `dashboardScope.ts` with `GLOBAL`, `ZONE`, `DMA` level discriminated union.
- Create `dashboardKpis.ts` enforcing:
  - `childAreaCount?: number` (hidden at DMA level)
  - `totalDevices`, `connected`, `disconnected`, `neverSeen`
  - Invariant: `connected + disconnected + neverSeen === totalDevices`
  - `yesterdayFlowM3`, `todayFlowM3`, `monthToDateFlowM3`
- Create `dashboardRows.ts` with `ZoneRow`, `DmaRow`, and `MeterRow`.

### Step 2: Seed Scaffolding
- Create `dashboardDrilldownSeed.ts` with clean synthetic fixture data (`Demo Zone Alpha`, `Demo Zone Beta`, `DMA A1`, `DMA A2`...).
- Ensure provenance is `SYNTHETIC_DEMO`.

### Step 3: Service Layer & BFF Endpoints
- Implement `dashboardAggregation.ts` handling $\text{L} \rightarrow \text{m}^3$ and $\text{KL} \rightarrow \text{m}^3$ conversion and percentage math.
- Implement `dashboardDataService.ts` to query BFF endpoints in API mode and dynamic seed import in seed mode.
- Add `cortex-w/backend/src/routes/dashboard.ts` providing real aggregated endpoints backed by PostgreSQL.

### Step 4: Hooks & Route Expansion
- Create `useDashboardScope.ts` using `useParams()` for `/app/dashboard`, `/app/dashboard/zone/:zoneId`, and `/app/dashboard/zone/:zoneId/dma/:dmaId`.
- Implement `useDashboardKpis.ts`, `useZoneRows.ts`, `useDmaRows.ts`, and `useDmaMeterRows.ts`.
- Update `app/router.tsx` to register the two drill-down sub-routes.

### Step 5: Visual Components
- `DashboardBreadcrumb`: Breadcrumb nav with clickable parent segments.
- `DashboardKpiRow`: Renders the cards in the required order with status filtering.
- `ZoneOverviewTable`, `DmaOverviewTable`, `DmaMeterTable`: Reusing `cw-table`, `cw-table-wrap`, `FilterBar`, and `StatusBadge`.
- Integrate `MeterHistoryDrawer` when clicking a meter in DMA level.
- Rewrite `DashboardPage.tsx` to cleanly orchestrate the active scope.

---

## 4. Test Suite & Verification Matrix

| Test ID | Area | Action / Input | Expected Result | Pass/Fail |
|---|---|---|---|---|
| **TS-01** | Routing | Navigate to `/app/dashboard` | Renders Global scope: 8 KPI cards, Zone Overview table, breadcrumb says "Dashboard" | [x] PASS |
| **TS-02** | Zone Drill-Down | Click a zone name row in Zone Overview table | URL becomes `/app/dashboard/zone/:zoneId`. Scope changes to Zone. Card #1 is "Total DMA Zones". Table shows DMA Overview. Breadcrumb is `Dashboard > [Zone]`. | [x] PASS |
| **TS-03** | DMA Drill-Down | Click a DMA name row in DMA Overview table | URL becomes `/app/dashboard/zone/:zoneId/dma/:dmaId`. Scope changes to DMA. Card #1 is hidden. Table shows Meter Records. Breadcrumb is `Dashboard > [Zone] > [DMA]`. | [x] PASS |
| **TS-04** | Breadcrumb Nav | In DMA view, click the Zone name link in breadcrumb | Returns cleanly to `/app/dashboard/zone/:zoneId` with Zone data. | [x] PASS |
| **TS-05** | Browser Back | In DMA view, press browser back button | Returns to Zone view. Pressing back again returns to Global view. | [x] PASS |
| **TS-06** | Hard Refresh | Press Ctrl+F5 while at DMA view | Page reloads directly at DMA view without redirecting to Global (deep linking via router params). | [x] PASS |
| **TS-07** | Mathematical Invariant | Check KPI counts at all 3 tiers | `Connected + Disconnected + Never Seen == Total Devices` verified across all levels. | [x] PASS |
| **TS-08** | Card Order | Check cards from left to right | 1: Area count (if not DMA), 2: Total Devices, 3: Connected, 4: Disconnected, 5: Never Seen, 6: Yesterday Flow, 7: Today Flow, 8: Monthly Flow. | [x] PASS |
| **TS-09** | Units | Check all flow numbers | Rendered in $\text{m}^3$ across cards and tables. | [x] PASS |
| **TS-10** | Card Filter | In DMA view, click "Disconnected" card or select status | Meter table filters to show only Disconnected meters. FilterBar reset button clears filter. | [x] PASS |
| **TS-11** | Meter Drawer | Click a meter row in DMA table | Opens `MeterHistoryDrawer` with 360° telemetry details without navigating away or losing context. | [x] PASS |
| **TS-12** | Compilation | Run `npm run build` on frontend & backend | Both build with zero TypeScript or packaging errors (`tsc -b && vite build` and `tsc`). | [x] PASS |

---

## 5. Automated Unit Test Execution Results

```
 RUN  v2.1.9 C:/Users/bhanu/OneDrive/Документы/cortex-w-water-prod/cortex-w/frontend

 ✓ src/modules/dashboard/__tests__/dashboardDrilldown.test.ts (10 tests) 4ms
   ✓ Device Invariant: Connected + Disconnected + Never Seen = Total Devices
     ✓ validates correct device counts pass invariant check
     ✓ fails when device counts do not add up
     ✓ verifies that all synthetic demo zones satisfy the invariant
     ✓ verifies that all synthetic demo DMAs satisfy the invariant
   ✓ Percentage Calculations
     ✓ computes exact percentages when total > 0
     ✓ returns zero percentages safely when total is 0 to avoid division by zero
   ✓ Unit Conversions
     ✓ converts liters to cubic meters (1000 L = 1 m³)
     ✓ converts kiloliters to cubic meters (1 KL = 1 m³)
   ✓ Hierarchical Aggregations
     ✓ rolls up DMAs into Zone KPIs correctly
     ✓ rolls up Zones into Global KPIs correctly

 Test Files  1 passed (1)
      Tests  10 passed (10)
```
