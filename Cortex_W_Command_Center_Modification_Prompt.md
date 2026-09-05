# Cortex-W — Command Center Modification Specification

## Purpose of this prompt

This document is **ONLY for modifying the existing Cortex-W Command Center**.

The Cortex-W application is already being built. Do **not** rebuild the application, do **not** replace the shell, do **not** redesign Login, Dashboard, GIS, Consumer, Billing, AI Analysis, Settings, routing, or the global navigation.

Work only inside the existing **Command Center** feature and the minimum shared services/types needed to support it.

The finished Command Center must become a **pure water-network telemetry and data-flow operations console**.

It is not a household dashboard. It is not an installation-progress dashboard. It is not a billing dashboard. It is not a water-consumption dashboard.

The Command Center must answer:

> **Are water-meter uplink frames reaching Cortex? Which gateways are receiving them? Which meters are being heard by each gateway? What is the latest frame from a gateway or meter? What has become stale, weak, degraded, or silent?**

---

# 1. Scope guardrail — modify only Command Center

## 1.1 Do not change

Do not modify unless technically unavoidable:

- Login page
- Cortex-W left navigation
- Dashboard
- GIS / Network Explorer
- Gateway Placement
- Household Management
- Billing
- Alarm module
- Hydraulic Analysis
- Settings
- user management
- global theme
- backend APIs
- Docker architecture
- existing authentication flow

If a shared component must be touched, keep the change backward compatible.

## 1.2 Do not introduce a new application shell

Use the shell, route, header, sidebar, typography, spacing, icon family, buttons, dropdowns, tables and design tokens already present in Cortex-W.

The Command Center main workspace must remain **light mode / non-dark mode**, consistent with the Cortex family.

Do not copy the dark background of the Vision AI Command Center reference screenshot. Use its **information density and operational layout only**.

---

# 2. Command Center product definition

The screen represents this data path:

```text
Water Meter / LoRaWAN Device
        ↓
Uplink Frame
        ↓
One or More LoRa Gateways
        ↓
Network / Application Server
        ↓
Decoded Telemetry
        ↓
Cognecto Cortex-W
```

Every card, table, graph and drill-down on this page must help the operator investigate that path.

### Explicitly exclude from Command Center

Do not show:

- households onboarded
- households configured
- households mapped
- consumer registration progress
- bill amount
- billing status
- tariff
- meter installation progress
- meter replacement workflow
- household edit actions
- consumer address as a primary field
- water consumption business KPIs

A backend DTO may contain `householdId`, readings or other fields. Do not make them part of the Command Center information architecture.

---

# 3. Core operator questions

The modified page must answer these without leaving Command Center:

1. How many known gateways are currently receiving meter traffic?
2. Which gateways have no recent meter traffic?
3. Which gateway is hearing the most meters?
4. Which gateways have experienced a major traffic drop?
5. How many unique meters are being heard by every gateway?
6. Which meters are currently being heard through the selected gateway?
7. What was the latest frame seen through the selected gateway?
8. What was the latest frame from the selected meter?
9. What are the latest RSSI and SNR values?
10. What are FCnt, FPort, DR and frequency on the latest frame?
11. Is a meter being heard through multiple gateways?
12. Has a meter changed gateway recently?
13. Which meters are stale / silent?
14. Which meters have consistently weak radio links?
15. Are there suspicious FCnt gaps?
16. Is the network data flow improving or deteriorating over the selected time window?

---

# 4. Final page composition

Desktop-first layout:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ COMMAND CENTER   Site [BHUBANESWAR ▼]   1H  6H  24H  7D   Search meter/gateway   Refresh   │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ GATEWAYS WITH │ NO RECENT │ UNIQUE METERS │ FRAMES │ LAST FRAME │ MULTI-GW │ AVG RSSI │ SNR │
│ TRAFFIC       │ TRAFFIC   │ SEEN          │        │            │ METERS   │          │     │
├──────────────────────┬──────────────────────────────────────────────────┬─────────────────────┤
│                      │                                                  │                     │
│ GATEWAYS             │ SELECTED GATEWAY                                │ LATEST METER INFO   │
│                      │                                                  │                     │
│ Search               │ [Meters] [Latest Frames] [Traffic] [Radio]     │ meter / DevEUI      │
│ All/Reporting/...    │                                                  │ latest gateway      │
│                      │ main gateway workspace                           │ latest frame        │
│ ● GW-2A5             │                                                  │ RSSI / SNR          │
│ ● GW-2A6             │                                                  │ FCnt / FPort        │
│ ! GW-262             │                                                  │ recent frames       │
│ ○ GW-29F             │                                                  │ diagnostics         │
│                      │                                                  │                     │
├──────────────────────┴──────────────────────────────────────────────────┴─────────────────────┤
│ LIVE NETWORK FEED / LATEST RECEIVED FRAMES                                                   │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Width guideline

Desktop at >= 1440 px:

- left gateway rail: approximately `260–310px`
- right meter inspector: approximately `330–390px`
- center: consume remaining width

The page should feel like an operational console, not a set of oversized marketing cards.

---

# 5. Command bar

Use the existing Cortex-W header styling.

Controls:

- Site selector
- Time range segmented control:
  - `1H`
  - `6H`
  - `24H`
  - `7D`
  - `Custom`
- global search:
  - Meter ID
  - DevEUI
  - Gateway ID
- auto refresh toggle
- manual refresh button
- `Updated <n>s ago`

Default:

```text
Site: BHUBANESWAR
Window: 24H
Auto refresh: ON
```

Do not add household, billing, ward or tariff filters.

---

# 6. Top KPI strip — network health only

Keep cards compact. Prefer a single row.

## KPI 1 — Gateways With Traffic

Meaning:

> Number of known gateways through which at least one meter frame was observed during the selected operational freshness period.

Example:

```text
14 / 18
Gateways With Traffic
```

Do not call this `Gateway Powered On` because the existing backend does not provide a true physical gateway heartbeat.

## KPI 2 — No Recent Gateway Traffic

Example:

```text
4
No Recent Gateway Traffic
```

Tooltip:

> No meter telemetry has been observed through these gateways inside the configured freshness threshold. This does not prove that gateway hardware is powered off.

## KPI 3 — Unique Meters Seen

Example:

```text
4,449
Unique Meters Seen
```

This is **telemetry-observed meters**, not configured meters.

## KPI 4 — Frames Received

Count actual telemetry rows / frames in selected time range.

Example:

```text
186,420
Frames Received
```

If API data does not expose enough rows to derive this truthfully, show `—` / `Unavailable` rather than generating it from meter counts.

## KPI 5 — Last Frame Received

Example:

```text
18 sec ago
Last Network Frame
```

Use decoded/server-arrival time as the freshness clock.

## KPI 6 — Multi-Gateway Meters

Example from current system behavior:

```text
605
Heard by Multiple Gateways
```

## KPI 7 — Average RSSI

Example:

```text
-89.5 dBm
Average RSSI
```

## KPI 8 — Average SNR

Example:

```text
-11.5 dB
Average SNR
```

---

# 7. Left rail — Gateways

The **Gateway Rail is the primary navigator** of Command Center.

It must remain visible while users investigate meters and frames.

Header:

```text
GATEWAYS
18 known

[ Search gateway ]
[ All | Reporting | Degraded | Stale | No Traffic ]
```

Each gateway row must show:

- status dot/icon
- friendly alias where available
- gateway ID
- unique meters heard
- frame count when available
- latest frame age
- traffic trend vs previous equivalent period
- average RSSI/SNR or compact signal indicator

Example:

```text
● GW-2A5
  506f9800000002a5
  738 meters · 738 frames
  last 12 sec · RSSI -88.6 · SNR -8.2

● GW-2A6
  506f9800000002a6
  403 meters · 403 frames
  last 18 sec · RSSI -89.7 · SNR -11.5

! GW-262
  506f980000000262
  251 meters · traffic ↓ 38%
  last 42 min · RSSI -94.4 · SNR -16.9

○ GW-297
  506f980000000297
  1 meter
  no recent traffic
```

### Sorting

Allow:

- Status severity
- Last frame
- Unique meters
- Frame count
- Gateway ID

Default:

1. problem gateways first
2. oldest latest-frame age first
3. then highest unique-meter count

### Gateway state labels

Use these exact concepts:

- `Reporting`
- `Degraded`
- `Stale`
- `No recent traffic`
- `Never observed`

Never use `Powered Off`, `Disconnected Hardware`, or `Gateway Down` unless a future gateway heartbeat API proves it.

---

# 8. Selected Gateway header

Selecting a gateway must update the center workspace without navigating away from Command Center.

Header example:

```text
GW-2A5                                              REPORTING
506f9800000002a5
Last frame: 12 sec ago

738 unique meters  ·  738 frames  ·  Avg RSSI -88.6 dBm  ·  Avg SNR -8.2 dB
```

If an alias exists, show alias prominently and full ID below.

Tabs:

1. `Meters`
2. `Latest Frames`
3. `Traffic`
4. `Radio Health`

Default tab: `Meters`.

---

# 9. Meters tab — meters heard by selected gateway

This is the main operational table.

It answers:

> Which meters are sending data through this gateway and what is their latest radio/data-flow state?

Columns:

| Column | Purpose |
|---|---|
| Meter ID | physical/logical meter identifier |
| DevEUI | LoRaWAN device identity |
| Last Seen | latest decoded timestamp |
| Frame Age | human-friendly freshness |
| Frames 1H | count in latest hour if available |
| Frames 24H | count in latest 24h if available |
| Last RSSI | latest receive strength |
| Last SNR | latest signal-to-noise |
| FCnt | latest frame counter |
| FPort | latest LoRa application port |
| Frequency | latest receive frequency |
| DR | data rate |
| ADR | ADR state |
| Confirmed | confirmed/unconfirmed flag |
| Other Gateways | number of other gateways hearing this meter |
| Status | network-health derived status |

Do not show:

- household name
- bill status
- bill value
- water tariff
- installation action
- meter replacement action

### Meter network statuses

Possible chips:

- `Live`
- `Stale`
- `Silent`
- `Multi-gateway`
- `Weak RSSI`
- `Poor SNR`
- `FCnt gap suspected`
- `Gateway changed`

A meter can have more than one diagnostic flag.

### Filters

- search Meter ID / DevEUI
- Live
- Stale
- Silent
- Weak RSSI
- Poor SNR
- Multi-gateway only
- FCnt gap suspected
- Confirmed / Unconfirmed
- Frequency
- DR

### Row click

Clicking a meter must update/open the **Latest Meter Info** panel on the right.

Do not navigate to Household Management.

---

# 10. Right panel — Latest Meter Info

This should behave like a lightweight **telemetry packet inspector**.

It should never feel like a consumer master-data form.

## 10.1 Meter identity

Show:

```text
Meter 0025016559
DevEUI 70B3D57ED005A321
LIVE
Last seen 18 sec ago
```

Provide copy icons for:

- Meter ID
- DevEUI
- Gateway ID

## 10.2 Latest frame

Show:

- latest gateway ID
- decoded/received timestamp
- meter timestamp separately
- frame age
- FCnt
- FPort
- frequency
- DR
- RSSI
- SNR
- ADR
- confirmed/unconfirmed
- checksum status
- status byte if present

Example card:

```text
LATEST FRAME
Received       08:12:42.384
Gateway        GW-2A5
FCnt           486
FPort          100
Frequency      868.1 MHz
DR             3
RSSI           -91 dBm
SNR            8.2 dB
Confirmed      Yes
ADR            No
Checksum       OK
```

## 10.3 Gateway reception path

When a meter is heard by more than one gateway, show the reception paths:

```text
HEARD BY GATEWAYS

GW-2A5     -91 dBm     8.2 dB     18 sec ago     LATEST
GW-2A6    -104 dBm     2.1 dB      2 min ago
GW-262    -111 dBm    -3.4 dB     11 min ago
```

Highlight:

- latest gateway
- strongest RSSI
- strongest SNR

If historical data shows that the preferred/latest gateway changed, show:

```text
Gateway changed
GW-2A6 → GW-2A5
```

## 10.4 Recent meter frames

Show latest 10–20 meter frames:

- Received time
- Gateway
- FCnt
- RSSI
- SNR
- frequency
- DR
- FPort
- confirmed
- checksum

Add:

`View all frames`

This should open/activate a full frame view without leaving Command Center.

## 10.5 Diagnostics

Display derived network/data-quality flags:

- No recent uplink
- Weak RSSI
- Poor SNR
- FCnt gap
- Gateway changed
- Seen by multiple gateways
- Meter timestamp anomaly

No household/billing actions in this panel.

---

# 11. Latest Frames tab — selected gateway

This is one of the most important modifications.

When a gateway is selected, the operator must be able to see the newest frames received through that gateway.

Title:

```text
Latest Gateway Frames
GW-2A5
```

Columns:

| Column |
|---|
| Received / Decoded At |
| Meter ID |
| DevEUI |
| FCnt |
| FPort |
| Frequency |
| DR |
| RSSI |
| SNR |
| Confirmed |
| ADR |
| Checksum |
| Data Status |

Example:

```text
08:12:42.384  0025016559  70B3...A321  486  100  868.1  DR3  -91   8.2   Yes  No  OK
08:12:39.118  0025068122  70B3...91C7  991  100  868.3  DR3 -103   1.4   Yes  No  OK
08:12:35.733  0025048117  70B3...441A  122  100  867.9  DR2  -97   5.1   Yes  No  OK
```

### Behavior

- newest first
- auto-refresh while visible
- subtle highlight on newly inserted frames
- pause live insertion if user scrolls away from top or is inspecting a row
- show `Resume Live`
- row click opens frame detail
- copy Meter ID / DevEUI / Gateway ID
- cursor pagination / virtualization for large datasets

### Frame detail drawer

Show all available raw decoded metadata:

- Gateway ID
- Meter ID
- DevEUI
- DevAddr
- Application ID
- Application Name
- Device Profile ID
- Device Profile Name
- Measure Name
- FCnt
- FPort
- DR
- Frequency
- Confirmed
- ADR
- RSSI
- SNR
- decodedAt
- meterTimestamp
- checksumStatus
- statusByte

Do not invent a raw binary payload if the API does not return it.

---

# 12. Traffic tab — frame flow, not consumption

Never graph water consumption here.

For selected gateway show:

### Main chart switcher

- `Frames`
- `Unique Meters`

Optional all-network mode may also include:

- `Active Gateways`

### Charts

1. Frames received over time
2. Unique meters heard over time
3. Previous equivalent period comparison
4. traffic-drop indicator

### Time bucket recommendation

```text
1H   → 5 minute buckets
6H   → 15 minute buckets
24H  → 1 hour buckets
7D   → 1 day buckets
```

### Traffic-drop flag

Example:

```text
Traffic ↓ 38% vs previous 24H
```

Centralize thresholds in configuration.

Do not hard-code alert logic inside a chart component.

---

# 13. Radio Health tab

Network/radio analysis only.

Show:

- Average RSSI
- Average SNR
- RSSI distribution
- SNR distribution
- frames by DR
- frames by frequency
- weak-link meter count
- meters repeatedly reporting weak RSSI
- meters repeatedly reporting poor SNR
- strongest meters
- weakest meters

Suggested UI-only default bands:

### RSSI

```text
Strong       >= -80 dBm
Good         -81 to -90 dBm
Weak         -91 to -100 dBm
Very Weak    < -100 dBm
```

### SNR

```text
Excellent    >= 5 dB
Good          0 to <5 dB
Marginal    -10 to <0 dB
Poor         < -10 dB
```

These are frontend operational defaults, not backend contract truth. Keep configurable.

---

# 14. No gateway selected — all-gateway comparison

When gateway selection is cleared, the center area must become an **all-gateway comparison** instead of being empty.

Columns:

| Gateway | Status | Unique Meters | Frames | Last Frame | Avg RSSI | Avg SNR | Multi-GW Meters | Trend |
|---|---|---:|---:|---|---:|---:|---:|---:|

Use horizontal load bars similar to the current Gateway-wise Unique Meter Summary because that visual makes imbalance obvious.

Example seed:

```text
506f9800000002a5   ██████████████████████  738
506f9800000002a6   ████████████            403
506f98000000029a   ████████                280
506f980000000262   ███████                 251
506f980000000340   ████                    155
506f98000000029e   ████                    153
506f980000000261   ████                    149
506f9800000002a8   ███                     134
506f980000000299   ███                     130
506f9800000002a3   ███                     107
```

Clicking a row selects that gateway and opens its Meters tab.

---

# 15. Live Network Feed

Keep a compact live feed at the bottom of Command Center.

It should look operational and dense, but remain light-mode.

Columns:

- Time
- Gateway
- Meter
- FCnt
- RSSI
- SNR
- Status/Event

Example:

```text
08:12:42   GW-2A5   0025016559   486   -91 dBm    8.2 dB    FRAME RECEIVED
08:12:39   GW-2A5   0025068122   991  -103 dBm    1.4 dB    WEAK RSSI
08:12:35   GW-262   0025048117   122   -97 dBm    5.1 dB    FRAME RECEIVED
08:12:31   GW-29A   0025083821   210  -108 dBm   -4.1 dB    POOR LINK
```

Filters:

- All
- Normal
- Weak Signal
- Gateway Stale
- Meter Stale
- FCnt Gap
- Multi-Gateway

Use virtualization if feed size is large.

---

# 16. Gateway freshness and health logic

The existing backend does **not** expose a true gateway heartbeat/power state.

Therefore gateway health must be based on **telemetry observed through a gateway**.

Recommended configurable defaults:

```ts
export const networkHealthThresholds = {
  gatewayStaleMinutes: 15,
  gatewayCriticalMinutes: 60,
  meterStaleMinutes: 60,
  meterCriticalHours: 24,
  gatewayTrafficDropWarningPct: 30,
  gatewayTrafficDropCriticalPct: 60,
  rssiWeakDbm: -100,
  rssiCriticalDbm: -110,
  snrWeakDb: -10,
};
```

These defaults must live in one configuration module.

### Gateway status inference

```text
REPORTING
latest frame inside healthy threshold

DEGRADED
frames are still arriving, but traffic has materially dropped and/or radio quality is poor

STALE
latest frame older than warning threshold

NO RECENT TRAFFIC
latest frame older than critical threshold or no telemetry in operational window

NEVER OBSERVED
gateway exists in configured geofence/gateway inventory but no frame has ever been associated in available data
```

Do not equate `No recent traffic` with physical power failure.

---

# 17. Meter freshness logic

Use `decodedAt` as the primary freshness timestamp.

Do not use `meterTimestamp` as the primary freshness clock because device timestamps may be wrong or delayed.

Recommended states:

```text
LIVE
last decoded frame within meterStaleMinutes

STALE
last decoded frame older than stale threshold but younger than critical threshold

SILENT
older than critical threshold
```

If the current backend's `meter-health` endpoint uses a 36-hour active concept, do not label a different frontend threshold as backend truth. Treat the Command Center thresholds as Cortex-W operational thresholds.

---

# 18. FCnt diagnostics

FCnt should be useful for field/network diagnosis.

For frames sorted by meter and receive time:

- compare current FCnt against previous FCnt
- flag unexpectedly large forward jumps as `FCnt gap suspected`
- do not automatically declare packet loss because resets/rejoins can affect counters
- if FCnt decreases sharply, flag `Counter reset / rejoin suspected`
- if duplicate FCnt values arrive through multiple gateways close together, treat them as possible multi-gateway reception rather than duplicate meter transmission

Keep this logic in selectors/utilities, not inside table rendering code.

---

# 19. Multi-gateway logic

A LoRa meter may be heard by multiple gateways.

This is useful network information and must be visible.

For each selected meter show:

- latest gateway
- all gateways that heard it in selected period
- latest frame time per gateway
- latest RSSI per gateway
- latest SNR per gateway

For network summary show:

```text
Unique meters seen: 4,449
Meters heard by multiple gateways: 605
```

Do not invent the exact 1-gateway / 2-gateway / 3-gateway distribution unless raw frames support calculating it.

---

# 20. Seed data — use realistic Bhubaneswar network data

Seed mode must use network data, not household totals.

### 04 Sep 2026 raw telemetry snapshot

Use these values as realistic demo context:

```text
Site: BHUBANESWAR
Site ID: 6394
Telemetry rows in supplied seed: 2,532
Unique Meter IDs: 2,532
Unique DevEUIs: 2,532
Observed Gateway IDs: 14
Average RSSI: -89.5 dBm
Median RSSI: -90 dBm
RSSI range: -103 to -56 dBm
Average SNR: -11.5 dB
Median SNR: -13 dB
SNR range: -23.8 to 9.2 dB
Checksum OK: 2,532 / 2,532
```

### Observed gateways in 04 Sep seed

| Gateway ID | Meters observed | Avg RSSI | Avg SNR | Latest decoded-at UTC |
|---|---:|---:|---:|---|
| `506f9800000002a5` | 738 | -88.6 | -8.2 | `2026-09-04T18:15:11.706179+00:00` |
| `506f9800000002a6` | 403 | -89.7 | -11.5 | `2026-09-04T14:30:45.586050+00:00` |
| `506f98000000029a` | 280 | -86.7 | -9.5 | `2026-09-04T17:53:04.073396+00:00` |
| `506f980000000262` | 251 | -94.4 | -16.9 | `2026-09-04T17:27:54.035774+00:00` |
| `506f980000000340` | 155 | -90.9 | -15.1 | `2026-09-04T07:07:09.786422+00:00` |
| `506f98000000029e` | 153 | -86.2 | -12.1 | `2026-09-04T16:10:02.319930+00:00` |
| `506f980000000261` | 149 | -97.3 | -16.5 | `2026-09-04T06:42:01.779056+00:00` |
| `506f9800000002a8` | 134 | -87.1 | -12.6 | `2026-09-04T10:56:13.093114+00:00` |
| `506f980000000299` | 130 | -85.0 | -9.7 | `2026-09-04T06:46:52.495037+00:00` |
| `506f9800000002a3` | 107 | -91.3 | -14.1 | `2026-09-04T06:39:12.384423+00:00` |
| `506f98000000029d` | 24 | -85.8 | -15.4 | `2026-09-04T06:30:08.125839+00:00` |
| `506f980000000341` | 5 | -89.2 | -18.6 | `2026-09-04T05:43:36.655979+00:00` |
| `506f980000000346` | 2 | -81.0 | -18.1 | `2026-09-04T04:51:37.449145+00:00` |
| `506f980000000297` | 1 | -90.0 | -12.5 | `2026-09-04T04:02:39.981281+00:00` |

For a demo that needs `18 known gateways`, seed four additional configured gateways with no telemetry so that the UI can demonstrate `No recent traffic`. Mark them clearly as known/configured but not observed.

Do not use `2,532` as the permanent installed meter base. It represents the supplied daily telemetry seed only.

---

# 21. Data selectors / transformations

Keep data transformation outside React/Angular/Vue rendering components.

Implement selectors/functions equivalent to:

```ts
selectNetworkFrames(timeRange, siteId)
selectReportingGateways(timeRange, siteId)
selectGatewayLastFrame(gatewayId)
selectGatewayFrameCount(gatewayId, timeRange)
selectGatewayUniqueMeters(gatewayId, timeRange)
selectGatewayAverageRssi(gatewayId, timeRange)
selectGatewayAverageSnr(gatewayId, timeRange)
selectGatewayTrafficTrend(gatewayId, timeRange)
selectMetersByGateway(gatewayId, timeRange)
selectLatestFrameByMeter(meterId)
selectRecentFramesByMeter(meterId, limit)
selectRecentFramesByGateway(gatewayId, limit)
selectMeterLastSeen(meterId)
selectMeterLatestGateway(meterId)
selectGatewaysHearingMeter(meterId, timeRange)
selectMultiGatewayMeters(timeRange)
selectWeakSignalMeters(timeRange)
selectFcntGapCandidates(timeRange)
selectGatewayChangeCandidates(timeRange)
selectMeterTimestampAnomalies(timeRange)
```

No component should directly contain large grouping/reduction blocks for gateway or meter calculations.

---

# 22. Existing backend API sources to use

Do not create new backend endpoints for this modification unless current endpoints prove insufficient and the developer explicitly decides to add one later.

Use the existing API contract.

## 22.1 Gateway-wise unique meter summary

```http
GET /api/water/gateway-meter-summary
    ?siteIds=6394
    &fromDate=YYYY-MM-DD
    &toDate=YYYY-MM-DD
```

Response concept:

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

Use for:

- unique meters seen
- gateways observed
- unique meters by gateway
- multi-gateway total
- initial gateway load list

Important: `siteIds` for this endpoint is comma-joined when multiple sites are used.

## 22.2 Meter health

```http
GET /api/water/meter-health?siteIds=6394
```

Use for:

- meter ID
- gateway ID
- last seen
- decoded timestamp
- RSSI
- battery status if needed as secondary diagnostic

Response concept:

```ts
{
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
```

Ignore household fields in Command Center.

## 22.3 Gateway performance

```http
GET /api/water/gateway-performance
    ?siteIds=6394
    &fromDate=YYYY-MM-DD
    &toDate=YYYY-MM-DD
```

Response concept:

```ts
{
  gatewayId: string;
  date: string;
  activeMeterCount: number;
}[]
```

Use for:

- gateway traffic/active-meter trend where appropriate
- historical comparison

This endpoint requires dates.

## 22.4 Raw telemetry frames

```http
POST /api/water/raw-data/cursor
     ?fromDate=YYYY-MM-DD
     &endDate=YYYY-MM-DD
     &rawReport=true
```

Body:

```ts
{
  size: 100,
  cursor: null,
  siteIds: [6394],
  query?: string,
  sorts?: []
}
```

Use this as the frame-level source for:

- Latest Gateway Frames
- latest meter frame
- recent meter frames
- FCnt
- FPort
- frequency
- DR
- confirmed
- ADR
- RSSI
- SNR
- DevEUI
- DevAddr
- gateway ID
- decodedAt
- meterTimestamp
- checksum
- status byte
- application/device profile metadata

Relevant telemetry DTO fields include:

```ts
{
  meterId?: string;
  devEui?: string;
  devAddr?: string;
  gatewayId?: string;
  decodedAt?: string;
  meterTimestamp?: string;
  rssi?: number;
  snr?: number;
  fCnt?: number;
  fPort?: number;
  dr?: number;
  frequency?: number;
  confirmed?: boolean;
  adr?: boolean;
  checksumStatus?: string;
  statusByte?: number;
  applicationId?: string;
  applicationName?: string;
  deviceProfileId?: string;
  deviceProfileName?: string;
  measureName?: string;
  siteId?: string;
  siteName?: string;
}
```

For raw telemetry endpoints note the parameter is `endDate`, not `toDate`.

## 22.5 Known gateway inventory

```http
GET /api/map/geofence?siteIds=6394
```

Gateways are represented as geofences with non-null radius.

Use to determine the known/configured gateway inventory where needed.

Then compare configured gateways against observed telemetry gateways.

This is how the UI can distinguish:

- known gateway with traffic
- known gateway with no recent traffic
- telemetry gateway not present in local alias/config inventory

---

# 23. API mode vs Seed mode

Do not rewrite the application's entire data-source architecture.

Integrate with whatever seed/API switching mechanism the application already uses.

If the existing Command Center has no data provider abstraction, add a small feature-local provider:

```ts
interface CommandCenterDataSource {
  getGatewaySummary(...): Promise<...>;
  getMeterHealth(...): Promise<...>;
  getGatewayPerformance(...): Promise<...>;
  getFrames(...): Promise<...>;
  getKnownGateways(...): Promise<...>;
}
```

Implement:

```text
ApiCommandCenterDataSource
SeedCommandCenterDataSource
```

Do not scatter `if (seedMode)` throughout UI components.

---

# 24. Suggested component structure

Adapt to the framework already used by the application.

Do not put this entire feature in one file.

Example:

```text
features/
  command-center/
    pages/
      CommandCenterPage.*

    components/
      CommandCenterToolbar.*
      NetworkKpiStrip.*
      GatewayRail.*
      GatewayRailItem.*
      SelectedGatewayHeader.*
      GatewayTabs.*
      GatewayMetersTable.*
      GatewayFramesTable.*
      GatewayTrafficChart.*
      GatewayRadioHealth.*
      AllGatewayComparison.*
      MeterInspector.*
      MeterGatewayReception.*
      RecentMeterFrames.*
      FrameDetailDrawer.*
      LiveNetworkFeed.*
      HealthStatusChip.*

    data/
      commandCenter.api.*
      commandCenter.seed.*
      commandCenter.dataSource.*

    model/
      commandCenter.types.*
      commandCenter.adapters.*

    state/
      commandCenter.store.*
      commandCenter.selectors.*

    config/
      networkHealthThresholds.*

    utils/
      freshness.*
      radioQuality.*
      frameCounter.*
      gatewayOverlap.*
```

Use the project's existing naming conventions if different.

---

# 25. Command Center state

Keep a single predictable feature state.

Example:

```ts
interface CommandCenterState {
  siteIds: number[];
  timeWindow: '1H' | '6H' | '24H' | '7D' | 'CUSTOM';
  customFrom?: string;
  customTo?: string;

  selectedGatewayId?: string;
  selectedMeterId?: string;
  activeGatewayTab: 'METERS' | 'FRAMES' | 'TRAFFIC' | 'RADIO';

  gatewayFilter: 'ALL' | 'REPORTING' | 'DEGRADED' | 'STALE' | 'NO_TRAFFIC';
  meterFilters: MeterFilterState;

  autoRefresh: boolean;
  lastRefreshAt?: string;
}
```

Where practical persist in URL query parameters:

```text
/command-center?site=6394&window=24H&gateway=506f9800000002a5&tab=meters&meter=0025016559
```

This makes investigations shareable and refresh-safe.

---

# 26. Refresh strategy

Do not refetch every dataset at the same interval.

Recommended behavior:

### Every 30–60 seconds while page is visible

- gateway summary
- meter health
- current selected gateway latest frames first page

### Less frequently / on range change

- gateway performance history
- large historical traffic datasets

### On selection

- selected meter recent frames
- selected gateway frame list

### Important

- cancel stale requests when site/gateway/time range changes
- do not keep polling hidden tabs
- pause polling when browser tab is hidden if project patterns support it
- maintain last successful data during transient refresh errors

---

# 27. Loading, empty and error states

### Initial loading

Use skeletons in:

- KPI strip
- gateway rail
- selected gateway table

Avoid full-screen spinner after initial shell is visible.

### Empty site

Show:

```text
No meter telemetry was found for the selected site and period.
```

Do not show `0 households configured`.

### Known gateways but no telemetry

Show known gateways in left rail as `No recent traffic` / `Never observed`.

### API partial failure

If raw frame API fails but gateway summary works:

- keep gateway rail/KPIs that are valid
- show `Latest frames temporarily unavailable`
- do not blank the whole Command Center

---

# 28. Search behavior

Global search must support:

- exact/partial Gateway ID
- Meter ID
- DevEUI

### Gateway search result

Select the gateway and open `Meters`.

### Meter search result

If meter has latest gateway:

1. select latest gateway
2. select meter
3. open/update Latest Meter Info

If meter has no gateway in current window:

- open meter inspector with stale/silent state
- show last known gateway if available

Do not route to Household screen.

---

# 29. Visual language

Use current Cortex-W light styling.

Recommended status semantics:

- green = reporting / live / healthy
- amber = degraded / weak / stale
- red = no recent traffic / critical / silent
- blue = selected / informational
- gray = never observed / unavailable

Do not paint entire tables red or green.

Use status color as:

- small dot
- thin left border
- status chip
- compact icon

Keep IDs highly readable. Use monospace for:

- Gateway ID
- DevEUI
- DevAddr
- FCnt where useful

---

# 30. Table behavior

Gateway meters and latest frames tables can become large.

Requirements:

- sticky header
- compact row height
- server/cursor pagination for raw frames
- row virtualization if supported by current table library
- horizontal scroll rather than hiding critical telemetry columns
- resizable columns where current component library permits
- tooltip for long IDs
- copy actions
- no massive client-side `fetch all` for a 7-day range

---

# 31. Responsive behavior

Command Center is desktop-first.

For narrower width:

- Gateway Rail becomes slide-out drawer
- Latest Meter Info becomes right slide-over drawer
- center workspace remains primary
- tables scroll horizontally
- live feed can collapse under the center workspace

Do not convert gateway IDs and telemetry into giant mobile cards on desktop.

---

# 32. Performance requirements

- do not load the entire 7-day raw telemetry dataset into memory
- raw frames must use cursor/server pagination
- cache gateway summary independently of frame pages
- use memoized selectors for grouping frames by gateway/meter
- debounce search
- cancel old requests
- avoid recomputing all gateway statistics on every component render
- use stable row IDs
- no large telemetry transformation inside JSX/template markup

---

# 33. Implementation sequence for AntiGravity

Because the application already exists, modify in this order:

## Phase 1 — preserve shell

1. Locate existing Command Center route/page.
2. Keep existing app shell/navigation unchanged.
3. Reuse current page container and design tokens.

## Phase 2 — data layer

4. Add/clean Command Center-specific API service.
5. Add normalized telemetry types/adapters.
6. Add gateway/meter selectors.
7. Add network-health threshold config.
8. Connect seed/API source without affecting other modules.

## Phase 3 — page layout

9. Build top toolbar.
10. Build network KPI strip.
11. Build persistent Gateway Rail.
12. Build Selected Gateway workspace.
13. Build right Latest Meter Info panel.
14. Build bottom Live Network Feed.

## Phase 4 — gateway workspace

15. Meters tab.
16. Latest Frames tab.
17. Traffic tab.
18. Radio Health tab.
19. All-gateway comparison when selection is cleared.

## Phase 5 — drill-down

20. Meter inspector.
21. Recent meter frames.
22. Gateway reception path.
23. Frame detail drawer.
24. FCnt and gateway-change diagnostics.

## Phase 6 — polish

25. Auto refresh.
26. URL state.
27. loading/error/empty states.
28. virtualization/pagination.
29. test responsive behavior.
30. verify no household/billing KPIs remain in Command Center.

---

# 34. Acceptance tests

The Command Center modification is complete only when all of the following pass.

## Layout

- [ ] Existing Cortex-W shell remains unchanged.
- [ ] Main workspace is light mode.
- [ ] Gateway Rail is visible on desktop.
- [ ] Center is gateway-focused.
- [ ] Right panel is meter telemetry-focused.
- [ ] Live Network Feed exists.

## Network KPIs

- [ ] Shows gateways with traffic.
- [ ] Shows no-recent-traffic gateways.
- [ ] Shows unique meters seen.
- [ ] Shows frame count only when derivable.
- [ ] Shows last network frame.
- [ ] Shows multi-gateway meter count.
- [ ] Shows RSSI/SNR where available.
- [ ] Does not show household configured/onboarded/mapped KPIs.

## Gateway Rail

- [ ] Gateway status is based on telemetry freshness.
- [ ] Gateway row shows unique meters.
- [ ] Gateway row shows latest frame age.
- [ ] Search works.
- [ ] Health filtering works.
- [ ] Selecting a gateway updates center without navigation.

## Gateway Meters

- [ ] Lists meters heard by selected gateway.
- [ ] Shows latest RSSI/SNR.
- [ ] Shows FCnt/FPort/frequency/DR.
- [ ] Shows latest frame age.
- [ ] Multi-gateway state is visible.
- [ ] Clicking a meter opens right inspector.

## Latest Meter Info

- [ ] Shows latest gateway.
- [ ] Shows latest decoded time.
- [ ] Shows latest RSSI/SNR.
- [ ] Shows FCnt/FPort/DR/frequency.
- [ ] Shows gateway reception list.
- [ ] Shows latest 10–20 meter frames.
- [ ] Shows network diagnostic flags.
- [ ] Does not show household edit/billing actions.

## Latest Gateway Frames

- [ ] Newest frames are first.
- [ ] Auto refresh is supported.
- [ ] New rows are visually indicated subtly.
- [ ] Frame row can be inspected.
- [ ] Cursor/server pagination is used.
- [ ] No raw payload is fabricated.

## Traffic / Radio

- [ ] Traffic chart shows frame or meter flow, not consumption.
- [ ] Previous-period comparison works where data exists.
- [ ] RSSI/SNR distributions render.
- [ ] Radio thresholds come from configuration.

## Data correctness

- [ ] `decodedAt` is primary freshness clock.
- [ ] `meterTimestamp` is separate.
- [ ] No claim that gateway is physically powered off without heartbeat proof.
- [ ] `gateway-meter-summary` uses correct siteIds encoding.
- [ ] raw telemetry uses `endDate`, not `toDate`.
- [ ] gateway performance uses required date parameters.

## Modularity

- [ ] Command Center is not implemented in one giant page file.
- [ ] API/data transformations are separate from rendering.
- [ ] network thresholds are centralized.
- [ ] seed/API data providers are separated.
- [ ] changes do not break other Cortex-W modules.

---

# 35. Definition of done

The modification is successful when a network operator can open Command Center and, without visiting any consumer/household screen, do the following in under a minute:

1. See whether gateway traffic is flowing.
2. Identify gateways with no or reduced traffic.
3. Select a gateway.
4. See all meters heard by that gateway.
5. Select a meter.
6. Inspect its latest gateway, frame time, RSSI, SNR, FCnt and radio metadata.
7. See other gateways hearing the same meter.
8. Inspect the latest frames received through the gateway.
9. identify weak/stale/silent telemetry problems.
10. compare gateway traffic and radio health over time.

The final mental model must be:

```text
GATEWAY → METERS → FRAMES → RADIO / DATA FLOW HEALTH
```

not:

```text
HOUSEHOLD → CONFIGURATION → BILLING
```

That distinction is the core requirement of this Command Center modification.
