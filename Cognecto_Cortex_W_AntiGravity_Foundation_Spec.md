
# Cognecto Cortex-W — AntiGravity Foundation Build Specification

**Document purpose:** This is the foundation prompt for building the new **Cognecto Cortex-W** water intelligence web application as a modular Dockerized frontend.

**Product name:** `Cortex-W`  
**Product family:** Cognecto Cortex  
**W = Water**  
**Primary deployment context for the seed build:** Bhubaneswar water-meter operations  
**Document status:** Foundation specification — use this as the baseline for the first production-shaped implementation, not as a throwaway prototype.

---

# 0. Read this first — source-of-truth rules

This project is a deliberate **UX and information-architecture rebuild** of an organically evolved water-meter monitoring application. The existing application accumulated many reports over time. The new product must organize those capabilities into a small number of clear operator workflows.

There are three different source types behind this specification and they must be treated differently:

1. **This specification and the supplied screenshots are the source of truth for product modules, workflows, visual hierarchy, interaction patterns and information architecture.**
2. **`WATER_MODULE_REFERENCE.md` is to be used ONLY as the API/backend contract reference.**
   - Do **not** copy its old screen structure.
   - Do **not** recreate its old report navigation.
   - Do **not** infer product modules from that file.
   - Do use it for endpoint paths, request/response fields, authentication, permissions, backend quirks, parameter encoding, DTOs and known API inconsistencies.
3. **`WaterRawData_BHUBANESWAR_2026-09-04.xlsx` is a seed-data reference for realistic telemetry, gateway IDs, meter IDs, radio quality and device-health values.**
   - It is not an API contract.
   - It is not the source of truth for installation totals or business workflow definitions.

If there is a conflict:
- UX/module structure → follow this document.
- API wire contract → follow the API section in this document, which is derived from `WATER_MODULE_REFERENCE.md`.
- Demo values → follow the seed-data section.

---

# 1. Product vision

Cortex-W is a focused water intelligence workspace for municipal and utility water-meter deployments.

The first version must make it possible for an operator to answer, within seconds:

- How many households and meters are in the system?
- How many meters are actually reporting?
- Which gateways are currently receiving data?
- How many meters are being heard by each gateway?
- Which meters have stopped reporting?
- Is a silent meter a meter problem, a gateway/data-flow problem, or a coverage problem?
- Where are meters and gateways physically located?
- Where should additional gateways be placed?
- Which consumers are associated with which meters?
- What bills exist, what is overdue, and what consumption was billed?
- What operational alarms deserve attention?
- What hydraulic/anomaly patterns are emerging?

The application is **not** intended to reproduce dozens of old reports as top-level navigation items. Reports should become contextual data views, drill-downs, filters, exports, tabs, drawers or detail pages inside a coherent Cortex-W workflow.

---

# 2. Non-negotiable implementation principles

## 2.1 UX principles

- **Light application workspace only.**
- Do not implement a full dark-mode application.
- The login screen may retain the established Cortex family split layout with a dark branded marketing panel on the left and a white authentication panel on the right.
- The authenticated app may use a dark navy Cortex-family sidebar, but the main workspace, command center, maps, tables, cards and analysis views must remain light.
- The supplied dark Command Center screenshot is a **layout/information-density reference only**. Recreate its operational density in the Cortex light visual language.
- Use thin, relevant line icons. Prefer a single icon system such as Lucide.
- Avoid decorative illustrations inside operational screens.
- Avoid large gradients, glassmorphism, neon effects, oversized shadows or dashboard gimmicks.
- Prioritize scanability, dense but calm operational information and predictable drill-down behavior.

## 2.2 Engineering principles

- Build as a **modular application**, not one large file.
- Never place the whole application into `App.tsx`, `app.js`, `desktop.html`, `index.html` or any equivalent monolith.
- Route-level components should orchestrate; domain logic belongs in services/hooks/repositories.
- API calls must be isolated behind typed client modules.
- Mock/seed data must be isolated behind the same repository interfaces used by API mode.
- Pages must not import raw seed JSON directly.
- Avoid hard-coding API base URLs inside page components.
- Avoid hard-coding Google Maps credentials in source code.
- Keep files reasonably small. As a practical rule:
  - route/page component: target < 250 lines;
  - reusable component: target < 200 lines;
  - service/repository: target < 250 lines;
  - split larger modules by concern.
- Create explicit domain types for Meter, Gateway, Household, Bill, Alarm, DMA/HydraulicMetric and API DTOs.
- Separate API DTOs from UI/domain models where transformation is required.

## 2.3 Stack rule

If a current **Cortex-family starter/repository** exists in the target workspace, use its established:
- frontend framework,
- routing,
- state/data-fetching layer,
- design tokens,
- shared shell,
- icon library,
- charting library,
- Docker/Nginx pattern.

Do not replace a working Cortex-family stack simply because another framework is preferred.

If no Cortex starter is available, default to:

- React + TypeScript
- Vite
- React Router
- TanStack Query for server state
- Zustand or Context only for light application state
- Tailwind CSS or CSS variables + module styles
- Lucide icons
- Recharts/ECharts for charts
- Google Maps JavaScript API for GIS
- date-fns
- Zod for configuration/runtime validation where useful
- Vitest + Testing Library
- Docker multi-stage build + Nginx static serving

---

# 3. Product identity and visual system

## 3.1 Brand naming

Authenticated shell branding:

**Cortex-W**  
small subline: **Water Intelligence**

Page header pattern:

`Cortex-W | <Page Name>`

small uppercase subline:

`POWERED BY COGNECTO`

Login brand pattern:

**Cortex-W**  
**Water Intelligence**

Badge:

`A COGNECTO PRODUCT`

Do not use the NRIDA branding from the visual reference. The visual language is relevant; the product identity is Cortex-W.

## 3.2 Recommended color tokens

Use existing Cortex tokens when available. Otherwise use approximately:

```css
--cw-bg: #F6F8FC;
--cw-surface: #FFFFFF;
--cw-surface-soft: #F9FAFC;
--cw-sidebar: #111827;
--cw-sidebar-hover: #1B2435;
--cw-sidebar-text: #CBD5E1;
--cw-sidebar-text-active: #FFFFFF;

--cw-primary: #5B5CF6;
--cw-primary-soft: #EEF0FF;
--cw-primary-border: #DDE1FF;

--cw-blue: #4F7FF0;
--cw-green: #43A566;
--cw-green-soft: #EAF8EF;
--cw-orange: #E77A2D;
--cw-orange-soft: #FFF3E8;
--cw-red: #D85850;
--cw-red-soft: #FDEDEC;
--cw-purple: #9A62E8;
--cw-teal: #43988E;

--cw-text: #172033;
--cw-text-muted: #697386;
--cw-text-faint: #9AA4B2;
--cw-border: #E4E9F1;
--cw-border-strong: #D7DEE9;
```

## 3.3 Typography

- Use the same Cortex family font if available.
- Otherwise use Inter.
- Page title: 24–28 px, semibold/bold.
- Section title: 17–20 px, semibold.
- KPI number: 28–38 px depending on density.
- Table body: 13–14 px.
- Supporting metadata: 11–12 px.
- Uppercase micro-labels should have light letter spacing and never dominate the screen.

## 3.4 Shape and spacing

- Main panel border radius: 12 px.
- Small controls: 8–10 px.
- Card border: 1 px.
- Shadow: extremely subtle.
- Standard page gutter: 24 px desktop, 16 px compact.
- Cards should use 18–22 px internal padding.
- Avoid excessively tall cards.
- Tables should be dense enough for operations use.

## 3.5 Iconography

Use thin line icons, generally 16–20 px with consistent stroke width.

Suggested mapping:

- Dashboard → `LayoutDashboard`
- Command Center → `Activity`
- GIS → `Map`
- Network Explorer → `RadioTower`
- Gateway Placement → `MapPinPlus`
- Households → `Users`
- Billing → `ReceiptIndianRupee`
- AI Analysis → `BrainCircuit`
- Alarms → `BellRing`
- Hydraulic Analysis → `Waves` or `Gauge`
- Settings → `Settings`
- Integration → `Plug`
- Users & Roles → `ShieldCheck`
- Data / Telemetry → `Database`
- Meter → `Gauge`
- Gateway → `Radio`
- Signal → `Wifi`
- Battery → `BatteryMedium`

---

# 4. Login experience

The login screen must deliberately look like a member of the Cortex family.

## 4.1 Layout

Desktop:
- full viewport;
- approximately 50/50 split;
- left branded panel in deep navy;
- right authentication panel in white;
- form centered vertically with max-width ~480–520 px.

Mobile/tablet:
- collapse the left panel into a compact top brand block;
- keep the form first-class and easy to use.

## 4.2 Left brand panel

Top:
- Cortex-W icon/mark.
- `Cortex-W`
- `Water Intelligence`
- small pill: `A COGNECTO PRODUCT`

Hero copy:

**The Intelligence Layer for Water Networks.**

Supporting copy:

`Monitor water-meter connectivity, gateway health, consumer activity and network intelligence from one operational workspace.`

Four short capability rows with thin icons:

1. **Unified Water Operations**  
   `One view of meters, gateways, consumers, billing and network performance.`

2. **Network Observability**  
   `Know what is reporting, through which gateway, and where communication is degrading.`

3. **GIS Intelligence**  
   `Explore meter coverage and plan gateway placement directly on the network map.`

4. **AI-Assisted Analysis**  
   `Surface communication, device and hydraulic anomalies before they become operational issues.`

## 4.3 Authentication form

Title: `Sign in`  
Subtitle: `Enter your credentials to access Cortex-W`

Fields:
- Username / Email
- Password
- password show/hide icon
- Sign in button

Optional development-only demo strip:
- `Demo Auth: Admin | Operations | Billing`
- only show when `VITE_SHOW_DEMO_AUTH=true`.

Do not show demo auth in production.

Footer card:
`Need platform access? Contact your Cognecto administrator.`

## 4.4 Authentication behavior

- Mock mode: accept seed/demo roles from mock auth provider.
- API mode: call the real API login endpoint defined in the API contract section.
- Store the bearer token using the Cortex-family standard. If none exists, use in-memory + sessionStorage by default rather than permanent localStorage.
- On 401, clear auth state and return to login.
- Do not assume the login token is in the response body; the backend returns it in a response header.

---

# 5. Authenticated application shell

## 5.1 Sidebar

Fixed desktop sidebar, collapsible to icon-only.

Brand block:

**Cortex-W**  
`Water Intelligence`

Navigation groups:

### GLOBAL TOOLS
- Dashboard
- Command Center

### GIS
- Network Explorer
- Gateway Placement

### CONSUMER
- Households
- Billing

### AI ANALYSIS
- Alarms
- Hydraulic Analysis

### ADMIN
- Settings

Bottom:
- signed-in user avatar
- user name
- role
- sign-out icon

## 5.2 Top header

Left:
- `Cortex-W | <Current Page>`

Below or adjacent:
- `POWERED BY COGNECTO`

Right:
- optional site scope selector
- freshness timestamp
- `LIVE` / `SEED DATA` badge
- notifications icon
- user menu

Do not overload the top bar with all filters. Page-specific filters belong in a filter bar directly under the header.

## 5.3 Shared filter bar

Create a reusable `FilterBar` component.

Potential controls:
- Site
- Date range
- Gateway
- Meter
- Household
- Status
- Severity
- Search
- Reset

Filters vary by page. Do not render irrelevant controls.

---

# 6. Final information architecture and routes

Use route names that are stable and human-readable.

```text
/login

/app/dashboard
/app/command-center

/app/gis/network
/app/gis/gateway-placement

/app/consumer/households
/app/consumer/households/:householdId
/app/consumer/billing

/app/ai/alarms
/app/ai/hydraulic

/app/settings
/app/settings/integrations
/app/settings/users
/app/settings/general
```

Optional deep links:

```text
/app/command-center/gateways/:gatewayId
/app/command-center/meters/:meterId
/app/gis/network/meters/:assetId
/app/consumer/billing/:billId
/app/ai/alarms/:alarmId
```

A page refresh must preserve deep links. Do not recreate the old pattern where selected assets exist only in transient state.

---

# 7. Dashboard

## 7.1 Purpose

Dashboard is the executive/operations overview. It should answer “What is the state of the water deployment today?” without turning into a technical telemetry console.

Command Center is for data-flow/network diagnostics. Dashboard is for operational summary.

## 7.2 Page composition

Top filter row:
- Site / region
- Date
- optional comparison period
- refresh
- last updated

### Section A — Installation & Configuration

5 compact KPI cards modeled on the supplied water dashboard reference:

- Households Onboarded
- Meters Configured
- Households Mapped
- Installations Today
- Active / Reporting Meters

Each card:
- small colored icon container
- big number
- label
- short explanatory subtitle
- optional delta
- clicking card opens a relevant drill-down

Seed snapshot:
- Households Onboarded: `193,125`
- Meters Configured: `27,996`
- Households Mapped: `18,364`
- Meter Installations on 04 Sep 2026: `18`
- Latest telemetry records/meters in supplied 04 Sep raw seed: `2,532`

Do not present `2,532` as the permanent installed base. It is the number of unique meters/records in the supplied daily seed export.

### Section B — Water Supply Performance

Cards:
- Total Water Consumption
- Average Consumption per Active Meter
- Meters with No Supply / No Reporting
- Reverse Flow Events
- Valve Abnormal

Initial demo values:
- Total Water Consumption: `2,338.92 KL` from the supplied existing dashboard visual seed.
- Average Consumption per Active Meter: `0.9 KL` from the same visual seed.
- No Supply: when using the existing visual snapshot, `15,778`.
- When switching the demo date/source to the 04 Sep raw seed, do **not** derive consumption by summing `ForwardFlowL`; that field is a meter reading/flow field in the API DTO, not a valid daily-consumption total.
- Valve abnormal telemetry in raw 04 Sep seed: `1,010`.

### Section C — Network Availability

Four cards:
- Configured Gateways
- Gateways Reporting
- Reporting Meters
- Data Quality

Suggested seed:
- Configured Gateways: `18` from the existing gateway summary visual.
- Gateways represented in 04 Sep raw seed: `14`.
- Reporting meters in 04 Sep raw seed: `2,532`.
- Checksum OK in raw seed: `100%`.

Show a mini trend for reporting meters and gateway coverage.

### Section D — 7-day trends

Use simple line/area charts:
- reporting meters
- water consumption
- gateway count heard
- alarms opened

Allow clicking series to open Command Center or Alarms.

### Section E — Attention Required

Compact prioritized list:
- Gateway stopped reporting
- Meter silent
- Poor SNR
- Abnormal battery health
- Abnormal valve health
- Meter clock anomaly
- Consumer/meter mapping missing

Show:
- severity
- issue
- entity
- site
- age
- action link

### Section F — Geographic overview

Small map card:
- meters
- gateways
- alarm clusters
- optional DMA overlay

Button: `Open Network Explorer`.

---

# 8. Command Center

## 8.1 Purpose

This is the operational heart of Cortex-W for **data-flow availability**.

It must focus on:
- which gateway is sending data;
- how many meters are being heard;
- which meters are sending;
- when each entity was last seen;
- signal quality;
- device-health telemetry;
- gateway load;
- loss of reporting;
- path from meter → gateway → platform.

Do not dilute this screen with consumer billing or installation administration.

## 8.2 Visual structure

Recreate the density of the supplied Command Center reference but in light mode.

Top tabs:
- `Gateways`
- `Meters`
- `Telemetry`

Time controls:
- 1H
- 24H
- 7D
- custom

Right:
- `Updated <n>s ago`
- auto-refresh on/off
- refresh button

## 8.3 Summary KPI strip

Suggested KPIs:

1. **Gateways Reporting**
   - `14 / 18` in the combined current seed context.
   - green dot if healthy.

2. **Meters Reporting**
   - `2,532`
   - show `% of mapped` when denominator available.

3. **No Recent Data**
   - number of known meters older than freshness threshold.
   - derive from `meter-health` in API mode.

4. **Avg RSSI**
   - raw-seed average: `-89.5 dBm`.

5. **Avg SNR**
   - raw-seed average: `-11.5 dB`.

6. **Device Health Exceptions**
   - Battery abnormal `901`
   - Valve abnormal `1,010`
   - either show combined issue count carefully or split in hover; do not blindly sum as unique devices.

## 8.4 Gateway panel

Left-side scrollable gateway list similar to the model-status list in the command-center reference.

Each row:
- status dot
- friendly alias
- gateway ID
- meters heard in selected period
- latest data time
- average RSSI
- average SNR
- warning badge if count collapsed versus baseline

Click a gateway → right-side details update without leaving page.

Gateway status semantics:

- Do not claim physical hardware power state unless an API provides a gateway heartbeat.
- In Cortex-W, label status as:
  - `Reporting`
  - `No recent meter traffic`
  - `No data in selected period`
- Derive from meter/gateway telemetry receipts.
- Default meter freshness threshold: **36 hours**, matching the current backend's meter-health behavior.
- Make the threshold configurable for the UI but do not change backend semantics silently.

## 8.5 Gateway activity chart

Chart:
- x-axis time
- y-axis active/unique meters or records heard
- optional comparison line with previous period
- selected gateway highlighted
- click/brush to filter telemetry feed

For 7D:
- show daily active-meter count.

For 24H:
- if only daily API data is available, make that limitation explicit and do not fabricate hourly API values. Mock mode may demonstrate hourly behavior with seed data.

## 8.6 Gateway load distribution

Horizontal bar chart:
- one bar per gateway
- number of unique meters heard
- sort descending
- warning marker for low count or sharp drop
- use per-gateway overlap/redundancy when available

## 8.7 Meter feed table

Columns:
- Meter ID
- Household ID
- Gateway ID
- Last Seen / Decoded At
- Current Reading
- Battery V
- Battery Health
- Valve Health
- RSSI
- SNR
- Valve State
- Checksum
- Frequency
- FCnt
- Data Status

Filters:
- Gateway
- meter search
- household search
- active/silent
- battery health
- valve health
- RSSI band
- SNR band

Rows should open a right-side meter drawer.

## 8.8 Meter detail drawer

Header:
- Meter ID
- Household ID
- site
- status chip
- last seen

Sections:
1. **Connectivity**
   - current gateway
   - RSSI
   - SNR
   - frequency
   - fPort
   - fCnt
   - confirmed
   - ADR

2. **Device**
   - battery voltage
   - battery health
   - valve state
   - valve health
   - checksum
   - status byte

3. **Reading**
   - current reading
   - forward flow
   - reverse flow
   - meter timestamp
   - decoded timestamp

4. **Data lineage**
   - Meter → Gateway → Application → Tenant
   - DevEUI / DevAddr
   - device profile

5. **Actions**
   - Locate on map
   - Open household
   - View raw telemetry
   - Create/view alarm

## 8.9 Live telemetry feed

Bottom section, similar to the supplied command-center live feed.

Columns:
- Time
- Status
- Meter ID
- Gateway
- Event / Health
- RSSI/SNR
- Site

Filter chips:
- All
- Healthy
- Warning
- Critical

Use virtualization if the feed becomes large.

---

# 9. GIS — Network Explorer

## 9.1 Purpose

Provide one operational map for understanding meter distribution, gateway coverage and the relationship between silent meters and gateway reach.

## 9.2 Full-screen map layout

Top floating toolbar:
- back
- page title
- search meter / household
- gateway selector
- radius selector
- Map / Satellite
- `Problems only`
- optional fullscreen
- view toggle: Map | Table | Performance

Main area:
- Google Map
- map should occupy maximum available viewport height.

## 9.3 Map layers

Layer selector:
- Meters
- Gateways
- Coverage circles
- Active on selected gateway
- Active on another gateway
- Not reporting
- Household-mapping missing
- Alarms
- DMA boundaries when available

## 9.4 Meter symbols

Use small circles rather than large pins at medium/high density.

Suggested status:
- green: active/reporting through selected gateway
- light green: active through another gateway
- red: not active / problem
- muted gray: unknown
- amber: warning / weak communication

Cluster at lower zoom.

When zoomed in, show individual meters.

## 9.5 Gateway symbols

Use a clear blue `RadioTower` / Wi-Fi pin.
Draw configured radius as a thin circle.

Selected gateway:
- stronger outline
- its coverage radius visible
- side panel populated

## 9.6 Map interaction

Click meter:
- open popover/drawer with:
  - Meter ID
  - household ID
  - latest reading
  - last seen
  - current/last gateway
  - RSSI/SNR
  - battery/valve health
  - coordinates
  - nearest gateways and distance when available
  - `Open in Command Center`

Click gateway:
- select gateway
- show:
  - meters inside radius
  - meters reporting to this gateway
  - meters reporting to another gateway
  - silent meters
  - average/maximum distance
  - recent performance

## 9.7 Table view

Same data as map but optimized for export/filtering.

Columns:
- Meter
- Household
- Lat
- Lon
- Gateway
- Distance
- Last Seen
- RSSI
- SNR
- Health
- Coverage status

## 9.8 Performance view

Gateway performance chart:
- gateway
- date range
- active meter count by day
- comparison to previous period
- highlight sudden fall in active meters

---

# 10. GIS — Gateway Placement

## 10.1 Purpose

Planning tool for deciding where additional gateways should be installed.

## 10.2 Top control bar

- Site
- Number of gateways
- Coverage radius
- Generate
- Reset

Default demo:
- Site: `BHUBANESWAR`
- Gateway count: `7`
- Radius: `500 m`

## 10.3 Map content

- all meter locations
- existing gateways
- recommended gateways
- coverage circles
- covered meters
- uncovered meters
- optional service-area polygon

## 10.4 Right recommendation panel

One card per recommended gateway.

Card:
- recommendation number
- assigned meters
- coverage %
- covered/assigned
- average distance
- max distance
- nearest existing gateway + distance
- coordinates
- button: `Focus on map`
- button: `Copy coordinates`

At bottom:
- total meters
- total covered
- overall coverage
- excluded locations

Use the visual pattern of the supplied gateway-placement screenshot, but align styling with Cortex-W.

## 10.5 Before/after comparison

Above the map or in a compact strip:
- current gateway coverage %
- recommended coverage %
- incremental meters covered
- estimated redundant coverage
- selected radius

---

# 11. Consumer — Households

## 11.1 List screen

Top:
- `Households`
- search
- site filter
- status filter
- `New Household`
- export if required

Table columns:
- Household ID
- Name
- Address
- Site
- Ward
- DMA
- Mobile
- Registration Date
- Meter ID
- Last Meter Seen
- Status
- Actions

Actions:
- View
- Edit
- Locate
- Meter history
- Delete, only with confirmation and adequate permission

Do **not** reproduce the old behavior where delete has no confirmation.

## 11.2 Household detail

Tabs:

### Overview
- Household ID
- consumer name
- guardian
- address
- pin
- mobile
- email
- site
- zone
- ward
- DMA
- registration
- status

### Meter
- current meter
- IMEI / meter number
- current reading
- last seen
- gateway
- installation location
- battery/valve health

### Meter History
- old meter
- old reading
- new meter
- new reading
- replacement date
- reason/status
- installer
- comments
- attachments

### Consumption
- selected range
- daily reading
- consumption
- start/end reading
- summary

### Billing
- bills for household
- amount
- due date
- status
- open bill

### Documents
- documents and installation evidence.

## 11.3 Household quick lookup

Add a global consumer-support lookup capable of searching by:
- Household / Consumer ID
- Meter number

Show:
- consumer identity
- current and replaced meters
- replacement lineage
- daily readings
- total consumption in selected range

This should open as a page/drawer from the Household screen and can also be exposed from global search.

---

# 12. Consumer — Billing

## 12.1 Billing list

Top:
- search Household ID / Bill ID
- site
- date range
- billing status
- `Generate Bill`
- `Manage Slabs`

Table:
- Bill ID
- Household Name
- Household ID
- Meter ID
- Bill Date
- Due Date
- Amount
- Consumption
- Region/Site
- Status
- Actions

Status chips:
- Paid
- Pending
- Overdue
- Cancelled if supported by domain

Actions:
- View
- Download PDF
- Delete with confirmation if allowed

## 12.2 Generate Bill modal

Flow:
1. search meter / IMEI
2. resolve household and site
3. show latest bill
4. show previous reading
5. select start/end date
6. enter/read current reading
7. show calculated consumption
8. submit to server for pricing
9. server returns charges and amount
10. preview
11. save

Important: the frontend must not invent pricing. Pricing comes from the billing create API.

## 12.3 Billing slab management

Site selector.

Two sections:
- Consumption Slabs
- Additional Charges

Consumption slab:
- name
- min KL
- max KL
- rate ₹/KL
- fixed charge
- status

Additional charge:
- name
- percentage
- status

Use inline edit or modal, but maintain clear validation.

## 12.4 Bill viewer

A4 printable view:
- utility header
- bill ID
- household
- address
- meter ID
- billing period
- previous/current reading
- consumption
- itemized charges
- amount due
- due date
- status

---

# 13. AI Analysis — Alarms

## 13.1 Purpose

AI Analysis should convert raw operational exceptions into prioritized operator actions.

The first build may use seed-derived rules. Keep the engine interface pluggable so later server-side AI/alarm APIs can replace client mock logic.

## 13.2 Alarm categories

Communication:
- Meter silent / no recent data
- Gateway no recent meter traffic
- Gateway active-meter count collapse
- Weak RSSI
- Poor SNR
- Multi-gateway instability / excessive handoff

Device:
- Battery health abnormal
- Low battery voltage
- Valve health abnormal
- Valve unexpectedly closed
- Checksum error
- Device/meter timestamp anomaly

Consumption:
- Reverse flow
- continuous flow / possible leak
- unusually high consumption
- zero consumption
- sudden consumption drop
- consumption spike

Data quality:
- household not mapped
- invalid coordinates
- missing gateway ID
- meter clock mismatch
- impossible/malformed timestamp

Hydraulic:
- high apparent loss
- minimum-night-flow anomaly
- pressure anomaly
- suspected burst
- supply continuity anomaly
- DMA imbalance

## 13.3 Alarm list

KPI row:
- Critical
- High
- Medium
- Low
- Open
- Acknowledged

Filters:
- Site
- DMA
- category
- severity
- state
- gateway
- meter
- date

Columns:
- Severity
- Alarm
- Entity
- Site / DMA
- Evidence
- First Seen
- Last Seen
- Status
- Owner

## 13.4 Alarm detail

Drawer/page:
- summary
- AI/rule explanation
- evidence
- telemetry chart
- entity context
- map
- consumer if meter-linked
- related alarms
- timeline
- comments
- acknowledge
- assign
- resolve

## 13.5 Seed alarm counts from 04 Sep telemetry

The supplied raw seed can drive realistic demo cards:

- Battery Health = Abnormal: `901 / 2,532` (`35.6%`)
- Valve Health = Abnormal: `1,010 / 2,532` (`39.9%`)
- Checksum Status = OK: `2,532 / 2,532`
- RSSI <= -100 dBm: `29`
- RSSI < -95 dBm: `453`
- SNR < -20 dB: `158`
- SNR < -15 dB: `956`
- Meters with no Household ID in raw rows: `328`
- Meter timestamp parse-invalid: `83`
- Meter timestamp parseable but more than 7 days away from decoded timestamp: `2,421`

Treat the timestamp figures as **seed-data anomalies**, not as proof of a production business rule.

---

# 14. AI Analysis — Hydraulic Analysis

## 14.1 Important data-contract rule

The supplied API reference does not define a complete hydraulic/pressure/DMA analytics API.

Therefore:
- build the UX and domain model now;
- run this module in seed/mock mode initially;
- do not invent a production endpoint;
- isolate it behind `HydraulicRepository`;
- switch to API mode only after an explicit backend contract exists.

## 14.2 Page structure

Top filters:
- Site
- DMA
- date range
- comparison period

KPI row:
- Input Volume
- Billed / Metered Consumption
- Apparent Loss
- Estimated Real Loss
- Minimum Night Flow
- Average Pressure
- Continuity

## 14.3 Water balance panel

Water-balance waterfall or stacked chart:
- System Input
- Authorized Consumption
- Metered Consumption
- Apparent Loss
- Real Loss / Unaccounted Water

## 14.4 Demand profile

24-hour curve:
- aggregate flow
- minimum night flow window
- anomaly markers
- previous-day baseline

## 14.5 DMA ranking

Table:
- DMA
- input
- consumption
- water balance %
- minimum night flow
- pressure
- active meters
- silent meters
- anomaly score

Click DMA → drill down.

## 14.6 Hydraulic anomaly map

Map:
- DMA polygons
- color by loss/anomaly
- bursts
- low-pressure points
- high continuous flow clusters
- meter silence clusters

## 14.7 Demo DMA seed

Because no hydraulic API is defined, use clearly synthetic values:

```json
[
  {
    "dma": "DMA-01",
    "inputKL": 812.4,
    "meteredKL": 643.8,
    "waterBalanceLossPct": 20.8,
    "minimumNightFlowKLH": 18.7,
    "avgPressureBar": 2.4,
    "continuityHours": 18.5,
    "anomalyScore": 68
  },
  {
    "dma": "DMA-02",
    "inputKL": 694.1,
    "meteredKL": 610.6,
    "waterBalanceLossPct": 12.0,
    "minimumNightFlowKLH": 9.2,
    "avgPressureBar": 2.8,
    "continuityHours": 21.2,
    "anomalyScore": 33
  },
  {
    "dma": "DMA-03",
    "inputKL": 1004.7,
    "meteredKL": 708.3,
    "waterBalanceLossPct": 29.5,
    "minimumNightFlowKLH": 27.4,
    "avgPressureBar": 1.9,
    "continuityHours": 16.0,
    "anomalyScore": 84
  }
]
```

A visible `DEMO HYDRAULIC DATA` label must be shown in seed mode.

---

# 15. Settings

Settings should be role-protected.

## 15.1 Integrations

### Google Maps

Fields:
- integration status
- masked API key / config source
- allowed map style
- default map center
- default zoom
- geocoding enabled

Security:
- do not commit the key to source control;
- prefer environment/runtime config;
- restrict Google key by HTTP referrer and required APIs;
- never expose backend secrets.

If no backend settings API exists, edits are local/dev-only in seed mode. Do not imply they have been persisted centrally.

### API connectivity

Read-only diagnostic card:
- API base URL
- Data REST URL
- auth state
- backend reachable
- last successful request
- app data mode

## 15.2 Users & Roles

Build the UX shell:
- users
- role
- sites
- modules/permissions
- status
- last login

The supplied water API reference does not define complete user-management CRUD. Keep writes disabled/mock-only until a contract is provided.

Use available auth module/permission endpoints only for module visibility/role access where appropriate.

## 15.3 General

- default site
- default date range
- timezone display
- unit display (KL/L)
- meter freshness threshold shown in UI
- table page size
- map defaults
- auto refresh
- dev-only data mode control

---

# 16. Cross-product global search

Add a compact global search in the shell or Command Center.

Search can identify:
- Meter ID
- Household ID
- Consumer name
- Gateway ID
- Bill ID

Results grouped by type.

Click:
- Meter → meter drawer / Command Center
- Household → household detail
- Gateway → Command Center gateway
- Bill → bill viewer

Do not make global search depend on one giant endpoint. Use per-domain repositories with debounced parallel queries.

---

# 17. Seed-data strategy

## 17.1 Data modes

Implement exactly three data modes:

```ts
export type DataMode = 'seed' | 'api' | 'hybrid';
```

### `seed`
- no backend required;
- all screens render from realistic local seed repositories;
- default for first AntiGravity visual build.

### `api`
- all API-backed modules call the real backend;
- no silent mock fallback;
- failures are shown honestly.

### `hybrid`
- development/demo only;
- use real APIs where configured;
- use seed repositories only for modules with no backend contract yet, e.g. initial Hydraulic Analysis;
- visually indicate hybrid mode to developers/admins.

Environment:

```env
VITE_DATA_MODE=seed
VITE_API_BASE_URL=http://localhost:8080/api
VITE_DATA_REST_URL=http://localhost:8080
VITE_GOOGLE_MAPS_API_KEY=
VITE_SHOW_DEMO_AUTH=true
VITE_ENABLE_HYDRAULIC_SEED=true
```

Prefer runtime configuration if the Cortex family already has it, so the same Docker image can move between environments without rebuilding.

## 17.2 Repository pattern

Example:

```ts
interface GatewayRepository {
  getGatewaySummary(filters: GatewaySummaryFilter): Promise<GatewaySummary>;
  getMeterHealth(filters: MeterHealthFilter): Promise<MeterHealth[]>;
  getGatewayPerformance(filters: GatewayPerformanceFilter): Promise<GatewayPerformance[]>;
}

class ApiGatewayRepository implements GatewayRepository {}
class SeedGatewayRepository implements GatewayRepository {}
```

Factory:

```ts
createRepositories(config.dataMode)
```

Pages consume the interface, never a concrete seed service.

## 17.3 Seed provenance tags

Every seed dataset should declare:

```ts
type SeedProvenance =
  | 'RAW_EXPORT_2026_09_04'
  | 'EXISTING_UI_REFERENCE'
  | 'SYNTHETIC_DEMO';
```

Never mix synthetic hydraulic values with raw telemetry without provenance.

---

# 18. Raw telemetry seed snapshot — 04 Sep 2026

Source workbook contains `2,532` data rows and `34` telemetry columns.

Observed in the seed:
- unique meter IDs: `2,532`
- unique DevEUIs: `2,532`
- unique Gateway IDs: `14`
- unique non-empty Household IDs: `2,202`
- meter rows linked to a Household ID: `2,204`
- meter rows without Household ID: `328`
- site: `BHUBANESWAR`
- site ID: `6394`
- battery status OK: `2,532`
- battery health normal: `1,631`
- battery health abnormal: `901`
- valve health normal: `1,522`
- valve health abnormal: `1,010`
- valve closed: `1,219`
- valve open: `1,313`
- checksum OK: `2,532`
- battery voltage 3.7V: `2,002`
- battery voltage 3.6V: `530`
- confirmed packets flag: `true` on all supplied rows
- ADR flag: `false` on all supplied rows
- average RSSI: `-89.5 dBm`
- median RSSI: `-90 dBm`
- RSSI min/max: `-103 / -56 dBm`
- average SNR: `-11.5 dB`
- median SNR: `-13 dB`
- SNR min/max: `-23.8 / 9.2 dB`

Do not infer that every production meter sends exactly one row per day merely because this export has one row per unique meter.

## 18.1 Observed gateway seed

| Gateway ID | Meters observed in 04-Sep seed | Linked meters | Avg RSSI dBm | Avg SNR dB | Battery abnormal | Valve abnormal | Latest decoded-at (UTC) |
|---|---:|---:|---:|---:|---:|---:|---|
| `506f9800000002a5` | 738 | 610 | -88.6 | -8.2 | 277 | 285 | `2026-09-04T18:15:11.706179+00:00` |
| `506f9800000002a6` | 403 | 254 | -89.7 | -11.5 | 160 | 162 | `2026-09-04T14:30:45.586050+00:00` |
| `506f98000000029a` | 280 | 272 | -86.7 | -9.5 | 91 | 101 | `2026-09-04T17:53:04.073396+00:00` |
| `506f980000000262` | 251 | 240 | -94.4 | -16.9 | 101 | 117 | `2026-09-04T17:27:54.035774+00:00` |
| `506f980000000340` | 155 | 139 | -90.9 | -15.1 | 53 | 65 | `2026-09-04T07:07:09.786422+00:00` |
| `506f98000000029e` | 153 | 153 | -86.2 | -12.1 | 57 | 59 | `2026-09-04T16:10:02.319930+00:00` |
| `506f980000000261` | 149 | 143 | -97.3 | -16.5 | 42 | 71 | `2026-09-04T06:42:01.779056+00:00` |
| `506f9800000002a8` | 134 | 129 | -87.1 | -12.6 | 41 | 53 | `2026-09-04T10:56:13.093114+00:00` |
| `506f980000000299` | 130 | 130 | -85.0 | -9.7 | 34 | 42 | `2026-09-04T06:46:52.495037+00:00` |
| `506f9800000002a3` | 107 | 105 | -91.3 | -14.1 | 29 | 38 | `2026-09-04T06:39:12.384423+00:00` |
| `506f98000000029d` | 24 | 21 | -85.8 | -15.4 | 12 | 13 | `2026-09-04T06:30:08.125839+00:00` |
| `506f980000000341` | 5 | 5 | -89.2 | -18.6 | 2 | 2 | `2026-09-04T05:43:36.655979+00:00` |
| `506f980000000346` | 2 | 2 | -81.0 | -18.1 | 2 | 2 | `2026-09-04T04:51:37.449145+00:00` |
| `506f980000000297` | 1 | 1 | -90.0 | -12.5 | 0 | 0 | `2026-09-04T04:02:39.981281+00:00` |

## 18.2 Representative meter rows

| Meter ID | Household ID | Gateway | Reading / ForwardFlowL | Battery | Battery health | Valve health | RSSI | SNR | Valve | DecodedAt | MeterTimestamp |
|---|---|---|---:|---:|---|---|---:|---:|---|---|---|
| `0024004061` | `WS/BMC/1520247` | `506f9800000002a3` | 229.97 | 3.6V | Abnormal | Abnormal | -91 | -17.8 | Closed | `2026-09-04T03:16:27.388821272Z` | `2024-08-04 09:01:00` |
| `0024004067` | `WS/BMC/1490971` | `506f980000000340` | 27.93 | 3.6V | Normal | Abnormal | -91 | -9.8 | Open | `2026-09-04T05:45:13.412918942Z` | `2029-11-04 09:01:01` |
| `0024004068` | `WS/BMC/1488809` | `506f9800000002a8` | 46.12 | 3.6V | Abnormal | Abnormal | -91 | -18.8 | Closed | `2026-09-04T06:10:13.956310598Z` | `2074-11-04 09:01:00` |
| `0024004081` | `WS/BMC/2500692` | `506f9800000002a5` | 38.63 | 3.6V | Normal | Normal | -87 | -14.0 | Closed | `2026-09-04T03:21:43.885584015Z` | `2012-08-04 09:01:00` |
| `0024004083` | `WS/BMC/2490326` | `506f9800000002a3` | 0.07 | 3.6V | Normal | Abnormal | -91 | -17.8 | Open | `2026-09-04T04:09:55.748170315Z` | `20142-09-04 09:59:04` |
| `0024004086` | `WS/BMC/1446931` | `506f980000000261` | 58.70 | 3.6V | Normal | Normal | -97 | -22.0 | Open | `2026-09-04T05:25:25.243328683Z` | `2017-10-04 09:01:00` |
| `0024004092` | `WS/BMC/1490019` | `506f980000000340` | 26.86 | 3.6V | Abnormal | Abnormal | -92 | -9.8 | Closed | `2026-09-04T03:46:36.285197246Z` | `2030-09-04 09:01:00` |
| `0024004094` | `WS/BMC/2379686` | `506f980000000340` | 612.35 | 3.6V | Normal | Normal | -93 | -19.5 | Closed | `2026-09-04T04:34:15.693351200Z` | `2024-10-04 09:01:00` |
| `0024004099` | `WS/BMC/1507661` | `506f980000000299` | 172.09 | 3.6V | Abnormal | Abnormal | -87 | -17.0 | Closed | `2026-09-04T06:37:45.777374065Z` | `2023-12-04 09:01:01` |
| `0024004110` | `WS/BMC/2501194` | `506f98000000029e` | 1.66 | 3.6V | Normal | Abnormal | -90 | -13.2 | Open | `2026-09-04T02:36:19.260165715Z` | `2044-08-04 09:59:04` |

The intentionally odd `MeterTimestamp` values are useful for the Data Quality / Alarm UX. Do not silently "fix" them in the seed. The decoded timestamp is the more reliable arrival timestamp for UI freshness.

---

# 19. Command Center seed transformations

Build derived mock selectors rather than duplicating data.

Examples:

```ts
selectReportingMeters()
selectMetersByGateway(gatewayId)
selectGatewayLastSeen(gatewayId)
selectGatewayAverageRssi(gatewayId)
selectGatewayAverageSnr(gatewayId)
selectBatteryExceptions()
selectValveExceptions()
selectWeakSignalMeters()
selectUnmappedMeters()
selectTimestampAnomalies()
```

Suggested radio bands for demo visualization only:

RSSI:
- >= -80: strong
- -81 to -90: good
- -91 to -100: weak
- < -100: very weak

SNR:
- >= 5: excellent
- 0 to < 5: good
- -10 to < 0: marginal
- < -10: poor

Do not hard-code these display bands into backend assumptions. Keep thresholds in frontend config.

---

# 20. API integration contract

**Critical:** The API contract below is the only part of this product specification derived from `WATER_MODULE_REFERENCE.md`. It exists to connect the new UX to the unchanged backend. It must not be used to restore the old report-driven information architecture.

## 20.1 Backend roots

The backend uses two roots:

```text
API base:
http://localhost:8080/api

Data REST base:
http://localhost:8080
```

Recommended environment:

```env
VITE_API_BASE_URL=http://localhost:8080/api
VITE_DATA_REST_URL=http://localhost:8080
```

Use `VITE_API_BASE_URL` for nearly all API calls.

Use `VITE_DATA_REST_URL` for Spring Data REST resources such as:
- `/households/{id}`
- `/bills/{id}`
- `/billingSlabs/{id}`
- `/geofences/{id}`
- `/assets/{id}`
- `/householdDocuments/{id}`
- `/assetHouseholdImeiHistories/{id}`

## 20.2 Authentication

- `POST /api/auth/login`
- JWT is returned in a **response header**, not assumed to be in the body.
- Read token from `Authorization` or `Jwt-Token`.
- Send every protected request with:

```http
Authorization: Bearer <token>
```

- backend session policy is stateless;
- no cookie session is required;
- missing/expired JWT returns 401.

The supplied API reference does **not** specify the exact login request JSON shape. Do not invent a permanent DTO in shared API types. Put login payload mapping behind `authAdapter.ts` and align it to the actual backend request observed in the existing deployment/repository.

## 20.3 Permissions

Water-relevant backend permission names:

```text
Water_Dashboard : READ
Household       : READ, WRITE
Billing         : READ, WRITE
Map             : READ, WRITE, DELETE
```

Permissions can drive:
- route visibility
- edit buttons
- delete buttons
- settings actions

## 20.4 Response shape

There is generally **no universal response envelope**.

Expect:
- Spring `Page<T>` at top level,
- arrays at top level,
- maps at top level,
- DTO objects directly.

Do not write a generic `response.data.data` assumption.

Some household endpoints return their own `ResponseDTO` as the payload. Handle per endpoint.

## 20.5 Error handling

Support:
- 400 bad request
- 401 unauthorized
- 403 permission denied
- 404 not found
- 405 method mismatch
- 500 server error

Important:
- some backend messages arrive uppercase;
- do not show raw backend exception text directly to non-technical users;
- 204 can mean "not found" for some water flows, not successful empty mutation;
- validation and data-integrity errors can use alternate bodies.

Implement a normalization function:

```ts
normalizeApiError(error): UiApiError
```

---

# 21. API DTO foundations

## 21.1 Pagination

```ts
export interface PaginationReqDTO {
  page: number;          // 0-based
  size: number;
  sortBy?: string;       // "col:ASC::col2:DESC"
  search?: string;
  filters?: string[];
  query?: string;
  siteIds?: number[];
}

export interface SortCriteria {
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
}

export interface CursorPaginationReqDTO {
  size: number;
  cursor: string | null;
  query?: string;
  siteIds?: number[];
  sorts?: SortCriteria[];
}

export interface CursorPaginationResDTO<T> {
  content: T[];
  nextCursor: string | null;
  hasMore: boolean;
  estimatedTotal: number;
}
```

## 21.2 Spring Page

```ts
export interface SpringPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
  numberOfElements: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}
```

Keep extra pageable/sort fields optional if needed.

## 21.3 Meter telemetry DTO

Use **one** optional-field API type, because the backend reuses the same DTO across multiple endpoints.

```ts
export interface MeterWiseConsumptionDTO {
  meterId?: string;
  date?: string;
  consumption?: number;
  currentReading?: number;
  reverseFlow?: number;
  forwardFlowL?: number;
  batteryVoltage?: number;
  batteryStatus?: string;
  batteryHealth?: string;
  signalStrength?: number;
  signalQuality?: number;
  rssi?: number;
  snr?: number;
  valveStatus?: boolean;
  valveClosed?: boolean;
  valveHealth?: string;
  checksumStatus?: string;
  statusByte?: number;
  meterTimestamp?: string;
  decodedAt?: string;

  startReading?: number;
  endReading?: number;
  avgConsumption?: number;

  applicationId?: string;
  applicationName?: string;
  deviceProfileId?: string;
  deviceProfileName?: string;
  deviceName?: string;
  devEui?: string;
  devAddr?: string;
  measureName?: string;
  fPort?: number;
  fCnt?: number;
  dr?: number;
  frequency?: number;
  confirmed?: boolean;
  adr?: boolean;
  activeMeters?: number;
  assetId?: string;
  householdId?: string;
  tenantId?: string;
  tenantName?: string;
  siteId?: string;
  siteName?: string;
  gatewayId?: string;
  lastSeen?: string;
}
```

Use backend field `reverseFlow`, **not** `reverseFlowL`.

## 21.4 Household DTO

```ts
export interface HouseholdDTO {
  id: number;
  customId?: string;
  name: string;
  location: string;
  pinCode: string;
  status: string;
  registrationDate: string;
  countryCode: string;
  mobile: string;
  siteId: number;
  assetId?: number;
  email?: string;
  siteName?: string;
  createdBy?: string;
  zone?: string;
  locality?: string;
  ward?: string;
  aadharNo?: string;
  dma?: string;
  guardianName?: string;
  guardianRelation?: 'S/O' | 'D/O' | 'W/O' | 'C/O';
  attachments?: AttachmentDTO[];
}
```

## 21.5 Attachment DTO

```ts
export interface AttachmentDTO {
  documentId?: number;
  name: string;
  category: string;
  expirationDate?: string;
  s3BucketURL: string;
  uploadDateTime: string;
  deleteDateTime?: string;
  imageBytes?: string;
}
```

## 21.6 Meter-health DTO

```ts
export interface MeterHealthDTO {
  assetId: number;
  meterId: string;
  householdId: string;
  gatewayId: string;
  lastSeenDate: string;
  decodedAt: string;
  rssi: number;
  batteryStatus: string;
  timeZone: string;
}

export interface GatewayPerformanceDTO {
  gatewayId: string;
  date: string;
  activeMeterCount: number;
}
```

## 21.7 Gateway summary DTO

```ts
export interface GatewayMeterSummaryDTO {
  totalUniqueMeters: number;
  gatewayCount: number;
  metersOnMultipleGateways: number;
  perGateway: Array<{
    gatewayId: string;
    uniqueMeterCount: number;
  }>;
}
```

## 21.8 Map / gateway DTO

```ts
export interface SensorRawDataDTO {
  timestamp: string;
  latitude: number;
  longitude: number;
  vehicleStatus: string;
  altitude: string;
  siteId: number;
}

export interface GeofenceDTO {
  id?: number;
  name: string;
  address?: string;
  radius?: number;
  type: string;
  color?: string;
  siteId: number;
  assetId?: number;
  geofenceTimings?: Array<{
    id?: number;
    type: string;
    startTimestamp: string;
    endTimestamp: string;
  }>;
  geofenceCoordinates: Array<{
    latitude: number;
    longitude: number;
  }>;
  assetList?: number[];
  isDisabled: boolean;
  outAlertEnabled: boolean;
}
```

A geofence with non-null radius is treated as a gateway in the existing backend model.

---

# 22. API mapping — Dashboard

Use these APIs as data sources for the new Dashboard where appropriate.

## 22.1 Water summary

```http
POST /api/module/water-summary
```

Body:

```json
{
  "propertyNameList": ["Total Households", "Active Meters", "Water Consumption", "Average Consumption"],
  "startDate": "2026-09-01T00:00:00.000+05:30",
  "endDate": "2026-09-30T23:59:59.999+05:30"
}
```

Response:

```ts
{
  [propertyName: string]: {
    value: string;
    lastUpdated: string;
  };
}
```

Supported property names:
- `Total Households`
- `Active Meters`
- `Water Consumption`
- `Average Consumption`

Dates are ISO-8601 zoned/offset timestamps, not plain dates.

## 22.2 Daily metric trend

```http
POST /api/module/water-daily-data
```

Body:

```json
{
  "propertyNameList": ["Active Meters"],
  "startDate": "2026-09-01T00:00:00.000+05:30",
  "endDate": "2026-09-30T23:59:59.999+05:30"
}
```

Response is a bare map:

```json
{
  "01 Sep": 2431,
  "02 Sep": 2490,
  "03 Sep": 2516
}
```

## 22.3 Executive summary

```http
POST /api/water/executive-summary?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
```

Body: `PaginationReqDTO`

Useful fields:
- householdsOnboarded
- metersConfigured
- householdsMapped
- meterReplacementsYesterday
- criticalAlerts
- openMaintenanceRequests
- closedMaintenanceRequests
- topAlertTypes
- alerts
- meterReplacements
- region
- fromDate
- toDate

Do not rebuild the old executive-summary page. Use the endpoint only as a source for the new dashboard.

---

# 23. API mapping — Command Center

## 23.1 Gateway-wise unique meter summary

```http
GET /api/water/gateway-meter-summary?siteIds=1,2,3&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
```

Response:

```ts
{
  totalUniqueMeters: number;
  gatewayCount: number;
  metersOnMultipleGateways: number;
  perGateway: {
    gatewayId: string;
    uniqueMeterCount: number;
  }[];
}
```

Important: `siteIds` is a **comma-joined string** for this endpoint.

## 23.2 Meter health

```http
GET /api/water/meter-health?siteIds=1&siteIds=2
```

Returns `MeterHealthDTO[]`.

Use for:
- meter roster
- freshness
- last gateway
- RSSI
- battery status

The existing health logic treats active freshness as last **36 hours**.

## 23.3 Gateway performance

```http
GET /api/water/gateway-performance?siteIds=1&siteIds=2&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
```

Returns:

```ts
GatewayPerformanceDTO[]
```

`fromDate` and `toDate` are required.

## 23.4 Latest meter status

```http
POST /api/water/latest-meter-status/page
```

Body: `PaginationReqDTO`

Returns: `Page<MeterWiseConsumptionDTO>`

Use for:
- latest state per meter
- Last Seen
- meter ID
- household ID
- site
- end reading

No date picker is needed for this call.

## 23.5 Raw telemetry

```http
POST /api/water/raw-data/cursor?fromDate=YYYY-MM-DD&endDate=YYYY-MM-DD&rawReport=true
```

Body: `CursorPaginationReqDTO`

Returns:

```ts
CursorPaginationResDTO<MeterWiseConsumptionDTO>
```

Use for the Telemetry tab and diagnostic drawer.

Important: this endpoint uses `endDate`, not `toDate`.

## 23.6 Raw telemetry export

```http
POST /api/water/raw-data/export?siteId=<long>&date=YYYY-MM-DD
```

Body:

```json
{}
```

Response:
- XLSX bytes
- one site + one day

Do not make the UI pretend this export respects arbitrary grid filters if the backend does not.

---

# 24. API mapping — GIS

## 24.1 Asset locations

```http
GET /api/map/asset-locations
```

Returns:

```ts
{ [assetId: string]: SensorRawDataDTO }
```

This endpoint can include non-water assets. For water map views, intersect with meter-health data on `assetId`.

Drop invalid coordinates such as `(0,0)`.

## 24.2 Gateways / geofences

```http
GET /api/map/geofence
```

Returns `GeofenceDTO[]`.

Treat records with non-null `radius` as gateways.

## 24.3 Latest one-meter telemetry

```http
GET /api/water/latest-meter-data/{assetId}
```

Returns `MeterWiseConsumptionDTO`.

## 24.4 Asset detail

```http
GET /api/asset/{assetId}
```

Use for asset name and household association.

## 24.5 Gateway placement

```http
POST /api/map/gateway-placement/compute
```

Body:

```json
{
  "siteId": 6394,
  "gatewayCount": 7,
  "coverageRadiusM": 500
}
```

Response:

```ts
{
  siteId: number;
  totalMeters: number;
  totalMetersCovered: number;
  excludedMeterCount: number;
  excludedAssetIds: number[];
  gateways: Array<{
    gatewayNumber: number;
    latitude: number;
    longitude: number;
    metersAssigned: number;
    metersCoveredCount: number;
    avgDistanceM: number;
    maxDistanceM: number;
    coverageScore: number;
    assignedAssetIds: number[];
  }>;
}
```

## 24.6 Gateway performance map/chart

Reuse:

```http
GET /api/water/gateway-performance
GET /api/water/meter-health
GET /api/water/meter-image/{assetId}
```

Do not create redundant network APIs in the frontend.

---

# 25. API mapping — Households

## 25.1 List

```http
POST /api/household/page
```

Body: `PaginationReqDTO`

Returns: `Page<HouseholdDTO>`.

## 25.2 Create

```http
POST /api/household
```

Body: `HouseholdDTO`.

## 25.3 Detail

```http
GET /api/household/{id}
```

## 25.4 Update

```http
PATCH {dataRest}/households/{id}
```

Important relation behavior:
- relations are URI references;
- household update uses singular `site/{id}`.

Example:

```json
{
  "name": "Updated Name",
  "site": "http://localhost:8080/site/7"
}
```

Do not normalize this to plural based on other endpoints.

## 25.5 Delete

```http
DELETE /api/household/{id}
```

Always add a UI confirmation.

## 25.6 Meter history

```http
POST /api/household/imei-history
POST /api/household/imei-history/update
GET  /api/household/imei-history?householdId=<id>
GET  /api/household/imei-history?assetId=<id>
POST /api/household/imei-history/asset-selection
DELETE /api/household/imei-history/{id}
```

## 25.7 Consumer support lookup

```http
POST /api/water/household-meter-details
```

Body:

```json
{
  "searchType": "CONSUMER_ID",
  "value": "WS/BMC/1471668",
  "fromDate": "2026-08-01",
  "toDate": "2026-09-04"
}
```

or:

```json
{
  "searchType": "METER_NUMBER",
  "value": "0024004061",
  "fromDate": "2026-08-01",
  "toDate": "2026-09-04"
}
```

Returns:
- consumer
- site/address
- meters
- replacement lineage
- start/end reading
- total consumption
- daily readings

This is particularly useful for the new Household detail/lookup UX.

---

# 26. API mapping — Billing

## 26.1 Bill list

```http
POST /api/billing
```

**No trailing slash.**

Body:
- `PaginationReqDTO`
- optional query params `startDate`, `endDate`

Returns `Page<BillDTO>`.

## 26.2 Create bill

```http
POST /api/billing/
```

**Trailing slash required.**

Body: `BillDTO`.

The list and create endpoints are intentionally different only by the trailing slash. Preserve this exactly.

## 26.3 Latest bill

```http
GET /api/billing/latest-bill/{assetId}
```

Use to seed previous reading and minimum billing date.

## 26.4 Slabs

```http
POST /api/billing/slabs
GET  /api/billing/slabs?siteIds=1&siteIds=2
PATCH {dataRest}/billingSlabs/{id}
DELETE {dataRest}/billingSlabs/{id}
```

## 26.5 Billing header

```http
GET /api/billing/header/{siteId}
```

## 26.6 Bill delete

```http
DELETE {dataRest}/bills/{id}
```

## 26.7 Meter search for billing

```http
POST /api/asset/query
```

Use the backend filter DSL as required.

## 26.8 Billing rule

The frontend should display consumption:

```text
currentReading - prevReading
```

but the frontend must **not calculate the monetary bill**. Send the bill creation request and render the server-returned `amount` and `billCharges`.

---

# 27. API query DSL

Several list endpoints use a query string.

Examples:

```text
`customId<CT:AN>H0012
`imeiEdgeDevice.imeiNumber<CT:AN>8613
`household.customId<CT:AN>H1
`id<NIN:AN>[12,45]
`imeiEdgeDevice<NOTNULL:AN>null
`status<IN:AN>[SUCCESSFUL,MISSING]
```

Keep query creation in a dedicated utility:

```text
src/services/api/queryDsl.ts
```

Do not build these strings separately in every page.

---

# 28. API inconsistencies — mandatory adapter layer

Create explicit endpoint adapters because these inconsistencies are real.

## 28.1 Date parameter names

Use `endDate`:
- raw-data/cursor
- meter-wise-consumption/cursor
- site-wise-daily-consumption/cursor

Use `toDate`:
- meter-replacement-report/page
- gateway-performance
- gateway-meter-summary
- executive-summary

Never create a generic helper that changes all date parameters to the same name.

## 28.2 siteIds encoding

Comma-joined:
- gateway-meter-summary

Repeated query params:
- meter-health
- gateway-performance
- billing/slabs
- map endpoints where siteIds is used

## 28.3 Billing trailing slash

- list = `/api/billing`
- create = `/api/billing/`

Wrong path can return 405.

## 28.4 Spring Data REST relation URLs

Household:
- `site/{id}`

Asset/geofence:
- `sites/{id}`

Preserve backend behavior.

## 28.5 204 semantics

For some operations 204 may represent “not found” rather than a successful empty result.

Normalize endpoint behavior inside the repository/service, not in page code.

## 28.6 Error body variants

Handle:
- standard error object
- bare validation string array
- `{"error-type":"..."}`
- report-specific `{"error","message"}`

---

# 29. API navigation / role metadata

Available endpoints:

```http
GET  /api/auth/modules
GET  /api/auth/modules/{module-id}?configVisibleOnly=false
GET  /api/auth/sub-modules/favourite
POST /api/auth/sub-modules/favourite
PATCH /api/auth/modules/{module-id}/update-submodule-preference
```

Use this data for permissions/role awareness if it fits the Cortex-W shell.

However, do **not** let the old backend report tree redefine the Cortex-W sidebar described in this document. The new UX has a deliberate information architecture.

If backend role permissions hide a capability:
- hide or disable the action;
- show clear permission state;
- do not expose forbidden API actions.

---

# 30. API service file structure

Recommended:

```text
src/
  services/
    api/
      httpClient.ts
      authApi.ts
      moduleApi.ts
      waterApi.ts
      mapApi.ts
      householdApi.ts
      billingApi.ts
      assetApi.ts
      siteApi.ts
      queryDsl.ts
      apiError.ts
      paramEncoding.ts
```

Examples of responsibility:

`httpClient.ts`
- base URL
- JWT header
- 401 handling
- response parsing
- no business transformations

`waterApi.ts`
- water summary
- daily data
- executive summary
- meter health
- gateway performance
- gateway meter summary
- latest status
- raw data

`mapApi.ts`
- asset locations
- geofences
- gateway placement

`householdApi.ts`
- CRUD
- meter history
- document flows

`billingApi.ts`
- bill list/create
- latest bill
- slabs
- header

Repositories then transform API DTOs into product domain objects.

---

# 31. Frontend domain/repository architecture

Suggested:

```text
src/
  app/
    AppShell.tsx
    router.tsx
    providers.tsx

  config/
    runtimeConfig.ts
    featureFlags.ts
    thresholds.ts

  theme/
    tokens.css
    cortexTheme.ts

  components/
    layout/
    cards/
    charts/
    data-table/
    filters/
    status/
    map/
    drawer/
    empty-state/
    feedback/

  modules/
    auth/
      pages/
      components/
      hooks/
      repository/
      types/

    dashboard/
      pages/
      components/
      hooks/
      repository/
      selectors/
      types/

    command-center/
      pages/
      components/
      hooks/
      repository/
      selectors/
      types/

    gis/
      network/
      gateway-placement/
      shared/

    consumer/
      households/
      billing/

    ai-analysis/
      alarms/
      hydraulic/

    settings/
      integrations/
      users/
      general/

  services/
    api/

  repositories/
    repositoryFactory.ts

  data/
    seed/
      telemetry/
      gateways/
      households/
      billing/
      alarms/
      hydraulic/

  utils/
    date.ts
    number.ts
    signal.ts
    geo.ts
    status.ts

  tests/
```

Do not create one `components` directory with hundreds of unrelated files. Keep feature-specific components inside the feature.

---

# 32. Data-fetching and state rules

Use server-state tools for API data.

Do not place API results into a giant global Redux/Zustand object unless Cortex family already mandates it.

Suggested keying:

```ts
['dashboard', siteIds, date]
['gateway-summary', siteIds, fromDate, toDate]
['meter-health', siteIds]
['gateway-performance', siteIds, fromDate, toDate]
['raw-telemetry', filters, cursor]
['households', filters, page]
['household', id]
['bills', filters, page]
```

Refresh policies:
- Command Center meter health: periodic, e.g. 30–60 seconds when visible.
- Dashboard: 2–5 minutes unless manually refreshed.
- Household/Billing: on demand.
- Maps: cache static location/geofence data longer.
- Never run aggressive background polling across every page.

---

# 33. Loading, empty and error states

Every module must have intentional states.

## Loading
- use skeleton cards
- skeleton table rows
- map loading overlay

## Empty
Examples:
- `No gateways reported in this period.`
- `No meters match these filters.`
- `No households found.`
- `No bills generated for this date range.`

## Error
Show:
- simple operator-friendly message
- retry
- optional technical details only in admin/dev mode

## Partial
If one Dashboard source fails:
- keep successful cards;
- mark failed card/panel with `Data unavailable`;
- do not blank the entire page.

---

# 34. Time and freshness semantics

Backend telemetry can involve:
- meter-reported timestamp,
- decoded timestamp,
- record/date,
- lastSeen.

UI rules:
- use decoded/last-seen arrival time for reporting freshness;
- show meter timestamp separately as device clock;
- when device clock is implausible, show a data-quality warning;
- show timezone in tooltip;
- display relative age plus exact timestamp.

Example:
`18 min ago`
tooltip:
`04 Sep 2026, 23:45 IST`

Do not use device `MeterTimestamp` as the sole connectivity indicator.

---

# 35. Status semantics

Create centralized status helpers.

Meter:
- Reporting
- Delayed
- Silent
- Never Seen
- Data Quality Issue

Gateway:
- Reporting
- Degraded
- No Recent Traffic
- No Data in Period

Health:
- Normal
- Warning
- Abnormal
- Unknown

Billing:
- Paid
- Pending
- Overdue

Alarm:
- Open
- Acknowledged
- Assigned
- Resolved

Status labels should be textual, not color-only.

---

# 36. Performance requirements

The app will have a significant install base.

Design for:
- 100k+ configured meters eventually;
- thousands of visible meter-health records;
- high map marker density;
- cursor pagination for telemetry;
- server pagination for households/billing;
- virtualized tables when useful;
- marker clustering;
- viewport-based rendering on map;
- debounced search;
- memoized derived aggregates;
- lazy-loaded route bundles.

Avoid:
- rendering tens of thousands of DOM rows;
- loading every raw telemetry record at once;
- recalculating haversine for all markers on every render;
- refetching static geofence data every few seconds.

---

# 37. GIS implementation notes

Use Google Maps in production.

Components:

```text
GoogleMapProvider
NetworkMap
MeterLayer
GatewayLayer
CoverageCircleLayer
ClusterLayer
AlarmLayer
MapLegend
MapToolbar
MeterMapDrawer
GatewayMapDrawer
```

Do not put all map behavior inside `NetworkMap.tsx`.

Create geo utilities:
- haversine distance
- radius containment
- bounds
- coordinate validation

Drop:
- null lat/lon
- 0,0
- out-of-range coordinates

---

# 38. Tables

Build one reusable data-table abstraction that supports:
- sorting
- filtering
- pagination or cursor mode
- column visibility
- sticky header
- loading
- empty
- actions
- export hooks
- responsive horizontal scrolling

But do not make the abstraction so generic that it becomes impossible to maintain.

Each feature owns its column definitions.

---

# 39. Responsive behavior

Primary target: desktop operations console.

Desktop >= 1280:
- full sidebar
- multi-column cards
- map + side panel

Tablet:
- collapsible sidebar
- 2-column cards
- map side panel as drawer

Mobile:
- support essential lookup and alarm review
- not required to reproduce full dense Command Center layout
- tables may become cards/drawers
- map remains usable

---

# 40. Accessibility

- keyboard-accessible navigation
- visible focus rings
- semantic buttons
- form labels
- aria labels for icon-only buttons
- status not conveyed solely by color
- chart summary text
- map controls keyboard reachable where possible
- minimum practical contrast

---

# 41. Security

- never commit credentials;
- never commit Google Maps key without referrer restriction;
- never commit OpenAI or private service keys;
- JWT attached by central HTTP client;
- permission checks in UI do not replace backend permission checks;
- sanitize user-entered text;
- do not render backend exception HTML;
- do not expose full raw JWT in normal UI;
- secrets should come from deployment environment/runtime config.

The old reference warns of live keys committed in the older frontend. Do not reproduce that pattern.

---

# 42. Docker and deployment

Create:

```text
Dockerfile
docker-compose.yml
nginx.conf
.env.example
```

Recommended multi-stage Dockerfile:

Stage 1:
- Node
- install
- build

Stage 2:
- Nginx
- copy built assets
- SPA fallback to `index.html`

Requirements:
- support browser refresh on deep links;
- gzip/brotli if standard image supports it;
- immutable caching for hashed assets;
- no caching for runtime config;
- health path `/healthz` returning 200;
- expose port 80;
- no backend packaged into frontend container.

Example Compose concept:

```yaml
services:
  cortex-w:
    build: .
    ports:
      - "8088:80"
    environment:
      # use runtime config mechanism if supported
      - APP_DATA_MODE=seed
```

If Vite environment variables are compiled at build time, add a runtime config pattern rather than requiring a separate image for every API URL.

---

# 43. Testing

## Unit
- signal band helpers
- freshness/status
- date param encoder
- siteIds param encoder
- query DSL
- API error normalization
- repository transformations
- haversine
- alarm rules

## Component
- KPI cards
- gateway list
- filter bar
- meter drawer
- household form
- billing form
- alarm drawer

## Integration
- login + protected route
- seed/api repository switch
- Command Center filter synchronization
- household detail fetch
- billing create path slash correctness
- GIS gateway selection

## E2E
Critical flows:
1. login
2. open Dashboard
3. open Command Center
4. select gateway
5. open a meter
6. locate meter on GIS
7. open household
8. open bill
9. open Alarm
10. refresh a deep-linked page

---

# 44. Acceptance criteria by module

## Login
- visually matches Cortex family
- split layout
- API/mock auth separated
- token header handled

## Dashboard
- light mode
- installation, supply, network and attention sections
- filters
- real/seed mode works
- no report-menu feel

## Command Center
- gateway/meter data-flow first
- reports observed gateways and meter count
- light recreation of dense command-center UX
- gateway list + chart + meter feed
- meter detail drill-down
- 1H/24H/7D/custom controls

## GIS
- meter/gateway map
- coverage circles
- filters
- gateway health
- recommendation tool
- performant marker clustering

## Household
- list
- create/edit
- detail
- meter history
- consumer lookup
- safe delete confirmation

## Billing
- list
- filters
- create flow
- slabs
- bill detail/print
- server-priced amount

## Alarms
- realistic seed alarm rules
- severity
- filters
- detail evidence
- map/entity links

## Hydraulic
- polished seed UX
- clear demo-data indicator
- repository ready for future API

## Settings
- integrations
- users/roles shell
- general configuration
- no secrets committed

---

# 45. Build order for AntiGravity

Do not attempt every screen as one gigantic generation pass. Build in this sequence while keeping one coherent repo:

### Phase 1 — Foundation
- app shell
- theme
- routing
- runtime config
- repository factory
- seed/api mode
- auth
- Docker

### Phase 2 — Global Tools
- Dashboard
- Command Center
- shared KPI/charts/tables/status

### Phase 3 — GIS
- Network Explorer
- Gateway Placement

### Phase 4 — Consumer
- Households
- Household Detail
- Billing

### Phase 5 — AI Analysis
- Alarms
- Hydraulic Analysis

### Phase 6 — Settings and hardening
- integrations
- users/role view
- general
- permissions
- tests
- performance
- loading/error polish

At the end of each phase, the app must still compile and run.

---

# 46. AntiGravity implementation guardrails

1. Do not create a single-file demo.
2. Do not create a static HTML mock with no architecture.
3. Do not hard-code every card directly into one dashboard file.
4. Do not bind pages directly to seed JSON.
5. Do not recreate the old report navigation.
6. Do not make Command Center dark.
7. Do not add a dark-mode toggle.
8. Do not use huge icons.
9. Do not use random stock graphics.
10. Do not fabricate API endpoints.
11. Do not change the documented backend endpoint paths to make them “consistent.”
12. Do not treat 204 uniformly as success.
13. Do not normalize `/api/billing` and `/api/billing/`.
14. Do not use `reverseFlowL` as the API field.
15. Do not use raw `MeterTimestamp` for reporting freshness.
16. Do not put Google/OpenAI/private keys in the source.
17. Do not rely on route state for entity deep links.
18. Do not delete a Household or Bill without confirmation.
19. Do not calculate monetary billing in the browser.
20. Do not silently fall back to mock data in production API mode.
21. Do not invent hydraulic API calls.
22. Do not use the old API reference to decide modules.
23. Keep the UI unmistakably within the Cortex family.
24. Keep all operational screens light.

---

# 47. Definition of done for the foundation build

The initial Cortex-W foundation is complete when:

- `docker compose up --build` starts the app;
- login works in seed mode;
- API mode has a real auth adapter and JWT header handling;
- the Cortex-W shell and sidebar are implemented;
- Dashboard renders realistic Bhubaneswar seed data;
- Command Center renders the supplied 04 Sep gateway/meter seed;
- operator can select a gateway and inspect its meters;
- operator can open a meter detail drawer;
- Network Explorer renders meter/gateway seed layers;
- Gateway Placement has a functional seed/API adapter;
- Household and Billing pages are implemented with API-ready repositories;
- Alarm page renders meaningful seed issues;
- Hydraulic Analysis renders clearly labeled synthetic data;
- Settings exists;
- route-level deep links survive refresh;
- seed/api/hybrid modes are cleanly separated;
- no giant source file contains the whole application;
- no production secret is hard-coded;
- all API path quirks in this specification are preserved;
- code is ready for Cognecto developers to connect module-by-module to the existing backend rather than rewrite the frontend from scratch.

---

# 48. Closing product intent

Cortex-W should feel like a purpose-built water operations product, not an old application with its reports rearranged.

The core mental model is:

```text
Dashboard
  → What is happening?

Command Center
  → Is the water-meter data network working?

GIS
  → Where are the meters/gateways, what is covered, and where should we improve coverage?

Consumer
  → Who is connected, what meter do they have, and what are they billed?

AI Analysis
  → What deserves attention and what network/hydraulic pattern explains it?

Settings
  → How is Cortex-W configured and who may use it?
```

If a design or engineering choice makes those questions harder to answer, change the choice.

Build this as the **Cortex-family foundation for water intelligence**, with enough architecture that new water modules can be added without turning the application back into a collection of isolated reports.
