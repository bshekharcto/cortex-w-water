# Water Client — Frontend & API Reference

Complete reference of everything a **water client** sees in the Cognecto platform, and every backend
API behind it.

**Context for this document.** A new water-only product is being built as a **UI rebuild only** — the
backend stays exactly as it is today (`cog-core-api`, unchanged, shared with the existing platform).
So this document serves two purposes at once:

1. **What to build** — every water screen, what it shows, why a client uses it, and its controls.
2. **What you must build against** — the exact API contracts, plus how the backend actually behaves,
   including its quirks, inconsistencies and known bugs. Since the backend will not change, the new UI
   has to know and work around all of it. That is what [§10](#10-known-issues--gotchas-for-a-rebuild)
   is for — read it before writing any client code, not after.

- Existing frontend (reference implementation): `cog-web-app` (Angular 16, PrimeNG, ag-grid)
- Backend (fixed, do not assume changes): `cog-core-api` (Spring Boot 3, MySQL + AWS Timestream)

Where the existing frontend's TypeScript interfaces disagree with the backend DTOs, **the backend DTO
is authoritative** — the old frontend's types are partial and in places wrong. Every known mismatch is
listed in [§10](#10-known-issues--gotchas-for-a-rebuild).

---

## Table of contents

1. [Talking to the API](#1-talking-to-the-api)
2. [Shared DTOs](#2-shared-dtos)
3. [Water reports](#3-water-reports)
4. [Water dashboard](#4-water-dashboard)
5. [Household management](#5-household-management)
6. [Billing](#6-billing)
7. [Water map](#7-water-map)
8. [Meter (asset) detail](#8-meter-asset-detail)
9. [Endpoint index](#9-endpoint-index)
10. [Known issues & gotchas for a rebuild](#10-known-issues--gotchas-for-a-rebuild)
11. [Backend architecture — for when you need new APIs](#11-backend-architecture--for-when-you-need-new-apis)

---

## 1. Talking to the API

### 1.1 Two base URLs

The app talks to **two different URL roots** — this is essential and easy to miss.

| Config key | Dev value | Used for |
|---|---|---|
| `environment.baseUrl` | `http://localhost:8080/api` | Almost everything. Written below as `/api/...` |
| `environment.dataRestUrl` | `http://localhost:8080` | Spring Data REST resources. Written below as `{dataRest}/...` |

`{dataRest}` endpoints are auto-generated Spring Data REST resources (`/households/{id}`, `/bills/{id}`,
`/billingSlabs/{id}`, `/geofences/{id}`, `/assets/{id}`, `/householdDocuments/{id}`,
`/assetHouseholdImeiHistories/{id}`, `/assetDocuments/{id}`). They are used almost exclusively for
**PATCH and DELETE**, and they require **URI-reference bodies** instead of plain foreign-key ids:

```json
PATCH {dataRest}/households/42
{ "name": "New name", "site": "{dataRest}/site/7" }
```

Relations are sent as resource URLs, not ids: `site`, `household`, `assetClass`, `geofenceList`,
`imeiEdgeDevice`. Note the inconsistency in [§10](#10-known-issues--gotchas-for-a-rebuild): household
update uses singular `site/`, asset and geofence updates use plural `sites/`.

### 1.2 Authentication

- Stateless **JWT bearer token**: `Authorization: Bearer <token>` on every request.
- Get a token from `POST /api/auth/login` (public). The token comes back in a **response header** —
  both `Authorization` and `Jwt-Token` are CORS-exposed, so read it from there, not the body.
- Session policy is `STATELESS`, CSRF disabled. No cookies needed.
- `anyRequest().authenticated()` — **every endpoint in this document needs a valid token**, including
  ones with no `@PreAuthorize` (e.g. `/api/billing/latest-bill/{assetId}`, all `/api/auth/modules*`).
- A missing/expired token yields **401** via `JwtAuthenticationEntryPoint`.

### 1.3 Permissions

Method security uses `hasPermission('<SubModule>', '<LEVEL>')`, resolved against a cached permission
set for the JWT principal. A principal holding `"*"` passes everything.

A water-only client's role needs these sub-modules granted:

| Sub-module | Levels needed | Covers |
|---|---|---|
| `Water_Dashboard` | READ | all `/api/water/**`, `/api/module/water-*` |
| `Household` | READ, WRITE | all `/api/household/**` |
| `Billing` | READ, WRITE | all `/api/billing/**` |
| `Map` | READ, WRITE, DELETE | `/api/map/**` (geofences = gateways) |

**Site scoping is implicit.** Services derive the allowed site list from the caller's
`user_site_mapping` and intersect it with any `siteIds` you pass. Passing a site you cannot see
returns **empty results, not 403**.

### 1.4 Success responses — there is no envelope

`FunctionUtil.createSuccessResponse` returns the DTO as the raw body with `200 OK`:

```java
return new ResponseEntity<>(data, HttpStatus.OK);
```

So a `Page<T>` serializes as a Spring page object at the top level, a `List<T>` as a bare JSON array,
a `Map` as a bare object. There is **no** `{ data: ... }` / `success` / `responseCode` wrapper.

Three exceptions on the water surface:
- Some household endpoints return a `ResponseDTO` **as the DTO itself** (fields `responseCode`,
  `responseMessage`, `errorCode`, `errorMessage`, `data`) — that's the payload, not a framework wrapper.
- `GET /api/household/imei-history/{householdId}` uses `ResponseEntity.ok(...)` directly (same shape).
- `/api/module/water-summary` and `/api/module/water-daily-data` return bare `Map`s.

### 1.5 Error responses

Global `@RestControllerAdvice` (`ExceptionHandling`) returns an `HttpResponse`:

| Field | Type | Note |
|---|---|---|
| `httpStatusCode` | `int` | e.g. `400` |
| `httpStatus` | `String` | enum name, e.g. `"BAD_REQUEST"` |
| `reason` | `String` | reason phrase, **UPPER-CASED** |
| `message` | `String` | exception message, **UPPER-CASED** |
| `body` | `Object` | omitted when null |

> Both `reason` and `message` are upper-cased server-side. Don't render `message` verbatim to end users.

Exception → status, for exceptions these endpoints actually throw:

| Exception | Status | Typically triggered by |
|---|---|---|
| `BadRequestException` | 400 | page/size, date-range, and invalid-id guards |
| `InvalidDataException` | 400 | empty `propertyNameList` on dashboard endpoints |
| `UserNotFoundException` | 400 | principal not resolvable |
| `HouseholdCustomIdExistException` | 400 | duplicate `customId` + `siteId` on household create |
| `ConstraintViolationException` | 400 | `@Valid` failure — body is a bare `List<String>`, **not** `HttpResponse` |
| `DataIntegrityViolationException` | 400 | DB constraint — body is `{"error-type": "..."}`, **not** `HttpResponse` |
| `MaxUploadSizeExceededException` | 400 | oversized document upload |
| `AccessDeniedException` | 403 | `hasPermission(...)` false, or module without role access |
| `HouseholdNotFoundException` | 404 | household lookup miss |
| `SiteNotFoundException` | 404 | site scoping failure |
| `AssetNotFoundException` | 404 | meter/asset lookup miss |
| `AssetClassNotFoundException` | 404 | asset-class miss on imei/asset-connection |
| `CognectoException` | 404 | several household imei operations |
| `GeofenceNotFoundException` | 404 | gateway (geofence) operations |
| `NoResultException` | 404 | empty JPA single-result query |
| `EdgeDeviceNotFoundException` | **204** | unknown IMEI on imei-history create — treat as *not found*, **not** success |
| `NoContentFoundException` | **204** | empty report result set |
| `HttpRequestMethodNotSupportedException` | 405 | wrong verb (watch `/api/billing` vs `/api/billing/`) |
| `NullPointerException` | 500 | server bug |
| `Exception` (catch-all) | 500 | anything else, incl. Timestream failures |

**One endpoint bypasses the advice**: `POST /api/water/meter-replacement/print` returns its own
`{"error": "...", "message": "..."}` with 400 or 500.

### 1.6 Data sources

| Store | What lives there |
|---|---|
| **AWS Timestream** `iot.water_meter_telemetry`, `measure_name = 'water_meter_stats'` | All meter telemetry: readings, flow, battery, radio (RSSI/SNR), valve state, gateway id. Dimensions: `site_id`, `gateway_id`, `meter_id`, `time`. |
| **MySQL** | `household`, `asset`, `site`, `latest_meter_status`, `asset_household_imei_history`, `bill`, `bill_slab_mapping`, `billing_slab`, `billing_header`, `geofence`, alert tables, `module`/`sub_module`/`role_sub_module_mapping` (nav + permissions) |

`latest_meter_status` is a MySQL projection/cache of the newest telemetry row per meter — that's why
"latest status" and "meter health" are fast and don't hit Timestream.

### 1.7 The filter-query DSL

Most list endpoints accept a `query` string in the request body — a backtick-prefixed mini-language,
clauses joined by `::`:

```
`<field><<OPERATOR>:<JOIN>><value>
```

Examples actually used:

| Query | Meaning |
|---|---|
| `` `customId<CT:AN>H0012 `` | `customId` contains "H0012" |
| `` `imeiEdgeDevice.imeiNumber<CT:AN>8613 `` | meter IMEI contains "8613" |
| `` `household.customId<CT:AN>H1 `` | household id contains "H1" |
| `` `id<NIN:AN>[12,45] `` | id not in (12, 45) |
| `` `imeiEdgeDevice<NOTNULL:AN>null `` | has an edge device (i.e. is a real sensor) |
| `` `status<IN:AN>[SUCCESSFUL,MISSING] `` | status in list |
| `` `asset.household.customId:STRING<CT>x `` | typed variant used **only** by billing |

Operators seen: `CT` (contains), `IN`, `NIN` (not in), `NOTNULL`. `AN` is the and/any join token.
**Site filtering is not part of `query`** — it is always the separate `siteIds` array.

---

## 2. Shared DTOs

### 2.1 `PaginationReqDTO` (request)

```ts
{ page: number;          // 0-based
  size: number;          // >= 1
  sortBy?: string;       // "col:ASC::col2:DESC"
  search?: string;
  filters?: string[];
  query?: string;        // the DSL in §1.7
  siteIds?: number[] }
```

Some reports send `sorts: SortCriteria[]` instead of the `sortBy` string:
`SortCriteria = { sortBy: string; sortOrder: 'ASC' | 'DESC' }`.

### 2.2 `CursorPaginationReqDTO` (request)

```ts
{ size: number; cursor: string | null; query?: string;
  siteIds?: number[]; sorts?: SortCriteria[] }
```

### 2.3 `CursorPaginationResDTO<T>` (response)

```ts
{ content: T[]; nextCursor: string | null; hasMore: boolean; estimatedTotal: number }
```

### 2.4 `Page<T>` (response — Spring Data)

```ts
{ content: T[];
  pageable: { pageNumber, pageSize, sort: {empty,sorted,unsorted}, offset, paged, unpaged };
  totalElements: number; totalPages: number; size: number; number: number;
  numberOfElements: number; first: boolean; last: boolean; empty: boolean;
  sort: { empty, sorted, unsorted } }
```

### 2.5 `MeterWiseConsumptionDTO` (response) — **the one telemetry DTO**

All four cursor endpoints (`raw-data`, `meter-wise-consumption`, `site-wise-daily-consumption`) plus
`latest-meter-status` and `latest-meter-data` return **this same class**. It is annotated
`@JsonInclude(NON_NULL)`, so **each report receives a different subset of populated fields** — that is
why the frontend has three partial interfaces for it.

| Field | Type | | Field | Type |
|---|---|---|---|---|
| `meterId` | String | | `startReading` | Double |
| `date` | LocalDate | | `endReading` | Double |
| `consumption` | Double | | `avgConsumption` | Double |
| `currentReading` | Double | | `applicationId` | String |
| `reverseFlow` | Double | | `applicationName` | String |
| `forwardFlowL` | Double | | `deviceProfileId` | String |
| `batteryVoltage` | Double | | `deviceProfileName` | String |
| `batteryStatus` | String | | `deviceName` | String |
| `batteryHealth` | String | | `devEui` | String |
| `signalStrength` | Double | | `devAddr` | String |
| `signalQuality` | Double | | `measureName` | String |
| `rssi` | Double | | `fPort` | Long |
| `snr` | Double | | `fCnt` | Long |
| `valveStatus` | Boolean | | `dr` | Long |
| `valveClosed` | Boolean | | `frequency` | Long |
| `valveHealth` | String | | `confirmed` | Boolean |
| `checksumStatus` | String | | `adr` | Boolean |
| `statusByte` | Double | | `activeMeters` | Long |
| `meterTimestamp` | String | | `assetId` | String |
| `decodedAt` | OffsetDateTime | | `householdId` | String |
| `tenantId` | String | | `siteId` | String |
| `tenantName` | String | | `siteName` | String |
| `gatewayId` | String | | `lastSeen` | String |

> Note `reverseFlow` has **no** `L` suffix while `forwardFlowL` does. The frontend interface gets this
> backwards — see [§10](#10-known-issues--gotchas-for-a-rebuild).

### 2.6 `AttachmentDTO`

```ts
{ documentId?: number; name: string; category: string; expirationDate?: string;
  s3BucketURL: string; uploadDateTime: string; deleteDateTime?: string; imageBytes?: string }
```

Categories in use: `DOCUMENT` (household docs), `OLD_METER_DOCUMENT` (meter-replacement evidence).

---

## 3. Water reports

All report routes are children of `report/home`, so the full URL is `/report/home/<path>`.
Every `/api/water/**` endpoint requires `hasPermission('Water_Dashboard','READ')`.

Report menu visibility is **server-driven**: `GET /api/auth/modules/{module-id}` returns the
sub-module tree, and each entry's `subModulePath` is the frontend route to render. See [§4.2](#42-nav--menu-visibility).

### 3.1 Consumption Report

- **Route** `consumption-report`
- **Purpose** Site-level daily roll-up: one row per site per day with total consumption (KL) and the
  number of active meters that contributed. The coarsest water view — used to watch daily district
  demand and to spot days where consumption dropped only because meter reporting dropped.
- **Columns** Date · Site · Consumption · Active Meters
- **Controls** Site tree-select · date range (default 30 days) · cursor pagination · no export

```
POST /api/water/site-wise-daily-consumption/cursor?fromDate=YYYY-MM-DD&endDate=YYYY-MM-DD
body: CursorPaginationReqDTO   → CursorPaginationResDTO<MeterWiseConsumptionDTO>
```
Populated fields: `siteId`, `siteName`, `date`, `consumption`, `activeMeters`.
Source: Timestream.

> The query param is `endDate`, not `toDate`. Several water endpoints use `endDate`; others use
> `toDate`. Check per endpoint.

### 3.2 Daily / Aggregate Water Consumption Report

Two routes, one component, one endpoint, switched by a flag.

- **Routes** `daily-water-report` (`isDailyReport=true`) · `cumulative-water-report` (`isDailyReport=false`)
- **Purpose** Per-meter consumption. *Daily* = one row per meter per day (audit a single connection
  day by day). *Aggregate* = one row per meter for the whole range (per-connection totals for a
  billing/period reconciliation).
- **Columns** daily: Date · Meter ID · Household ID · Site · Consumption (L) · Current Reading (KL) —
  aggregate: same minus Date, plus Start Reading · End Reading
- **Controls** Site tree-select · Meter ID · Household ID · date range (default 30 days) · cursor
  pagination · no export

```
POST /api/water/meter-wise-consumption/cursor
     ?fromDate=YYYY-MM-DD&endDate=YYYY-MM-DD&isDailyReport=<bool>
body: CursorPaginationReqDTO   → CursorPaginationResDTO<MeterWiseConsumptionDTO>
```
Populated: `date`, `meterId`, `householdId`, `siteName`, `consumption`, and
`currentReading` (daily) / `startReading` + `endReading` (aggregate). Source: Timestream + MySQL `asset`.

### 3.3 Water Meter Reading Report

- **Route** `water-meter-reading-report`
- **Purpose** A slim reading register — the same feed as Raw Data but with `rawReport=false`, i.e. the
  cleaned reading view without the telemetry noise. Used for meter-reading verification and to hand a
  simple reading list to billing/audit.
- **Columns** Date · Meter Id · Household Id · Site · Current Reading (`forwardFlowL`, KL)
- **Controls** Site tree-select · Meter ID · Household ID · date range (default 30 days) · cursor
  pagination · no export

```
POST /api/water/raw-data/cursor?fromDate=YYYY-MM-DD&endDate=YYYY-MM-DD&rawReport=false
body: CursorPaginationReqDTO   → CursorPaginationResDTO<MeterWiseConsumptionDTO>
```
Source: Timestream.

### 3.4 Water Meter Raw Data Report

- **Route** `water-meter-raw-data-report`
- **Purpose** The full decoded LoRaWAN packet stream — 30+ columns covering readings, device health
  (battery, valve), radio quality (RSSI, SNR, DR, frequency, f-port, f-cnt, confirmed, ADR), payload
  integrity (checksum, status byte, meter timestamp vs decoded-at) and network identity (gateway,
  tenant, application, device profile, DevEUI, DevAddr). **This is the diagnostic report**: prove
  whether a meter is transmitting, whether the radio link is degrading, and whether bad readings come
  from checksum failures or a stuck valve.
- **Controls** Site tree-select · Meter ID · Household ID · date range · cursor pagination (page size
  100) · **Excel export**

```
POST /api/water/raw-data/cursor?fromDate=YYYY-MM-DD&endDate=YYYY-MM-DD&rawReport=true
body: CursorPaginationReqDTO   → CursorPaginationResDTO<MeterWiseConsumptionDTO>   (all fields)

POST /api/water/raw-data/export?siteId=<long>&date=YYYY-MM-DD
body: {}                        → byte[] XLSX
     Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

> The export is deliberately **one site, one day** and does *not* reuse the grid's filters. The UI
> collects them in a separate modal.

Source: Timestream (both).

### 3.5 Latest Meter Status Report

- **Route** `latest-meter-status-report`
- **Purpose** One row per meter with its most recent state — no date filter at all, always "as of now".
  The daily silent-meter worklist: sort by Last Seen ascending to get meters that stopped reporting.
  Blank `lastSeen` renders as a red **"Never Seen"**.
- **Columns** Last Seen · Meter Id · Household Id · Site · Current Reading (`endReading`, KL)
- **Controls** Site tree-select · Meter Id · Household Id · **page-number pagination** (not cursor) ·
  no date picker · no export

```
POST /api/water/latest-meter-status/page
body: PaginationReqDTO (sortBy as string form)   → Page<MeterWiseConsumptionDTO>
```
Sortable columns: `decoded_at` (Last Seen), `meter_id`, `end_reading`.
Source: MySQL `latest_meter_status`, falling back to `asset` when empty.

### 3.6 New Meter Daily Work Report (meter replacement)

- **Route** `meter-replacement-report` (displayed as "New Meter Daily Work Report")
- **Purpose** The field-crew work log for meter swaps and new connections. Verify contractor
  productivity per day, reconcile old-vs-new readings at changeover, and open installation photos as
  proof of work. Also shows a running "records till date" count independent of the date filter.
- **Columns** Date of Work · Created By · Household Id · Consumer Name · Address · Mobile · Ward ·
  Old Meter No + Reading · New Meter No + Reading · Documents · Meter Status (colour-coded)
- **Controls** Site tree-select · Household Id · **Meter Status multi-select** · Consumer Name · Old
  Meter No · New Meter No · Created By · date range (default 7 days, clearable) · page-number
  pagination · **PDF export** (date-filtered, or "Full report" with no dates)

```
POST /api/water/meter-replacement-report/page?fromDate=&toDate=      (dates optional)
body: PaginationReqDTO             → Page<MeterReplacementReportDTO>

POST /api/water/meter-replacement-report/total-count
body: PaginationReqDTO (optional; only siteIds read)   → {"totalRecords": <long>}

POST /api/water/meter-replacement/print?fromDate=&toDate=            (dates optional)
body: PaginationReqDTO with size:0 = "all rows"        → byte[] PDF
```

**`MeterReplacementReportDTO`**
```ts
{ householdId: string; mobile: string; consumerName: string; siteName: string;
  address: string; oldMeterNo: string; oldMeterReading: number;
  newMeterNo: string; newMeterReading: number; dateOfWork: string;
  status: 'NEW_CONNECTION'|'ALREADY_REMOVED'|'MISSING'|'SUCCESSFUL'|'OTHERS';
  description: string; alertId: number; assetId: number; ward: string;
  alertAttachments: AttachmentDTO[]; historyAttachments: AttachmentDTO[];
  createdBy: string; createdDate: string; updatedBy: string; updatedDate: string }
```
Source: MySQL `asset_household_imei_history` joined to `household`, `site`, `alert`.

> `print` handles its own errors: 400 `{"error":"Report Generation Failed", ...}` or 500
> `{"error":"Internal Server Error", ...}` — not the standard `HttpResponse`.

### 3.7 Water Executive Summary

- **Route** `water-exec-summary`
- **Purpose** A print-styled, single-day executive brief across **all** of the user's sites:
  installation cards (households onboarded, meters configured, households mapped), supply cards
  (consumption, active meters, average per household, meters with no supply + %), a 7-day consumption
  trend, narrative insight cards, and the day's meter replacements. The board-level handout.
- **Controls** **no site picker** (always all visible sites) · single-date picker · client-side PDF

```
POST /api/water/executive-summary?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD   (both required)
body: PaginationReqDTO (siteIds used for scoping)     → WaterDashboardResDTO

POST /api/water/site-wise-daily-consumption/cursor    (7-day trend; size 10000, unpaged)
```

**`WaterDashboardResDTO`**
```ts
{ householdsOnboarded: number; metersConfigured: number; householdsMapped: number;
  meterReplacementsYesterday: number; criticalAlerts: number;
  openMaintenanceRequests: number; closedMaintenanceRequests: number;
  topAlertTypes: { name: string; count: number }[];
  alerts: { createdDate: string; alertDescription: string; meterId: string;
            householdId: string; siteName: string; priority: string; alertStatus: string }[];
  meterReplacements: MeterReplacementReportDTO[];
  region: string; fromDate: string; toDate: string }
```

Source: MySQL only (`household`, `asset`, alert tables, `asset_household_imei_history`).
Consumption/active-meter figures on this screen are computed **client-side** by summing the trend rows
for the anchor date; "meters with no supply" = `householdsMapped − activeMeters`.
PDF is generated client-side (html2canvas + jsPDF) — **no export endpoint**.

> The `alerts` and `topAlertTypes` panels are currently commented out in the UI, so those two fields
> are fetched but unused.

### 3.8 Gateway Health Report

- **Route** `gateway-health-report`
- **Purpose** A map + table + chart console for LoRa network health. Plots every meter as a clustered
  dot coloured by whether it transmitted in the **last 36 hours** (Active / Not Active). Select a
  gateway and an inspect radius to scope the summary to meters in that circle, and split active meters
  inside the radius into "reporting to this gateway" vs "reporting to another gateway". Used to decide
  whether silent meters are a *meter* problem or a *gateway coverage* problem.
- **Views** Map · Table · Performance (per-gateway daily active-meter chart)
- **Controls** meter search · gateway dropdown · inspect radius (1–50 000 m) · "Problems only" toggle ·
  fullscreen. Performance view has its own date range; map/table have **no date filter** (always
  "last 36 hours"). **No site picker** — loads all sites.

```
GET /api/map/asset-locations                          → { [assetId]: SensorRawDataDTO }
GET /api/water/meter-health?siteIds=..&siteIds=..      → MeterHealthDTO[]
GET /api/map/geofence                                  → GeofenceDTO[]   (radius != null ⇒ gateway)
GET /api/water/gateway-performance?siteIds=&fromDate=&toDate=   → GatewayPerformanceDTO[]
GET /api/water/meter-image/{assetId}                   → AttachmentDTO[]
```

```ts
MeterHealthDTO      { assetId: number; meterId: string; householdId: string; gatewayId: string;
                      lastSeenDate: string; decodedAt: string; rssi: number;
                      batteryStatus: string; timeZone: string }
GatewayPerformanceDTO { gatewayId: string; date: string; activeMeterCount: number }
SensorRawDataDTO    { timestamp: string; latitude: number; longitude: number;
                      vehicleStatus: string; altitude: string; siteId: number }
```

`asset-locations` returns **all** asset types, so intersect it with `meter-health` on `assetId` to keep
only meters — that pairing is the documented approach. Meters at (0,0) or with no position are faulty
installs and are dropped. `fromDate`/`toDate` on `gateway-performance` are **required**.

Sources: `meter-health` → MySQL `latest_meter_status`; `gateway-performance` → Timestream;
`meter-image` → MySQL `asset_household_imei_history` → linked alert attachments.

### 3.9 Gateway Placement Report

- **Route** `gateway-placement-report`
- **Purpose** A **planning tool**, not a historical report. Pick a site, a target gateway count and a
  coverage radius; the backend clusters that site's meters and returns recommended gateway positions
  with coverage scores. The map draws recommendations + coverage circles + meters (covered/uncovered) +
  existing gateways. Used to size and site new gateways before buying hardware.
- **Controls** Site dropdown · gateway count · coverage radius · **Generate button** (nothing loads
  until pressed) · layer toggles · no date filter · no pagination · no export

```
POST /api/map/gateway-placement/compute
body: { siteId: number; gatewayCount: number; coverageRadiusM: number }
  → { siteId: number; totalMeters: number; totalMetersCovered: number;
      excludedMeterCount: number; excludedAssetIds: number[];
      gateways: { gatewayNumber: number; latitude: number; longitude: number;
                  metersAssigned: number; metersCoveredCount: number;
                  avgDistanceM: number; maxDistanceM: number;
                  coverageScore: number; assignedAssetIds: number[] }[] }

GET /api/map/asset-locations?siteIds={siteId}
GET /api/map/geofence?siteIds={siteId}
```

The "before" baseline (what % the *currently installed* gateways already cover at their own radii) is
computed **client-side** with haversine — no endpoint.

### 3.10 Gateway-wise Unique Meter Summary

- **Route** `gateway-meter-summary-report`
- **Purpose** For the selected sites and date range, how many **distinct** meters each gateway heard
  from, as a sorted bar-in-cell table plus headline totals. Because a meter can be picked up by several
  gateways, the per-gateway sum exceeds the unique total — that gap is the overlap/redundancy
  indicator. Used to judge gateway load balance and to catch a gateway whose meter count collapsed.
- **Controls** Site multi-select (top-level sites only; fires on overlay close **only if the selection
  changed**) · date range (default trailing 7 days) · auto-refetch, no Generate button ·
  **client-side JPEG export**

```
GET /api/water/gateway-meter-summary?siteIds=1,2,3&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
  → { totalUniqueMeters: number; gatewayCount: number; metersOnMultipleGateways: number;
      perGateway: { gatewayId: string; uniqueMeterCount: number }[] }
```

All params optional; **omitting the dates defaults to the trailing 7 days in the site's time zone**.
Note `siteIds` here is a **comma-joined string**, unlike `meter-health`/`gateway-performance` which use
repeated `?siteIds=1&siteIds=2`. Source: Timestream (two queries — per-gateway `COUNT(DISTINCT
meter_id)`, plus a CTE for the overlap count).

### 3.11 Household Meter Details (lookup, no dedicated route)

Consumer/meter drill-down used for support enquiries:

```
POST /api/water/household-meter-details
body: { searchType: 'CONSUMER_ID' | 'METER_NUMBER';   // required
        value: string; fromDate: string; toDate: string }   // all required
  → { consumerId; consumerName; siteName; address; fromDate; toDate;
      meters: { meterNumber; replacedFrom; replacedBy; replacementDate;
                startReading; endReading; totalConsumption;
                dailyReadings: { date; reading; consumption }[] }[] }
```
Source: MySQL `household`/`asset`/`asset_household_imei_history` + per-day readings from Timestream.

### 3.12 Report endpoints not used by any screen

- `POST /api/water/meter-daily-reading/cursor` — a `ReportService` method exists, **no component calls it**.
- `GET /api/water/latest-meter-data/{assetId}` → single `MeterWiseConsumptionDTO`; used only by the
  water map info window ([§7](#7-water-map)).

---

## 4. Water dashboard

### 4.1 The screen

- **Route** `/fleet/home` — the water dashboard is **not its own route**. `DashboardHostDirective`
  maps `componentMap['Fleet'][<submodule name containing "dashboard">] → WaterDashboardComponent`, so
  **the backend decides** that a tenant gets the water dashboard.
- **Layout** A month picker at the top; a left column of selectable stat tiles; a right panel with one
  big value card and a 30-day line chart. Clicking a tile loads that metric's daily trend into the
  chart. A collapsible meter tree sits above but is **not** wired into the summary requests.

**The tile set is entirely backend-driven** — there are no hard-coded water tiles. Each
`childSubModules[]` entry from `GET /api/auth/modules/{module-id}` becomes one tile:

| UI element | Fed by |
|---|---|
| Tile title | `subModuleParamName` — **this same string is the `propertyName` sent to the summary/chart APIs** |
| Tile icon | `icon` |
| Tile sub-description | `subModuleItem.chartSubTitle` |
| Tile colours | `subModuleItem.theme` → a client-side theme map (`blue`,`teal`,`green`,`red`,`purple`,`gray`,`yellow`) |
| Tile value | `water-summary` → `res[title].value` |
| Tile unit | `subModuleItem.unitType` |
| Tile footer | literal "Last Updated" + `res[title].lastUpdated` humanised ("Just Now", "2d 3hr ago") |
| Chart series | `water-daily-data` response, used directly as date-keyed values |
| Trend arrow | **hard-coded `'UP'`** — not from the API |

```
POST /api/module/water-summary
body: { propertyNameList: string[]; startDate: string; endDate: string }
  → { [propertyName]: { value: string; lastUpdated: string } }

POST /api/module/water-daily-data
body: { propertyNameList: string[];   // exactly one element = the selected tile
        startDate: string; endDate: string }
  → { [dayLabel: string]: number }    // e.g. { "03 Sep": 412 }, insertion-ordered
```

- `startDate`/`endDate` must be **ISO-8601 zoned/offset timestamps** (e.g.
  `2026-09-01T00:00:00.000+05:30`), not plain dates — they're parsed with `ZonedDateTime.parse`.
- Valid `propertyNameList` values: `"Total Households"`, `"Active Meters"`, `"Water Consumption"`,
  `"Average Consumption"` (case-insensitive; **unknown labels are silently dropped**).
- Empty/null `propertyNameList` → 400.
- Both return **bare maps**, not `createSuccessResponse`.
- Source: `Total Households` → MySQL `household`; the rest → Timestream aggregated on
  `forward_flow_kl` per `meter_id`.

> The rich KPI/alert panel is `POST /api/water/executive-summary` ([§3.7](#37-water-executive-summary)),
> not this controller.

### 4.2 Nav / menu visibility

```
GET  /api/auth/modules                      → { [group]: ModuleDTO[] }
GET  /api/auth/modules/{module-id}?configVisibleOnly=false
                                            → { [group]: SubModuleDTO[] }
GET  /api/auth/sub-modules/favourite        → ModuleDTO[]
POST /api/auth/sub-modules/favourite        body SubModuleDTO (subModuleParamId)  → ModuleDTO[]
PATCH /api/auth/modules/{module-id}/update-submodule-preference
      body [{ subModuleParamId: number; isPreferred: boolean }]  → { [status]: string }
```

```ts
ModuleDTO    { moduleId; moduleName; modulePath?; sequenceNumber; moduleIconPath;
               moduleType; moduleTypeId; subModules: SubModuleDTO[];
               isMobile?; subModuleCount? }
SubModuleDTO { subModuleId; subModuleParamId; sequence; icon; subModuleParamName;
               subModuleType; subModulePath?; isPreferred; isPopup; isPasscodeProtected;
               childSubModules?: SubModuleDTO[];   // recursive
               subModuleItem?: SubModuleItemDTO; isFavourite?;
               permissionLevel: 'READ'|'WRITE'|'DELETE' }
SubModuleItemDTO { id; name; assetClass; unitLabel; chartSubTitle; unitType;
                   isChartItemSensorConfigured; theme; dashboardChartTags; dataKeys }
```

- The path variable is **`module-id` with a hyphen**.
- No `@PreAuthorize`, but the handler calls `hasRoleAccess(moduleId)` → **403** if the role lacks it.
- `subModulePath` is the frontend route to render; `permissionLevel` says whether to show it read-only.
- This is exactly how a new report gets into the menu: a `sub_module` + `sub_module_params` row (with
  `path` matching the frontend route) + `role_sub_module_mapping` rows per role.

---

## 5. Household management

Household is the **water customer** entity. All endpoints need `Household` READ/WRITE except one noted.

- **List route** `/configuration/home/household`
- **Detail route** `/configuration/home/household/:id` — `:id` is a numeric id **or the literal `new`**
- **Tabs** Details · Configuration (meter assignment) · Documents. Tabs 2–3 are disabled until the
  household exists.

**Screens.** The list is an infinite-scroll grid (Household Id, Name, Address, Site, Registration Date,
Status, actions) with a debounced search on `customId`, a New button, a bulk-QR button, and a site
filter. Delete fires immediately with **no confirm dialog**. The Details tab is a 15-field form with a
QR code rendered from `customId` (client-side PNG download). The Configuration tab is the meter (IMEI)
history grid with an add/edit dialog for old-meter readings and S3 file attachments. The Documents tab
lists attachments with upload via pre-signed S3 URLs. A left sidebar shows an infinite card list.

### 5.1 `HouseholdDTO`

```ts
{ id: number;
  customId?: string;          // customer id, QR payload, primary search key
  name: string;               // required
  location: string;           // required — address
  pinCode: string;            // required
  status: string;             // required — 'ACTIVE' | 'INACTIVE'
  registrationDate: string;   // required
  countryCode: string;        // required — default '+91'
  mobile: string;             // required
  siteId: number;             // required
  assetId?: number;
  email?: string;
  siteName?: string;
  createdBy?: string;
  zone?: string;
  locality?: string;
  ward?: string;
  aadharNo?: string;          // client-validated /^\d{12}$/
  dma?: string;               // District Metered Area
  guardianName?: string;
  guardianRelation?: string;  // 'S/O' | 'D/O' | 'W/O' | 'C/O'
  attachments?: AttachmentDTO[] }
```

### 5.2 `AssetHouseholdImeiHistoryDTO` — the meter↔household link

```ts
{ id?: number; oldImeiNumber?: string; oldMeterReading?: number;
  newImeiNumber?: string; newMeterReading?: number;
  assetId?: number; assetName?: string; householdId?: number;
  uninstalledDate?: string; comment?: string;
  status?: 'NEW_CONNECTION'|'ALREADY_REMOVED'|'MISSING'|'SUCCESSFUL'|'OTHERS';
  attachments?: AttachmentDTO[]; latitude?: number; longitude?: number; alert?: AlertDTO }
```

### 5.3 Endpoints

| Method + path | Perm | Body / params | Response |
|---|---|---|---|
| `POST /api/household/page` | Household READ | `PaginationReqDTO` | `Page<HouseholdDTO>` |
| `POST /api/household` | Household WRITE | `HouseholdDTO` (`@Valid`) | `HouseholdDTO` |
| `GET /api/household/{id}` | Household READ | path `id` | `HouseholdDTO` |
| `GET /api/household/user/{userId}` | Household READ | path `userId` | `HouseholdDTO[]` |
| `POST /api/household/by-ids` | Household READ | bare `number[]` | `HouseholdDTO[]` |
| `PATCH {dataRest}/households/{id}` | — | dirty fields + `site` URI ref | `HouseholdDTO` |
| `DELETE /api/household/{id}` | Household WRITE | path `id` | `{ success: string }` |
| `POST /api/household/imei-history` | Household WRITE | `AssetHouseholdImeiHistoryDTO` | same DTO |
| `POST /api/household/imei-history/update` | Household WRITE | same DTO (`id` required) | same DTO |
| `GET /api/household/imei-history` | Household READ | `householdId` **or** `assetId` — exactly one | `AssetHouseholdImeiHistoryDTO[]` |
| `GET /api/household/imei-history/{householdId}` | Household READ | path | `AssetHouseholdImeiHistoryDTO[]` (bare `ResponseEntity.ok`) |
| `POST /api/household/imei-history/asset-selection` | Household WRITE | DTO (`id` + `assetId`) | `ResponseDTO` |
| `DELETE /api/household/imei-history/{id}` | Household WRITE | path `id` | `ResponseDTO` |
| `DELETE {dataRest}/assetHouseholdImeiHistories/{id}` | — | path `id` | DTO |
| `POST /api/household/asset-connection` | Household WRITE | DTO + optional lat/long + optional alert | `ResponseDTO` |
| `PUT /api/household/imei-history/alert` | **Water_Dashboard READ** | `AlertDTO` (`alertId`) | `ResponseDTO` |
| `POST /api/household/document-upload` | Household WRITE | whole `HouseholdDTO` with new `attachments` | `HouseholdDTO` |
| `GET /api/household/image-pre-signed-url` | Household WRITE | `householdId`, `fileName` | `{ householdId, fileName, s3Key, preSignedUrl }` |
| `DELETE {dataRest}/householdDocuments/{id}` | — | path `id` | `HouseholdDTO` |
| `GET /api/asset/household/{householdId}` | — | path | `IAsset[]` (assets available for this household) |

Notes:
- `POST /api/household/asset-connection` is **the meter↔household linkage endpoint**: it writes the
  imei-history row, updates the asset (household link, lat/long) and creates an alert. Validation:
  `assetId` valid; lat ∈ [-90,90], lon ∈ [-180,180] if present; if `alert` is present its `alertType`
  is mandatory.
- `PUT /api/household/imei-history/alert` uses `Water_Dashboard READ`, not `Household WRITE` — an
  inconsistency, but that's the contract.
- `POST /api/household/imei-history` can return **204** (`EdgeDeviceNotFoundException`) for an unknown
  IMEI. Treat 204 as "not found", not success.
- Duplicate `customId` + `siteId` → 400 `HouseholdCustomIdExistException`.
- **Document upload is a 3-step flow**: `GET image-pre-signed-url` → `PUT` the file straight to S3
  (external, `Content-Type: file.type`) → `POST document-upload` with the metadata.
- **There is no bulk/CSV household upload** anywhere in the API or the UI. The only "bulk" feature is a
  client-side ZIP of QR codes.

---

## 6. Billing

- **Route** `/configuration/home/billing` — all sub-screens are modals, not routes.
- **Screens.** The list is an infinite-scroll grid of generated bills (Bill ID, Household Name,
  Household ID, Date, Due Date, Amount, Consumption, Region, Status, view/download/delete) with a
  household-id search and a 30-day-default date filter. **Generate New Bill** searches a meter by IMEI,
  auto-fills site/household, prefills Previous Reading from the last bill, and enforces
  `endDate > startDate` and no overlap with the previous billing period. **Billing Slab Management** is
  a site-scoped, inline-editable grid of slabs plus a second grid of percentage-based additional
  charges. **View Bill** renders a printable bill (client-side html2canvas → jsPDF A4).

### 6.1 DTOs

```ts
BillDTO { id; customId; date; dueDate; startDate; endDate; amount;
          prevReading; currentReading; status; siteId; assetId; siteName;
          householdName; householdCustomId; address; meterId;
          billCharges: BillSlabMappingDTO[] }

BillSlabMappingDTO { id; chargeName; type; rate; amountCharged }
          // type: 'SLAB' | 'ADDITIONAL_CHARGES'

BillingSlabDTO { id; slabName; minConsumption; maxConsumption; ratePerKL;
                 fixedCharge; status; siteId; type;
                 createdBy; createdDate; updatedBy; updatedDate }
          // all of slabName..siteId are @NotNull on create
          // maxConsumption null ⇒ unbounded (rendered as ∞)
          // ratePerKL = ₹/kL for SLAB, percent for ADDITIONAL_CHARGES
```

### 6.2 Endpoints

| Method + path | Perm | Body / params | Response |
|---|---|---|---|
| `POST /api/billing` (no slash) | Billing **READ** | `PaginationReqDTO`; `startDate?`, `endDate?` (`yyyy-MM-dd`) | `Page<BillDTO>` |
| `POST /api/billing/` (**trailing slash**) | Billing WRITE | `BillDTO` | `BillDTO` |
| `GET /api/billing/latest-bill/{assetId}` | **none** (auth only) | path `assetId` | `BillDTO` |
| `POST /api/billing/slabs` | Billing WRITE | `BillingSlabDTO` (`@Valid`) | `BillingSlabDTO` |
| `GET /api/billing/slabs` | Billing READ | `siteIds` varargs (repeat the param) | `BillingSlabDTO[]` |
| `GET /api/billing/header/{siteId}` | Billing READ | path `siteId` | `{ headerTitle, headerSubtitle }` or `{}` |
| `PATCH {dataRest}/billingSlabs/{id}` | — | partial slab (**without** `siteId`) | `BillingSlabDTO` |
| `DELETE {dataRest}/billingSlabs/{id}` | — | path `id` | `BillingSlabDTO` |
| `DELETE {dataRest}/bills/{id}` | — | path `id` | `BillDTO` |
| `POST /api/asset/query` | — | `{page,size,query:'`imeiEdgeDevice.imeiNumber<CT:AN>…'}` | `Page<IAsset>` (meter search) |

> `POST /api/billing` and `POST /api/billing/` are **two different routes** — list vs create. Getting
> the trailing slash wrong yields **405**.
> `GET /api/billing/latest-bill/{assetId}` has **no permission check** — any authenticated user can
> read any asset's latest bill. Worth tightening in a rebuild.
> `BillingSlabDTO.id` is a **string** on the frontend but a `long` on the backend.

### 6.3 Consumption → bill flow

The frontend **never computes money**:

1. Meter readings live in Timestream / `latest_meter_status`; history in `asset_household_imei_history`.
2. `GET /api/billing/latest-bill/{assetId}` seeds `prevReading` and `minBillDate` (= last `endDate` + 1 day).
3. The user supplies `currentReading`, `startDate`, `endDate`.
4. `POST /api/billing/` prices it server-side from `billing_slab` for the asset's site and returns
   `amount` + expanded `billCharges[]`.

Only display arithmetic is client-side: `currentReading − prevReading` for the Consumption column and
the printed bill.

---

## 7. Water map

- **Route** `/water-map` (a separate `/map` route exists for fleet — not water)
- **Screen.** A full-bleed Google Map plotting every water meter as a small coloured dot — blue when
  `vehicleStatus === 'A'` (Normal), amber otherwise (Critical) — clustered via SuperCluster. Above 300
  locations and zoom ≥ 16, only the 300 markers inside the viewport are rendered. Clicking a meter
  opens an info window (skeleton first, then two parallel fetches) with meter name, status chip,
  Customer ID, Current Reading (KL), lat/long, **the three nearest gateways with haversine distance and
  an IN RANGE / OUT badge**, and the reading timestamp.
- **Gateways** are geofences with a non-null `radius`, drawn as a circle + teardrop pin, with full CRUD
  (name, address, radius, lat, long, site, area type) from a sidebar.
- The right-hand filter sidebar filters **already-loaded** locations client-side by site and status —
  no refetch.

```
GET    /api/map/asset-locations                → { [assetId]: SensorRawDataDTO }
GET    /api/water/latest-meter-data/{assetId}  → MeterWiseConsumptionDTO   (reads meterId,
                                                  currentReading, date; errors swallowed to null)
GET    /api/asset/{assetId}                    → IAsset  (reads name, household.customId)
POST   /api/asset/query                        → Page<IAsset>  (meter search by name)
GET    /api/map/geofence                       → GeofenceDTO[]
POST   /api/map/geofence          (Map WRITE)  body GeofenceDTO             → GeofenceDTO
POST   /api/map/quick-geofence    (Map WRITE)  body GeofenceDTO             → GeofenceDTO
PATCH  {dataRest}/geofences/{id}               body changed keys + `site` URI ref → GeofenceDTO
DELETE /api/map/geofence/{id}     (Map DELETE) → { [key]: string }
POST   /api/map/waterAssetsLocation (Map WRITE) body SensorRawDataReqDTO    → { [key]: string }
POST   /api/map/assetLocation      (Map WRITE) body AssetLocationUpdateReqDTO → { [key]: string }
```

```ts
GeofenceDTO { id?; name; address?; radius?; type; color?; siteId; assetId?;
              geofenceTimings?: { id?; type; startTimestamp; endTimestamp }[];
              geofenceCoordinates: { latitude; longitude }[];
              assetList?: number[]; isDisabled; outAlertEnabled }
```

`geofenceCoordinates[0]` is the gateway centre. `POST /api/map/waterAssetsLocation` is the
water-specific bulk write that sets lat/long on meter asset rows.

---

## 8. Meter (asset) detail

The asset screens are generic across fleet and water; the water-specific parts are gated at runtime.

- **List** `/configuration/home/assets` · **Detail** `/configuration/home/assets/detail`
- ⚠ **The detail route has no id** — the selected asset comes from the NgRx store, so a specific meter
  cannot be deep-linked. Worth fixing in a rebuild.

**The water-tenant flag** is: at least one of the user's sites has `type === 'water'` (case-insensitive,
from `GET /api/site/?allSites=false`). When true, three water-only behaviours activate:

1. **Household assignment** — an Associations card with a lazy, searchable household dropdown scoped to
   the asset's own site, excluding already-listed households via `` `id<NIN:AN>[...] ``.
2. **Meter replacement audit** — on save, if `imeiNumber` changed, an imei-history row is created
   automatically with old + new IMEI and the final old-meter reading pulled from **asset tag
   `tagId === 163`** (a magic id meaning "meter reading"), defaulting to `0`.
3. `IAsset.household` / `IAssetReq.householdId` carry the link.

```
POST   /api/asset/query                                → Page<IAsset>
GET    /api/asset/{assetId}                            → IAsset
POST   /api/asset                                      body IAssetReq → IAsset
PATCH  {dataRest}/assets/{assetId}                     dirty fields + URI refs → IAsset
DELETE /api/asset/{assetId}                            → { success: string }
PATCH  /api/asset/anonymous-value/{assetId}?anonymous=  → text
POST   /api/asset/updateAssetMoveInfo                  body { assetId, previousSiteId,
                                                              previousGeofenceIds, movedDate }
GET    /api/tag/values/{assetId}                       → { [tagType]: ITagValue[] }
POST   /api/tag/values/{assetId}                       body ITagValue[] → ITagValue[]
GET    /api/tag/asset-class/values?asset=&assetClass=  → { [tagType]: ITagValue[] }
GET    /api/asset/edge-devices                         → { edgeDeviceId, imeiNumber, simCardNumber }[]
POST   /api/asset/edge-device/sim-number               → { success: string }
GET    /api/asset-class                                → IAssetClass[]
GET    /api/job/asset/{assetId}/incomplete             → boolean
POST   /api/household/page                             → Page<HouseholdDTO>  (household picker)
POST   /api/household/imei-history                     → auto meter-replacement record
```

`PATCH {dataRest}/assets/{assetId}` needs URI-reference relations:
`site`, `household`, `assetClass`, `geofenceList[]`, `imeiEdgeDevice`.

---

## 9. Endpoint index

### Water reports & telemetry — `Water_Dashboard READ`

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/water/site-wise-daily-consumption/cursor` | site/day consumption roll-up |
| POST | `/api/water/meter-wise-consumption/cursor` | per-meter consumption (daily or aggregate) |
| POST | `/api/water/raw-data/cursor` | reading register (`rawReport=false`) / full telemetry (`true`) |
| POST | `/api/water/raw-data/export` | XLSX, one site + one day |
| POST | `/api/water/latest-meter-status/page` | latest state per meter (no dates) |
| GET | `/api/water/latest-meter-data/{assetId}` | latest reading for one meter |
| POST | `/api/water/meter-replacement-report/page` | meter-swap work log |
| POST | `/api/water/meter-replacement-report/total-count` | `{totalRecords}` |
| POST | `/api/water/meter-replacement/print` | PDF work log |
| POST | `/api/water/household-meter-details` | consumer/meter drill-down |
| GET | `/api/water/meter-health` | meter roster + freshness |
| GET | `/api/water/gateway-performance` | per-gateway daily active meters |
| GET | `/api/water/gateway-meter-summary` | per-gateway unique meters + overlap |
| GET | `/api/water/meter-image/{assetId}` | installation photos |
| POST | `/api/water/executive-summary` | daily executive brief |
| POST | `/api/water/meter-daily-reading/cursor` | **unused by any screen** |

### Dashboard & nav

| Method | Path | Perm |
|---|---|---|
| POST | `/api/module/water-summary` | Water_Dashboard READ |
| POST | `/api/module/water-daily-data` | Water_Dashboard READ |
| GET | `/api/auth/modules` | auth only |
| GET | `/api/auth/modules/{module-id}` | auth + role access → 403 |
| GET/POST | `/api/auth/sub-modules/favourite` | auth only |
| PATCH | `/api/auth/modules/{module-id}/update-submodule-preference` | auth only |

### Household — `Household READ/WRITE`

`POST /page` · `POST /` · `GET /{id}` · `GET /user/{userId}` · `POST /by-ids` ·
`DELETE /{id}` · `POST /imei-history` · `POST /imei-history/update` · `GET /imei-history` ·
`GET /imei-history/{householdId}` · `POST /imei-history/asset-selection` ·
`DELETE /imei-history/{id}` · `POST /asset-connection` · `PUT /imei-history/alert` (Water_Dashboard READ) ·
`POST /document-upload` · `GET /image-pre-signed-url` — all under `/api/household`.
Plus `PATCH {dataRest}/households/{id}`, `DELETE {dataRest}/householdDocuments/{id}`,
`DELETE {dataRest}/assetHouseholdImeiHistories/{id}`.

### Billing — `Billing READ/WRITE`

`POST /api/billing` · `POST /api/billing/` · `GET /api/billing/latest-bill/{assetId}` (no perm) ·
`POST /api/billing/slabs` · `GET /api/billing/slabs` · `GET /api/billing/header/{siteId}` ·
`PATCH {dataRest}/billingSlabs/{id}` · `DELETE {dataRest}/billingSlabs/{id}` ·
`DELETE {dataRest}/bills/{id}`.

### Map — `Map READ/WRITE/DELETE`

`GET /api/map/asset-locations` · `GET /api/map/geofence` · `POST /api/map/geofence` ·
`POST /api/map/quick-geofence` · `DELETE /api/map/geofence/{id}` ·
`POST /api/map/waterAssetsLocation` · `POST /api/map/assetLocation` ·
`POST /api/map/gateway-placement/compute` · `POST /api/map/pre-signed-url` ·
`PATCH {dataRest}/geofences/{id}`.

### Sites, assets, tags

`GET /api/site/?allSites={bool}` · `GET /api/site/hierarchy?includeAssets={bool}` ·
`POST /api/asset/query` · `GET /api/asset/{assetId}` · `POST /api/asset` ·
`GET /api/asset/household/{householdId}` · `DELETE /api/asset/{assetId}` ·
`GET|POST /api/tag/values/{assetId}` · `GET /api/asset-class` ·
`PATCH {dataRest}/assets/{assetId}`.

---

## 10. Known issues & gotchas for a rebuild

Read this section **before** writing client code. It splits into three kinds of item, and they need
different responses from the new UI:

| Group | What it is | What the new UI must do |
|---|---|---|
| **Contract inconsistencies** (1–8) | The backend genuinely behaves this way and **will not change** | Honour them exactly. Wrong param name or trailing slash = broken call. |
| **Type mismatches** (9–13) | The old frontend's TS types are wrong; the backend DTO is right | Model your types from the **backend DTO**, not the old interfaces. |
| **Old frontend bugs** (14–18) | Defects in `cog-web-app`, not in the API | Don't reproduce them. Several are UX regressions worth fixing in the new UI. |

Items 19–20 are security notes about the existing repo/backend config, and the last two subsections
list the magic constants the contract depends on and the features that don't exist at all.

### Contract inconsistencies

**These are permanent — the backend is fixed. Code to them.**

1. **`endDate` vs `toDate`.** `raw-data/cursor`, `meter-wise-consumption/cursor` and
   `site-wise-daily-consumption/cursor` use **`endDate`**; `meter-replacement-report/page`,
   `gateway-performance`, `gateway-meter-summary` and `executive-summary` use **`toDate`**.
2. **`siteIds` encoding differs.** `gateway-meter-summary` takes a **comma-joined string**
   (`?siteIds=1,2,3`); `meter-health`, `gateway-performance`, `billing/slabs`, `map/*` take **repeated
   params** (`?siteIds=1&siteIds=2`).
3. **`POST /api/billing` vs `POST /api/billing/`** — list vs create, distinguished only by a trailing
   slash. Wrong one → 405.
4. **URI-reference singular/plural mismatch.** Household update sends `"{dataRest}/site/{id}"`
   (singular); asset and geofence updates send `"{dataRest}/sites/{id}"` (plural).
5. **`GET /api/billing/latest-bill/{assetId}` has no permission check** — authenticated-only. Any user
   can read any asset's latest bill.
6. **`PUT /api/household/imei-history/alert`** is guarded by `Water_Dashboard READ` instead of
   `Household WRITE`.
7. **204 means "not found"** in two places (`EdgeDeviceNotFoundException`, `NoContentFoundException`) —
   don't treat it as success.
8. **Two error shapes bypass `HttpResponse`**: `ConstraintViolationException` → bare `List<String>`;
   `DataIntegrityViolationException` → `{"error-type": "..."}`. Plus `meter-replacement/print` returns
   its own `{"error","message"}`.

### Frontend types that are wrong (backend DTO is the truth)

9. **`reverseFlow` vs `reverseFlowL`.** The backend field is **`reverseFlow`** (no `L`), while
   `forwardFlowL` does have one. The frontend interface declares `reverseFlowL`, so the Raw Data grid's
   `reverseFlow` binding is actually **correct** and the interface is the bug. Use `reverseFlow`.
10. **One DTO, three partial interfaces.** The backend returns `MeterWiseConsumptionDTO`
    ([§2.5](#25-meterwiseconsumptiondto-response--the-one-telemetry-dto)) for every cursor endpoint with
    `@JsonInclude(NON_NULL)`. The frontend split it into `MeterWiseConsumptionDTO`,
    `MeterWiseConsumption` and `MeterData`, each missing fields. Model it as **one** type with optional
    fields.
11. `lastSeen`, `activeMeters`, `currentReading`, `startReading`, `endReading` and `avgConsumption` are
    all real backend fields that some frontend interfaces omit. The grids bind them correctly; the
    interfaces are incomplete.
12. **`BillData` is missing `householdCustomId`** in the frontend interface — the backend `BillDTO`
    returns it and the grid renders it.
13. **`BillingSlabDTO.id`** is `string` on the frontend, `long` on the backend.

### Real frontend bugs (in the old `cog-web-app` — do not reproduce these)

14. **`AssetService.getPaginatedAssets` silently drops `siteIds`** — the immutable `HttpParams.set()`
    result is never reassigned, so **every asset/meter query is unscoped by site**.
15. **The asset detail route carries no id** (`/configuration/home/assets/detail`), relying on NgRx
    state — no deep-linking, and a refresh loses the selection.
16. **Household delete has no confirmation dialog.**
17. Several service methods bypass the shared error handler (no `catchError`): `getPaginatedBills`,
    `createAssetHouseholdImeiInfo`, `deleteHouseholdDocument`, `getLatestBill`, `hasIncompleteJobCards`.
18. The Water Executive Summary's trend arrow is hard-coded `'UP'`, and its `alerts`/`topAlertTypes`
    data is fetched but the panels are commented out.

### Security

19. **`environment.ts` has a live `openAiKey` and an AG Grid licence key committed to the repo.**
    Rotate them and move them out of source control.
20. **CORS allows all origins** (`setAllowedOriginPatterns("*")`) with credentials enabled.

### Magic values the contract depends on

| Value | Meaning |
|---|---|
| asset tag `tagId === 163` | meter reading |
| `measure_name = 'water_meter_stats'` | the only Timestream measure used |
| site `type === 'water'` | the water-tenant feature flag |
| `vehicleStatus` `'A'` / `'N'` | meter Normal / Critical |
| geofence with non-null `radius` | it's a gateway |
| gateway↔meter match | last 3 hex chars of `gatewayId` appear in the geofence `name` |
| 36 hours | the "meter is Active" freshness threshold |
| attachment category `DOCUMENT` / `OLD_METER_DOCUMENT` | household doc / meter-replacement evidence |
| slab `type` `SLAB` / `ADDITIONAL_CHARGES` | ₹/kL tier vs percentage charge |

### Things that don't exist (don't go looking)

- **No DMA report** — only work-in-progress in a git stash.
- **No household bulk/CSV upload** — the only bulk feature is a client-side QR ZIP.
- **No billing-cycle endpoint** — `BillingCycleConfig` exists in the model but no controller exposes it.
- **`water-map.service.ts` is an empty 9-line stub.**

---

## 11. Backend architecture — for when you need new APIs

High-level only — enough to know where a new water endpoint would go and what it would have to
follow. The backend is shared with the rest of the platform (fleet, fuel, production, maintenance);
water is a slice of it, not a separate service.

### 11.1 Request flow

```
HTTP request
  → JwtAuthorizationFilter          (validates Bearer token, sets the principal)
  → @PreAuthorize hasPermission()   (sub-module + level check, e.g. Water_Dashboard/READ)
  → Controller                      (params validation, throws BadRequestException early)
  → Service interface → ServiceImpl (site scoping, date/timezone conversion, business rules)
  → one of:
       Repository (Spring Data JPA)  → MySQL
       QueryHelper → TimestreamQueryUtil → AWS Timestream
  → DTO returned as the raw response body (no envelope)
  → ExceptionHandling (@RestControllerAdvice) turns any thrown exception into HttpResponse
```

### 11.2 Package map (water-relevant only)

Root: `com.cognecto.iot`

| Package | Holds | Water examples |
|---|---|---|
| `configuration/controller` | REST controllers | `WaterMeterController`, `HouseholdController`, `BillingController`, `AuthController` |
| `configuration/service` | Service **interfaces** | `WaterMeterService`, `HouseholdService`, `BillingService` |
| `configuration/impl` | Service **implementations** | `WaterMeterServiceImpl`, `BillingServiceImpl` |
| `configuration/dto` | Request/response DTOs | `MeterWiseConsumptionDTO`, `HouseholdDTO`, `BillDTO`, `GatewayMeterSummaryDTO` |
| `configuration/model` | JPA entities | `Household`, `LatestMeterStatus`, `Bill`, `BillingSlab`, `BillingHeader` |
| `configuration/repository` | Spring Data repositories | `HouseholdRepository`, `LatestMeterStatusRepository`, `AssetHouseholdImeiHistoryRepository`, `BillRepository`, `BillingSlabRepository` |
| `services/timestream/QueryHelper` | Timestream query builders | `WaterRawDataHelper` — **all** water telemetry queries live here |
| `services/timestream/model` | Timestream row models | `WaterRawDataModel` (table `water_meter_telemetry`) |
| `services/timestream/utility/query` | Query execution | `TimestreamQuery` (builder), `TimestreamQueryUtil` (executes + maps rows) |
| `module/controller`, `module/impl` | Dashboard summaries | `ModuleSummaryController`, `ModuleSummaryServiceImpl` |
| `map/controller` | Map + geofences (gateways) | `MapController` |
| `shared/utility` | Cross-cutting helpers | `UserUtil` (site scoping), `FunctionUtil` (responses, id validation), `MessageConfigUtil` (messages) |
| `exception` | Exceptions + global handler | `ExceptionHandling`, `SiteNotFoundException`, … |
| `security` | JWT filter, permission expression | `JwtAuthorizationFilter`, `CustomMethodSecurityExpressionRoot` |

There is **no** Flyway/Liquibase — schema is Hibernate `ddl-auto=update`, and menu/permission rows are
plain data (see 11.5).

### 11.3 The two stores

| | MySQL (JPA) | AWS Timestream |
|---|---|---|
| Holds | households, assets/meters, sites, bills + slabs, meter-replacement history, geofences, alerts, nav/permissions, `latest_meter_status` | all meter telemetry (`iot.water_meter_telemetry`, `measure_name='water_meter_stats'`) |
| Queried via | repositories + JPA `Specification` for dynamic filters/paging | raw SQL strings built in `WaterRawDataHelper`, executed by `TimestreamQueryUtil` |
| Paging | Spring `Page` (page/size) | cursor-based (`nextCursor`) — Timestream has no offset paging |

`latest_meter_status` is a MySQL projection of the newest telemetry row per meter — that's why
"latest status" / "meter health" are fast and don't touch Timestream.

### 11.4 Timestream row model

New telemetry queries alias their `SELECT` columns to fields on `WaterRawDataModel`. Row mapping is
**reflection by exact field name**, so *a column alias that doesn't match a declared field is silently
dropped* — if you add a new aggregate, add the field too.

Dimensions: `site_id`, `gateway_id`, `meter_id`, `time`, `asset_id`.
Measures/derived fields available: `start_reading`, `end_reading`, `current_reading`, `min_reading`,
`max_reading`, `consumption`, `forward_flow_kl`, `reverse_flow_m3`, `battery_voltage`,
`battery_status`, `battery_health`, `rssi`, `snr`, `signal_strength`, `signal_quality`,
`valve_closed`, `valve_health`, `f_port`, `f_cnt`, `dr`, `frequency`, `confirmed`, `adr`,
`status_byte`, `checksum_status`, `meter_timestamp`, `decoded_at`, `raw_payload`, `min_date`,
`max_date`, `active_meters`, plus device/tenant identity (`tenant_id`, `tenant_name`,
`application_id`, `application_name`, `device_profile_id`, `device_profile_name`, `device_name`,
`dev_eui`, `dev_addr`).

### 11.5 Adding a new water endpoint — the established pattern

Six touch points, in order:

1. **DTO** — `configuration/dto/XxxDTO.java`, Lombok `@Data @Builder @NoArgsConstructor
   @AllArgsConstructor @JsonInclude(NON_NULL)`.
2. **Query** — a method on `WaterRawDataHelper` (Timestream) or a repository method (MySQL).
   Timestream conventions: build the SQL with `String.format` over a text block; always filter
   `measure_name = 'water_meter_stats'`; quote site ids as `'123'`; convert bounds with
   `Constant.TIMESTAMP_FORMATTER` inside `from_iso8601_timestamp('…')`; wrap the body in
   `try/catch → log.error → rethrow`. **Queries are not parameterized**, so escape any
   user-supplied string with the helper's `escapeSql`.
3. **Service interface** — add the method to `WaterMeterService`.
4. **Service impl** — in `WaterMeterServiceImpl`: resolve scope with
   `userUtil.getActiveSite(siteIds)`, throw `SiteNotFoundException` if empty, read the time zone from
   the first site, then convert the local date range to UTC
   (`atStartOfDay(zone) → withZoneSameInstant(UTC)` and `atTime(LocalTime.MAX)` for the end).
5. **Controller** — add to `WaterMeterController` with
   `@PreAuthorize("hasPermission('Water_Dashboard', 'READ')")` and return
   `createSuccessResponse(dto)`. Validate params up front and throw `BadRequestException`.
6. **Menu registration (only if it needs a nav entry)** — three MySQL inserts, no migration file:
   a `sub_module` row (`group_by` = the "Report" `general_constant` id), a `sub_module_params` row
   whose **`path` must equal the frontend route** and whose `module_id` is the Report module, then one
   `role_sub_module_mapping` row per role that should see it (`is_read_access` = 1). The simplest safe
   way to write these is to copy the values from an existing report row rather than hard-coding ids,
   since ids differ per environment.

No caching is used on any water/report endpoint — don't add `@Cacheable` expecting precedent.

---

## 12. Endpoints the web UI does not use (mobile app + write flows)

The mobile field app and the web share the **same controllers** — there is exactly one mobile-specific
route in the whole backend (`GET /api/auth/mob/modules`). What differs is which subset each client
calls. The endpoints below are **live and supported** but have no caller in `cog-web-app`.

This matters even for a read-only UI: **the mobile app writes the records the web reports read.** The
"New Meter Daily Work Report" ([§3.6](#36-new-meter-daily-work-report-meter-replacement)) is a *read*
of rows created by `POST /api/household/asset-connection` and `POST /api/household/imei-history` from
a surveyor's phone. Knowing the write side explains where every field comes from, and leaves the door
open if the new UI later needs to create or correct records.

### 12.1 Water — mobile / unused

| Method + path | Perm | Notes |
|---|---|---|
| `POST /api/water/household-meter-details` | Water_Dashboard READ | Consumer support lookup. Body `{ searchType: 'CONSUMER_ID'\|'METER_NUMBER', value, fromDate, toDate }` — all required. Returns the consumer, their meters, each meter's replacement lineage and per-day readings. Documented in full at [§3.11](#311-household-meter-details-lookup-no-dedicated-route). **A good candidate to surface in a new UI** — it's the only endpoint that answers "show me everything about this one consumer". |
| `POST /api/water/meter-daily-reading/cursor` | Water_Dashboard READ | Params `fromDate`, `endDate`; body `CursorPaginationReqDTO` → `CursorPaginationResDTO<MeterWiseConsumptionDTO>`. A service method exists in the web app but nothing calls it. |

### 12.2 Household — mobile write flows

**`POST /api/household/asset-connection`** — *the meter-replacement / new-connection create endpoint.*
This is what the field app calls when a surveyor installs or swaps a meter.

- Perm `Household WRITE` → `ResponseDTO`
- Body `AssetHouseholdImeiHistoryDTO` (see [§5.2](#52-assethouseholdimeihistorydto--the-meterhousehold-link)), plus optional `latitude`/`longitude` and an optional nested `alert`
- Validation: `assetId` must be valid; if coordinates are sent, `latitude` ∈ [-90, 90] and
  `longitude` ∈ [-180, 180]; if `alert` is present its `alertType` is **mandatory**
- Side effects, all in one call: writes the `asset_household_imei_history` row, updates the asset
  (household link + lat/long), and creates an alert row. The alert is what carries the installation
  **photos** that the web report later shows via `alertAttachments`.

| Method + path | Perm | Body / params | Response |
|---|---|---|---|
| `POST /api/household/imei-history` | Household WRITE | `AssetHouseholdImeiHistoryDTO` | same DTO. Can return **204** (`EdgeDeviceNotFoundException`) for an unknown IMEI — treat as *not found*. Also called by the web when a meter's IMEI changes. |
| `POST /api/household/imei-history/asset-selection` | Household WRITE | DTO with `id` **and** `assetId` required | `ResponseDTO`. Attaches a chosen asset to an existing history row. |
| `PUT /api/household/imei-history/alert` | **Water_Dashboard READ** | `AlertDTO` (`alertId` required) | `ResponseDTO`. Updates the alert attached to a replacement record — e.g. the surveyor adds a comment or more photos. Note the odd permission. |
| `GET /api/household/imei-history/{householdId}` | Household READ | path `householdId` | `AssetHouseholdImeiHistoryDTO[]`, returned bare via `ResponseEntity.ok`. The web instead uses the query-param form `GET /api/household/imei-history?householdId=`. |
| `DELETE /api/household/imei-history/{id}` | Household WRITE | path `id` | `ResponseDTO`. The web deletes via `DELETE {dataRest}/assetHouseholdImeiHistories/{id}` instead — **two ways to do the same thing**. |
| `GET /api/household/user/{userId}` | Household READ | path `userId` | `HouseholdDTO[]` — the households assigned to one user, from `user_household_mapping`. This is the mobile "my assigned work" list. |
| `POST /api/household/by-ids` | Household READ | bare JSON `number[]` | `HouseholdDTO[]`. Bulk hydrate by id; the web has a service method but no caller. |

### 12.3 `AlertDTO` (needed only for `PUT /api/household/imei-history/alert`)

```ts
{ alertId: number; alertCode: string; alertDescription: string; alertType: string;
  clientId: number; siteId: number; siteName: string;
  assetId: number; assetName: string; householdId: number; householdName: string;
  category: string; priority: string; alertStatus: string;
  assigneeId: number; assigneeName: string; reporterId: number; reporterName: string;
  approvalLevel: number; comment: string; alertValue: string;
  latitude?: number; longitude?: number;
  attachments: AttachmentDTO[];
  comments: AlertDetailDTO[]; history: AlertDetailDTO[];
  createdBy; createdDate; updatedBy; updatedDate }

AlertDetailDTO { id; alertId; configKey; configValue; oldValue; newValue;
                 createdBy; createdDate; comment; attachments: AttachmentDTO[] }
```

The entity-shaped fields (`asset`, `household`, `shift`, `site`, `client`, `assignee`, `reporter`) are
`@JsonIgnore` — they are never serialized and must never be sent.

### 12.4 Read/write split at a glance

| Data | Created by | Read by |
|---|---|---|
| Meter replacement / new connection records | mobile — `asset-connection`, `imei-history` | web — `meter-replacement-report/page`, `/total-count`, `/print`, and the household Configuration tab |
| Installation photos | mobile — the `alert` inside `asset-connection`, updated via `imei-history/alert` | web — `meter-image/{assetId}`, `alertAttachments` on the report |
| Household records | web (and mobile) — `POST /api/household` | both |
| Meter telemetry | LoRa gateways → Timestream (no API) | all water reports |
| Bills + slabs | web — `POST /api/billing/`, `/slabs` | web |
