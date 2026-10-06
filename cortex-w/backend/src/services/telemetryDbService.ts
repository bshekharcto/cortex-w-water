import { pool } from '../db/pool.js';
import { proxyUpstream } from './upstreamProxy.js';
import { getAuthToken } from '../routes/gis.js';
import { getRoots } from './siteTree.js';
import { networkHealthThresholds as T, type NetworkHealthThresholds } from '../config/networkHealth.js';

export interface TelemetrySummary {
  dateRange: { fromDate: string; toDate: string; days: number; fromTs: string; toTs: string; window: string };
  generatedAt: string;
  source: 'postgresql';
  thresholds: NetworkHealthThresholds;
  /** True while a manual Refresh is still pulling and rebuilding in the background. Added per response, never cached. */
  refreshing?: boolean;
  kpis: {
    gatewaysWithTraffic: number;
    totalConfiguredGateways: number;
    noRecentTrafficGateways: number;
    uniqueMetersSeen: number;
    framesReceived: number;
    /** % change in frames vs the previous equal-length period; null when it can't be compared honestly. */
    framesTrendPct: number | null;
    lastFrameAt: string | null;
    multiGatewayMeters: number;
    avgRssi: number | null;
    avgSnr: number | null;
  };
  gateways: Array<{
    gatewayId: string;
    alias: string;
    uniqueMeters: number;
    frameCount: number;
    lastFrameDecodedAt: string | null;
    avgRssi: number | null;
    avgSnr: number | null;
    /** % change in frames vs the previous equal-length period; null when it can't be compared honestly. */
    trendPct: number | null;
    status: 'reporting' | 'degraded' | 'stale' | 'no-traffic';
  }>;
  recentFrames: any[];
  hourlyActivity: Array<{ hour: string; count: number }>;
  /** Same hourly (UTC hour-of-day) counts, split per gateway. */
  hourlyByGateway: Record<string, Array<{ hour: string; count: number }>>;
}

export interface TelemetryWindow {
  /** Stable cache key, e.g. h6 / d7 / c_2026-09-01_2026-09-05 (never contains "now"). */
  key: string;
  fromTs: string;
  toTs: string;
  /** Partition-pruning date_key bounds (inclusive). */
  fromDate: string;
  toDate: string;
  /** Number of calendar dates the window touches. */
  days: number;
  /** True for hour-based windows, where upstream day-level summaries cannot be used for counts. */
  subDay: boolean;
}

/** Inverse of TelemetryWindow.key, so background rebuilds re-resolve against the current clock. */
function windowRequestFromKey(win: TelemetryWindow): { hours?: number; days?: number; from?: string; to?: string } {
  if (win.key.startsWith('h')) return { hours: Number(win.key.slice(1)) };
  if (win.key.startsWith('d')) return { days: Number(win.key.slice(1)) };
  const [, from, to] = win.key.split('_');
  return { from, to };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 90;
const dayStr = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Resolves a requested window against the SERVER clock (so a browser tab left open across midnight
 * never queries a stale date). Accepts {hours}, {days} or a custom {from,to} (YYYY-MM-DD, UTC).
 */
export function resolveWindow(
  q: { hours?: number; days?: number; from?: string; to?: string },
  now: Date = new Date()
): TelemetryWindow {
  const DAY = 86400000;
  if (q.from && q.to) {
    if (!DATE_RE.test(q.from) || !DATE_RE.test(q.to) || q.from > q.to) throw new Error('Invalid custom date range');
    const span = Math.round((Date.parse(q.to) - Date.parse(q.from)) / DAY) + 1;
    if (span > MAX_DAYS) throw new Error(`Custom range cannot exceed ${MAX_DAYS} days`);
    return {
      key: `c_${q.from}_${q.to}`,
      fromTs: `${q.from}T00:00:00.000Z`,
      toTs: `${q.to}T23:59:59.999Z`,
      fromDate: q.from,
      toDate: q.to,
      days: span,
      subDay: false,
    };
  }
  if (q.hours && q.hours > 0) {
    const hours = Math.min(Math.floor(q.hours), 168);
    const from = new Date(now.getTime() - hours * 3600000);
    const fromDate = dayStr(from);
    const toDate = dayStr(now);
    return {
      key: `h${hours}`,
      fromTs: from.toISOString(),
      toTs: now.toISOString(),
      fromDate,
      toDate,
      days: Math.round((Date.parse(toDate) - Date.parse(fromDate)) / DAY) + 1,
      subDay: true,
    };
  }
  const days = Math.min(Math.max(Math.floor(q.days || 7), 1), MAX_DAYS);
  const fromDate = dayStr(new Date(now.getTime() - (days - 1) * DAY));
  return {
    key: `d${days}`,
    fromTs: `${fromDate}T00:00:00.000Z`,
    toTs: now.toISOString(),
    fromDate,
    toDate: dayStr(now),
    days,
    subDay: false,
  };
}

function getGatewayAlias(id: string): string {
  if (!id) return 'GW-UNK';
  const suffix = id.slice(-3).toUpperCase();
  return `GW-${suffix}`;
}

export interface UpstreamGatewaySummary {
  totalUniqueMeters: number;
  gatewayCount: number;
  metersOnMultipleGateways: number;
  perGateway: Array<{ gatewayId: string; uniqueMeterCount: number }>;
}

/**
 * Authoritative, site-scoped unique-meter-per-gateway summary from cog-core-api
 * (GET /api/water/gateway-meter-summary). Computed upstream over ALL data, so it is not
 * affected by our ingestion cap, and it handles gateways that hear meters from several sites.
 * 'ALL' expands to every top-level site in the live hierarchy, so new sites are included automatically.
 */
const gatewaySummaryCache = new Map<string, { at: number; data: UpstreamGatewaySummary }>();
const GATEWAY_SUMMARY_TTL_MS = 60_000;

async function fetchGatewayMeterSummary(siteId: string, fromDate: string, toDate: string): Promise<UpstreamGatewaySummary | null> {
  const cacheKey = `${siteId || 'ALL'}|${fromDate}|${toDate}`;
  const hit = gatewaySummaryCache.get(cacheKey);
  if (hit && Date.now() - hit.at < GATEWAY_SUMMARY_TTL_MS) return hit.data;
  const fresh = await fetchGatewayMeterSummaryUncached(siteId, fromDate, toDate);
  if (fresh) gatewaySummaryCache.set(cacheKey, { at: Date.now(), data: fresh });
  return fresh;
}

async function fetchGatewayMeterSummaryUncached(siteId: string, fromDate: string, toDate: string): Promise<UpstreamGatewaySummary | null> {
  try {
    let siteIds = siteId;
    if (!siteId || siteId === 'ALL') {
      const roots = await getRoots();
      if (roots.length === 0) return null;
      siteIds = roots.map((r) => r.id).join(',');
    }
    const token = await getAuthToken();
    const up = await proxyUpstream(
      'GET',
      `/api/water/gateway-meter-summary?siteIds=${encodeURIComponent(siteIds)}&fromDate=${fromDate}&toDate=${toDate}`,
      { headers: { Authorization: token } }
    );
    const d = up.data as UpstreamGatewaySummary | null;
    if (up.status !== 200 || !d || !Array.isArray(d.perGateway)) return null;
    return d;
  } catch (err: any) {
    console.warn('[telemetryDb] gateway-meter-summary unavailable:', err.message);
    return null;
  }
}

/**
 * Ingests a single day's packets into PostgreSQL raw_telemetry_packets
 */
const inflightIngests = new Map<string, Promise<number>>();

/**
 * Ingests one date into PostgreSQL. Concurrent calls for the same date share a single run, so two
 * people pressing Refresh (or a refresh during a scheduled sync) never run duplicate long inserts.
 */
export function ingestDateIntoPostgres(date: string): Promise<number> {
  const running = inflightIngests.get(date);
  if (running) return running;
  const run = ingestDateUnlocked(date).finally(() => inflightIngests.delete(date));
  inflightIngests.set(date, run);
  return run;
}

async function ingestDateUnlocked(date: string): Promise<number> {
  const token = await getAuthToken();
  let insertedTotal = 0;
  let cursor: string | undefined = undefined;
  let hasMore = true;
  let page = 0;
  const maxPages = 6; // up to 3000 records per day

  while (hasMore && page < maxPages) {
    const payload: { page: number; size: number; cursor?: string } = { page, size: 500 };
    if (cursor) payload.cursor = cursor;

    try {
      const upstreamRes = await proxyUpstream(
        'POST',
        `/api/water/raw-data/cursor?fromDate=${date}&endDate=${date}&rawReport=true`,
        {
          body: payload,
          headers: { Authorization: token },
        }
      );

      if (upstreamRes.status !== 200 || !upstreamRes.data) break;

      const resData = upstreamRes.data as {
        content?: any[];
        nextCursor?: string;
        hasMore?: boolean;
      };

      const items = resData.content || [];
      if (items.length === 0) break;

      // Multi-row batch insert for ultra-fast ingestion
      const validItems = items.filter(item => item.meterId && item.gatewayId && item.decodedAt);
      if (validItems.length > 0) {
        const valuePlaceholders: string[] = [];
        const values: any[] = [];
        let pIdx = 1;

        for (const item of validItems) {
          valuePlaceholders.push(
            `($${pIdx}, $${pIdx+1}, $${pIdx+2}, $${pIdx+3}, $${pIdx+4}, $${pIdx+5}, $${pIdx+6}, $${pIdx+7}, $${pIdx+8}, $${pIdx+9}, $${pIdx+10}, $${pIdx+11}, $${pIdx+12}, $${pIdx+13}, $${pIdx+14}, $${pIdx+15}, $${pIdx+16}, $${pIdx+17}, $${pIdx+18}, $${pIdx+19}, $${pIdx+20}, $${pIdx+21}, $${pIdx+22})`
          );
          // Missing upstream values are stored as NULL — never invented. The one exception is
          // fcnt: it is part of the dedupe key (uq_packet), and NULLs never conflict, so a missing
          // fcnt is stored as -1 and mapped back to null when read.
          values.push(
            item.meterId,
            item.gatewayId,
            item.devEui ?? null,
            item.decodedAt,
            date,
            item.forwardFlowL ?? null,
            item.reverseFlow ?? null,
            item.batteryVoltage ?? null,
            item.batteryStatus ?? null,
            item.batteryHealth ?? null,
            item.valveHealth ?? null,
            item.valveClosed ?? null,
            item.checksumStatus ?? null,
            item.statusByte ?? null,
            item.rssi ?? null,
            item.snr ?? null,
            item.fcnt ?? -1,
            item.fport ?? null,
            item.frequency ?? null,
            item.dr ?? null,
            item.adr ?? null,
            item.confirmed ?? null,
            item.meterTimestamp || item.decodedAt
          );
          pIdx += 23;
        }

        try {
          await pool.query(
            `INSERT INTO raw_telemetry_packets (
              meter_id, gateway_id, dev_eui, decoded_at, date_key,
              forward_flow_l, reverse_flow, battery_voltage, battery_status,
              battery_health, valve_health, valve_closed, checksum_status,
              status_byte, rssi, snr, fcnt, fport, frequency, dr, adr, confirmed, meter_timestamp
            ) VALUES ${valuePlaceholders.join(', ')}
            ON CONFLICT (meter_id, gateway_id, decoded_at, fcnt) DO NOTHING`,
            values
          );
          insertedTotal += validItems.length;
        } catch (dbErr: any) {
          console.warn('[telemetryDb] Batch insert warning:', dbErr.message);
        }
      }

      if (resData.hasMore && resData.nextCursor && resData.nextCursor !== cursor) {
        cursor = resData.nextCursor;
        page++;
      } else {
        hasMore = false;
      }
    } catch (err: any) {
      console.error(`[telemetryDb] Error ingesting date ${date}:`, err.message);
      break;
    }
  }

  return insertedTotal;
}

const inflightRebuilds = new Map<string, Promise<unknown>>();

let activeRefreshJobs = 0;

/** True while a manual Refresh (pull today's packets, then rebuild the summary) is still running. */
export function isRefreshing(): boolean {
  return activeRefreshJobs > 0;
}

/**
 * Manual Refresh without making the user wait: pulls today's packets and then rebuilds this window/site's
 * summary in the background. Callers answer immediately from stored data and let the page poll
 * `isRefreshing()`. Only meaningful when the window includes today; one job runs at a time.
 */
export function startManualRefresh(win: TelemetryWindow, siteId: string): boolean {
  const todayUtc = new Date().toISOString().slice(0, 10);
  if (win.toDate !== todayUtc) return false;
  if (activeRefreshJobs > 0) return true; // already running; the caller just keeps polling
  activeRefreshJobs++;
  ingestDateIntoPostgres(todayUtc)
    .catch((err: any) => console.warn('[telemetryDb] Refresh ingestion warning:', err.message))
    .then(() => getPostgresAggregatedSummary(win, true, siteId))
    .catch((err: any) => console.warn('[telemetryDb] Refresh rebuild warning:', err.message))
    .finally(() => {
      activeRefreshJobs--;
    });
  return true;
}

/** Frame-level link quality from the shared thresholds (not water flow). */
export function frameStatusEvent(r: { rssi: number | null; snr: number | null }): 'FRAME_RECEIVED' | 'WEAK_RSSI' | 'POOR_LINK' {
  if ((r.rssi != null && r.rssi < T.rssiCriticalDbm) || (r.snr != null && r.snr < T.snrCriticalDb)) return 'POOR_LINK';
  if (r.rssi != null && r.rssi < T.rssiWeakDbm) return 'WEAK_RSSI';
  return 'FRAME_RECEIVED';
}

type MeterState = 'live' | 'stale' | 'silent' | 'weak-rssi' | 'poor-snr' | 'multi-gw' | 'fcnt-gap' | 'gw-changed';

/** The window's end, capped at now: ages are measured against it so past custom ranges don't read as "silent". */
function referenceMs(win: TelemetryWindow): number {
  return Math.min(Date.now(), Date.parse(win.toTs));
}

const LATEST_FRAME_COLUMNS = `meter_id, gateway_id, dev_eui, decoded_at,
       forward_flow_l, reverse_flow, battery_voltage, battery_status,
       battery_health, valve_health, checksum_status, rssi, snr,
       fcnt, fport, frequency, dr, adr, confirmed`;

/**
 * Turns each meter's latest frame (through a given gateway) into the Command Center meter item, with
 * real per-window frame counts, every gateway that heard the meter, and diagnostics from the shared thresholds.
 * `scope` decides what the frame counts mean: 'gateway' = frames through the row's gateway (per-gateway table),
 * 'meter' = frames from the meter through any gateway (fleet list, search).
 */
async function buildMeterItems(rows: any[], win: TelemetryWindow, scope: 'gateway' | 'meter' = 'gateway') {
  if (rows.length === 0) return [];
  const meterIds = rows.map((r) => r.meter_id);
  const refMs = referenceMs(win);
  const hourAgo = new Date(refMs - 3600000).toISOString();
  const dayAgo = new Date(refMs - 86400000).toISOString();
  const dayAgoDate = dayAgo.slice(0, 10);

  const [heardRes, countRes] = await Promise.all([
    // Every gateway that heard each meter in the window, with its latest frame there
    pool.query(
      `SELECT DISTINCT ON (meter_id, gateway_id) meter_id, gateway_id, rssi, snr, decoded_at
       FROM raw_telemetry_packets
       WHERE meter_id = ANY($1::text[]) AND date_key >= $2 AND date_key <= $3 AND decoded_at >= $4 AND decoded_at <= $5
       ORDER BY meter_id, gateway_id, decoded_at DESC`,
      [meterIds, win.fromDate, win.toDate, win.fromTs, win.toTs]
    ),
    // Frames per meter through each gateway over the trailing hour / day (relative to the window end)
    pool.query(
      `SELECT meter_id, gateway_id,
              COUNT(*) FILTER (WHERE decoded_at > $3)::int AS f1h,
              COUNT(*)::int AS f24h
       FROM raw_telemetry_packets
       WHERE meter_id = ANY($1::text[]) AND date_key >= $2 AND decoded_at > $4 AND decoded_at <= $5
       GROUP BY meter_id, gateway_id`,
      [meterIds, dayAgoDate, hourAgo, dayAgo, win.toTs]
    ),
  ]);

  const heard = new Map<string, any[]>();
  for (const h of heardRes.rows) {
    const list = heard.get(h.meter_id) ?? [];
    list.push(h);
    heard.set(h.meter_id, list);
  }
  const counts = new Map<string, { f1h: number; f24h: number }>();
  for (const c of countRes.rows) {
    const key = scope === 'gateway' ? `${c.meter_id}|${c.gateway_id}` : c.meter_id;
    const prev = counts.get(key) ?? { f1h: 0, f24h: 0 };
    counts.set(key, { f1h: prev.f1h + c.f1h, f24h: prev.f24h + c.f24h });
  }

  return rows.map((m) => {
    const paths = (heard.get(m.meter_id) ?? [{ meter_id: m.meter_id, gateway_id: m.gateway_id, rssi: m.rssi, snr: m.snr, decoded_at: m.decoded_at }])
      .slice()
      .sort((a, b) => +new Date(b.decoded_at) - +new Date(a.decoded_at));
    const latestGw = paths[0].gateway_id;
    const ageMin = (refMs - new Date(m.decoded_at).getTime()) / 60000;
    // Status is freshness only: live / stale / silent. Link-quality and reach go in `diagnostics`.
    const status: MeterState =
      ageMin > T.meterCriticalHours * 60 ? 'silent' : ageMin > T.meterStaleMinutes ? 'stale' : 'live';
    const diagnostics: MeterState[] = [];
    if (m.rssi != null && m.rssi < T.rssiWeakDbm) diagnostics.push('weak-rssi');
    if (m.snr != null && m.snr < T.snrWeakDb) diagnostics.push('poor-snr');
    if (paths.length > 1) diagnostics.push('multi-gw');
    const c = counts.get(scope === 'gateway' ? `${m.meter_id}|${m.gateway_id}` : m.meter_id);

    return {
      meterId: m.meter_id,
      devEui: m.dev_eui,
      lastSeenDate: m.decoded_at,
      frames1H: c?.f1h ?? 0,
      frames24H: c?.f24h ?? 0,
      lastRssi: m.rssi,
      lastSnr: m.snr,
      fCnt: m.fcnt === -1 ? null : m.fcnt,
      fPort: m.fport,
      frequency: m.frequency == null ? null : Number(m.frequency), // BIGINT arrives as a string
      dr: m.dr,
      adr: m.adr,
      confirmed: m.confirmed,
      otherGatewaysCount: paths.length - 1,
      statusChips: [status],
      diagnostics,
      gatewaysHeard: paths.map((p) => ({
        gatewayId: p.gateway_id,
        alias: getGatewayAlias(p.gateway_id),
        rssi: p.rssi,
        snr: p.snr,
        lastSeenAt: p.decoded_at,
        isLatest: p.gateway_id === latestGw,
      })),
      batteryVoltage: m.battery_voltage,
      batteryStatus: m.battery_status,
      batteryHealth: m.battery_health,
      valveHealth: m.valve_health,
      forwardFlowL: m.forward_flow_l,
      reverseFlow: m.reverse_flow,
    };
  });
}

export async function getGatewayMeters(gatewayId: string, win: TelemetryWindow) {
  const res = await pool.query(
    `SELECT DISTINCT ON (meter_id) ${LATEST_FRAME_COLUMNS}
     FROM raw_telemetry_packets
     WHERE gateway_id = $1 AND date_key >= $2 AND date_key <= $3 AND decoded_at >= $4 AND decoded_at <= $5
     ORDER BY meter_id, decoded_at DESC`,
    [gatewayId, win.fromDate, win.toDate, win.fromTs, win.toTs]
  );
  return buildMeterItems(res.rows, win);
}

/**
 * Find meters by Meter ID / DevEUI substring; returns the gateway each was last heard on.
 */
export async function searchMeters(q: string, win: TelemetryWindow) {
  const res = await pool.query(
    `SELECT DISTINCT ON (meter_id) ${LATEST_FRAME_COLUMNS}
     FROM raw_telemetry_packets
     WHERE date_key >= $2 AND date_key <= $3 AND decoded_at >= $4 AND decoded_at <= $5
       AND (meter_id ILIKE $1 OR dev_eui ILIKE $1)
     ORDER BY meter_id, decoded_at DESC
     LIMIT 20`,
    [`%${q}%`, win.fromDate, win.toDate, win.fromTs, win.toTs]
  );
  const items = await buildMeterItems(res.rows, win, 'meter');
  return items.map((meter, i) => ({ gatewayId: res.rows[i].gateway_id, meter }));
}

/** One raw packet row -> the frame shape the Command Center renders. */
function mapFrameRow(r: any, idx: number, multi: Set<string>) {
  return {
    multiGateway: multi.has(r.meter_id),
    id: r.id != null ? `pk-${r.id}` : `pg-frame-${idx}-${r.meter_id}`,
    decodedAt: r.decoded_at,
    meterTimestamp: r.meter_timestamp || r.decoded_at,
    meterId: r.meter_id,
    devEui: r.dev_eui,
    gatewayId: r.gateway_id,
    gatewayAlias: getGatewayAlias(r.gateway_id),
    fCnt: r.fcnt === -1 ? null : r.fcnt,
    fPort: r.fport,
    frequency: r.frequency == null ? null : Number(r.frequency),
    dr: r.dr,
    rssi: r.rssi,
    snr: r.snr,
    confirmed: r.confirmed,
    adr: r.adr,
    checksumStatus: r.checksum_status,
    statusByte: r.status_byte,
    statusEvent: frameStatusEvent(r),
  };
}

/** Of these meters, the ones that more than one gateway heard in the window (any gateway, not site-scoped). */
async function findMultiGatewayMeters(meterIds: string[], win: TelemetryWindow): Promise<Set<string>> {
  if (meterIds.length === 0) return new Set();
  const res = await pool.query(
    `SELECT meter_id FROM raw_telemetry_packets
     WHERE meter_id = ANY($1::text[]) AND date_key >= $2 AND date_key <= $3 AND decoded_at >= $4 AND decoded_at <= $5
     GROUP BY meter_id HAVING COUNT(DISTINCT gateway_id) > 1`,
    [[...new Set(meterIds)], win.fromDate, win.toDate, win.fromTs, win.toTs]
  );
  return new Set<string>(res.rows.map((r: any) => r.meter_id));
}

export interface FramesPage {
  total: number;
  limit: number;
  offset: number;
  items: ReturnType<typeof mapFrameRow>[];
}

/** Newest frames received through one gateway in the window (newest first, paginated). */
export async function getGatewayFrames(gatewayId: string, win: TelemetryWindow, limit: number, offset: number): Promise<FramesPage> {
  const res = await pool.query(
    `SELECT *, COUNT(*) OVER()::int AS total FROM raw_telemetry_packets
     WHERE gateway_id = $1 AND date_key >= $2 AND date_key <= $3 AND decoded_at >= $4 AND decoded_at <= $5
     ORDER BY decoded_at DESC
     LIMIT $6 OFFSET $7`,
    [gatewayId, win.fromDate, win.toDate, win.fromTs, win.toTs, limit, offset]
  );
  const multi = await findMultiGatewayMeters(res.rows.map((r: any) => r.meter_id), win);
  return { total: res.rows[0]?.total ?? 0, limit, offset, items: res.rows.map((r: any, i: number) => mapFrameRow(r, i, multi)) };
}

/** Every frame from one meter in the window, across all gateways (newest first, paginated). */
export async function getMeterFrames(meterId: string, win: TelemetryWindow, limit: number, offset: number): Promise<FramesPage> {
  const res = await pool.query(
    `SELECT *, COUNT(*) OVER()::int AS total FROM raw_telemetry_packets
     WHERE meter_id = $1 AND date_key >= $2 AND date_key <= $3 AND decoded_at >= $4 AND decoded_at <= $5
     ORDER BY decoded_at DESC
     LIMIT $6 OFFSET $7`,
    [meterId, win.fromDate, win.toDate, win.fromTs, win.toTs, limit, offset]
  );
  const gateways = new Set<string>(res.rows.map((r: any) => r.gateway_id));
  const multi = gateways.size > 1 ? new Set([meterId]) : new Set<string>();
  return { total: res.rows[0]?.total ?? 0, limit, offset, items: res.rows.map((r: any, i: number) => mapFrameRow(r, i, multi)) };
}

export type MeterStatusFilter = 'live' | 'stale' | 'silent';

/**
 * Fleet-wide meter list for the Meters view: each meter's latest frame (via whichever gateway heard it last),
 * optionally scoped to a site, searched, filtered by freshness status, and paginated server-side.
 */
export async function listFleetMeters(opts: {
  win: TelemetryWindow;
  siteId: string;
  q?: string;
  status?: MeterStatusFilter;
  /** Filters on the meter's latest frame: data rate, frequency in Hz, confirmed uplink. */
  dr?: number;
  frequency?: number;
  confirmed?: boolean;
  limit: number;
  offset: number;
}) {
  const { win, siteId } = opts;
  const scoped = !!siteId && siteId !== 'ALL';
  let siteGateways: string[] | null = null;
  if (scoped) {
    const up = await fetchGatewayMeterSummary(siteId, win.fromDate, win.toDate);
    if (!up) throw new Error('Site gateway summary is unavailable from the upstream API');
    siteGateways = up.perGateway.map((g) => g.gatewayId);
  }

  const params: any[] = [win.fromDate, win.toDate, win.fromTs, win.toTs];
  const inner: string[] = ['date_key >= $1', 'date_key <= $2', 'decoded_at >= $3', 'decoded_at <= $4'];
  if (siteGateways) {
    params.push(siteGateways);
    inner.push(`gateway_id = ANY($${params.length}::text[])`);
  }
  const q = (opts.q ?? '').trim();
  if (q) {
    params.push(`%${q}%`);
    inner.push(`(meter_id ILIKE $${params.length} OR dev_eui ILIKE $${params.length})`);
  }

  // Freshness status is measured against the window's end (capped at now), same as the per-gateway tags
  const refMs = referenceMs(win);
  const outer: string[] = [];
  if (opts.status) {
    const dayAgo = new Date(refMs - T.meterStaleMinutes * 60000).toISOString();
    const silentAt = new Date(refMs - T.meterCriticalHours * 3600000).toISOString();
    if (opts.status === 'live') { params.push(dayAgo); outer.push(`decoded_at > $${params.length}`); }
    else if (opts.status === 'stale') { params.push(dayAgo, silentAt); outer.push(`decoded_at <= $${params.length - 1} AND decoded_at > $${params.length}`); }
    else { params.push(silentAt); outer.push(`decoded_at <= $${params.length}`); }
  }
  if (opts.dr !== undefined) { params.push(opts.dr); outer.push(`dr = $${params.length}`); }
  if (opts.frequency !== undefined) { params.push(opts.frequency); outer.push(`frequency = $${params.length}`); }
  if (opts.confirmed !== undefined) { params.push(opts.confirmed); outer.push(`confirmed = $${params.length}`); }
  const mainParams = [...params, opts.limit, opts.offset];

  // Values present in the window/site, for the DR and frequency dropdowns (independent of the other filters)
  const facetParams: any[] = [win.fromDate, win.toDate, win.fromTs, win.toTs];
  let facetSite = '';
  if (siteGateways) {
    facetParams.push(siteGateways);
    facetSite = 'AND gateway_id = ANY($5::text[])';
  }

  const [res, facetRes] = await Promise.all([
    pool.query(
      `WITH latest AS (
         SELECT DISTINCT ON (meter_id) ${LATEST_FRAME_COLUMNS}
         FROM raw_telemetry_packets
         WHERE ${inner.join(' AND ')}
         ORDER BY meter_id, decoded_at DESC
       )
       SELECT *, COUNT(*) OVER()::int AS total FROM latest
       ${outer.length ? 'WHERE ' + outer.join(' AND ') : ''}
       ORDER BY decoded_at DESC, meter_id
       LIMIT $${mainParams.length - 1} OFFSET $${mainParams.length}`,
      mainParams
    ),
    pool.query(
      `SELECT array_agg(DISTINCT dr ORDER BY dr) FILTER (WHERE dr IS NOT NULL) AS dr,
              array_agg(DISTINCT frequency ORDER BY frequency) FILTER (WHERE frequency IS NOT NULL) AS frequency
       FROM raw_telemetry_packets
       WHERE date_key >= $1 AND date_key <= $2 AND decoded_at >= $3 AND decoded_at <= $4 ${facetSite}`,
      facetParams
    ),
  ]);
  const items = await buildMeterItems(res.rows, win, 'meter');
  const facets = {
    dr: (facetRes.rows[0]?.dr ?? []).map(Number) as number[],
    frequency: (facetRes.rows[0]?.frequency ?? []).map(Number) as number[],
  };
  return { total: res.rows[0]?.total ?? 0, limit: opts.limit, offset: opts.offset, items, facets };
}

/**
 * Aggregates telemetry across N days (default 7 or 30 days) directly in PostgreSQL!
 */
export async function getPostgresAggregatedSummary(
  win: TelemetryWindow,
  forceRefresh: boolean = false,
  siteId: string = 'ALL'
): Promise<TelemetrySummary> {
  const { fromDate, toDate, fromTs, toTs, days } = win;
  const cacheKey = `${win.key}_summary_site_${siteId || 'ALL'}`;

  // 1. Check cache table if not forcing refresh
  if (!forceRefresh) {
    try {
      const cacheRes = await pool.query(
        'SELECT summary_json, updated_at FROM telemetry_aggregation_cache WHERE cache_key = $1',
        [cacheKey]
      );
      if (cacheRes.rows.length > 0) {
        const row = cacheRes.rows[0];
        const ageMs = Date.now() - new Date(row.updated_at).getTime();
        // Fresh (< 2 min): serve as-is. Stale (< 1 h): serve instantly and rebuild in the background.
        if (ageMs < 120000) {
          return row.summary_json as TelemetrySummary;
        }
        if (ageMs < 3600000) {
          if (!inflightRebuilds.has(cacheKey)) {
            const rebuild = getPostgresAggregatedSummary(resolveWindow(windowRequestFromKey(win)), true, siteId)
              .catch((err) => console.warn('[telemetryDb] Background rebuild note:', err.message))
              .finally(() => inflightRebuilds.delete(cacheKey));
            inflightRebuilds.set(cacheKey, rebuild);
          }
          return row.summary_json as TelemetrySummary;
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Run all aggregations concurrently (each round trip to the remote DB is ~250ms)
  // Site scope comes from the upstream summary: packet stats are limited to the gateways that
  // hear this site's meters. A specific site with no upstream answer is an error, not fake data.
  const upstreamSummary = await fetchGatewayMeterSummary(siteId, fromDate, toDate);
  const scoped = !!siteId && siteId !== 'ALL';
  if (scoped && !upstreamSummary) {
    throw new Error('Site gateway summary is unavailable from the upstream API');
  }
  const siteGatewayIds = upstreamSummary?.perGateway.map((g) => g.gatewayId) ?? [];
  const siteFilter = scoped ? 'AND gateway_id = ANY($5::text[])' : '';
  const range: any[] = scoped ? [fromDate, toDate, fromTs, toTs, siteGatewayIds] : [fromDate, toDate, fromTs, toTs];

  const spanMs = Date.parse(toTs) - Date.parse(fromTs);
  const prevFromTs = new Date(Date.parse(fromTs) - spanMs).toISOString();
  const prevRange: any[] = scoped
    ? [prevFromTs.slice(0, 10), fromTs.slice(0, 10), prevFromTs, fromTs, siteGatewayIds]
    : [prevFromTs.slice(0, 10), fromTs.slice(0, 10), prevFromTs, fromTs];

  const [kpiRes, multiGwRes, gwRes, hourlyRes, framesRes, prevRes, earliestRes] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(DISTINCT gateway_id)::int as gateways_with_traffic,
        COUNT(DISTINCT meter_id)::int as unique_meters_seen,
        COUNT(*)::int as frames_received,
        AVG(rssi)::numeric(10,1)::float as avg_rssi,
        AVG(snr)::numeric(10,1)::float as avg_snr,
        MAX(decoded_at) as latest_frame_at
      FROM raw_telemetry_packets
      WHERE date_key >= $1 AND date_key <= $2 AND decoded_at >= $3 AND decoded_at <= $4 ${siteFilter}
    `, range),
    pool.query(`
      SELECT COUNT(*)::int as count FROM (
        SELECT meter_id FROM raw_telemetry_packets
        WHERE date_key >= $1 AND date_key <= $2 AND decoded_at >= $3 AND decoded_at <= $4 ${siteFilter}
        GROUP BY meter_id HAVING COUNT(DISTINCT gateway_id) > 1
      ) sub
    `, range),
    pool.query(`
      SELECT
        gateway_id,
        COUNT(DISTINCT meter_id)::int as unique_meters,
        COUNT(*)::int as frame_count,
        MAX(decoded_at) as latest_decoded_at,
        AVG(rssi)::numeric(10,1)::float as avg_rssi,
        AVG(snr)::numeric(10,1)::float as avg_snr
      FROM raw_telemetry_packets
      WHERE date_key >= $1 AND date_key <= $2 AND decoded_at >= $3 AND decoded_at <= $4 ${siteFilter}
      GROUP BY gateway_id
      ORDER BY unique_meters DESC, frame_count DESC
    `, range),
    pool.query(`
      SELECT gateway_id, TO_CHAR(decoded_at, 'HH24:00') as hour_str, COUNT(*)::int as count
      FROM raw_telemetry_packets
      WHERE date_key >= $1 AND date_key <= $2 AND decoded_at >= $3 AND decoded_at <= $4 ${siteFilter}
      GROUP BY gateway_id, hour_str
    `, range),
    pool.query(`SELECT * FROM raw_telemetry_packets WHERE date_key >= $1 AND date_key <= $2 AND decoded_at >= $3 AND decoded_at <= $4 ${siteFilter} ORDER BY decoded_at DESC LIMIT 100`, range),
    // Previous equal-length period, for trends
    pool.query(`
      SELECT gateway_id, COUNT(*)::int AS frames
      FROM raw_telemetry_packets
      WHERE date_key >= $1 AND date_key <= $2 AND decoded_at >= $3 AND decoded_at < $4 ${siteFilter}
      GROUP BY gateway_id
    `, prevRange),
    pool.query(`SELECT MIN(date_key) AS d FROM raw_telemetry_packets`),
  ]);

  // A trend is only reported when the previous period lies entirely inside the data we hold;
  // otherwise "down 100%" would just mean "we hadn't ingested that far back".
  const earliestDate: string | null = earliestRes.rows[0]?.d ?? null;
  const prevComparable = earliestDate !== null && prevFromTs.slice(0, 10) >= earliestDate;
  const prevFrames = new Map<string, number>(prevRes.rows.map((r: any) => [r.gateway_id, r.frames]));
  const pctChange = (cur: number, prev: number | undefined): number | null =>
    prevComparable && prev && prev >= T.trendMinPrevFrames ? Math.round(((cur - prev) / prev) * 100) : null;

  const kpiRow = kpiRes.rows[0] || {};

  const multiGatewayMeters = multiGwRes.rows[0]?.count ?? 0;

  const pgByGateway = new Map<string, any>(gwRes.rows.map((r: any) => [r.gateway_id, r]));
  // Upstream is the source of truth for which gateways hear this site and how many unique meters;
  // packet rows add frame counts / radio stats / last-seen where we have them.
  const gatewayIds = upstreamSummary
    ? upstreamSummary.perGateway.map((g) => g.gatewayId)
    : gwRes.rows.map((r: any) => r.gateway_id);
  const upstreamMeters = new Map(upstreamSummary?.perGateway.map((g) => [g.gatewayId, g.uniqueMeterCount]) ?? []);

  const gateways = gatewayIds
    .map((gatewayId) => {
      const r = pgByGateway.get(gatewayId);
      const trendPct = r ? pctChange(r.frame_count, prevFrames.get(gatewayId)) : null;
      const ageMin = r ? (referenceMs(win) - new Date(r.latest_decoded_at).getTime()) / 60000 : Infinity;
      let status: 'reporting' | 'degraded' | 'stale' | 'no-traffic';
      if (!r) status = win.subDay ? 'no-traffic' : 'stale'; // heard meters upstream, but no packets stored for this window
      else if (ageMin > T.gatewayCriticalMinutes) status = 'no-traffic';
      else if (ageMin > T.gatewayStaleMinutes) status = 'stale';
      else if (
        r.avg_rssi < T.rssiCriticalDbm ||
        r.avg_snr < T.snrCriticalDb ||
        (trendPct !== null && trendPct <= -T.gatewayTrafficDropWarningPct)
      ) status = 'degraded';
      else status = 'reporting';

      return {
        gatewayId,
        alias: getGatewayAlias(gatewayId),
        // Sub-day windows can't use the upstream (day-granular) counts, so count from packets
        uniqueMeters: win.subDay ? r?.unique_meters ?? 0 : upstreamMeters.get(gatewayId) ?? r?.unique_meters ?? 0,
        frameCount: r?.frame_count ?? 0,
        lastFrameDecodedAt: (r?.latest_decoded_at ?? null) as string | null,
        avgRssi: r?.avg_rssi ?? null,
        avgSnr: r?.avg_snr ?? null,
        trendPct,
        status,
      };
    })
    .sort((a, b) => b.uniqueMeters - a.uniqueMeters || b.frameCount - a.frameCount);

  // Hourly (UTC hour-of-day) frame counts: per gateway, and the fleet total summed from them
  const hourSlots = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
  const perGatewayHours = new Map<string, Map<string, number>>();
  const totalHours = new Map<string, number>(hourSlots.map((h) => [h, 0]));
  for (const r of hourlyRes.rows) {
    const m = perGatewayHours.get(r.gateway_id) ?? new Map<string, number>(hourSlots.map((h) => [h, 0]));
    m.set(r.hour_str, (m.get(r.hour_str) ?? 0) + r.count);
    perGatewayHours.set(r.gateway_id, m);
    totalHours.set(r.hour_str, (totalHours.get(r.hour_str) ?? 0) + r.count);
  }
  const toSeries = (m: Map<string, number>) => hourSlots.map((hour) => ({ hour, count: m.get(hour) ?? 0 }));
  const hourlyActivity = toSeries(totalHours);
  const hourlyByGateway: Record<string, Array<{ hour: string; count: number }>> = {};
  for (const [gw, m] of perGatewayHours) hourlyByGateway[gw] = toSeries(m);


  const feedMulti = await findMultiGatewayMeters(framesRes.rows.map((r: any) => r.meter_id), win);
  const recentFrames = framesRes.rows.map((r: any, idx: number) => mapFrameRow(r, idx, feedMulti));

  const summary: TelemetrySummary = {
    dateRange: { fromDate, toDate, days, fromTs, toTs, window: win.key },
    generatedAt: new Date().toISOString(),
    source: 'postgresql',
    thresholds: T,
    kpis: {
      gatewaysWithTraffic: gateways.filter((g) => g.status !== 'stale' && g.status !== 'no-traffic').length,
      totalConfiguredGateways: gateways.length,
      noRecentTrafficGateways: gateways.filter((g) => g.status === 'stale' || g.status === 'no-traffic').length,
      uniqueMetersSeen: (win.subDay ? undefined : upstreamSummary?.totalUniqueMeters) ?? kpiRow.unique_meters_seen ?? 0,
      framesReceived: kpiRow.frames_received ?? 0,
      framesTrendPct: pctChange(kpiRow.frames_received ?? 0, prevRes.rows.reduce((a: number, r: any) => a + r.frames, 0)),
      lastFrameAt: (kpiRow.latest_frame_at ?? null) as string | null,
      multiGatewayMeters: (win.subDay ? undefined : upstreamSummary?.metersOnMultipleGateways) ?? multiGatewayMeters,
      avgRssi: kpiRow.avg_rssi ?? null,
      avgSnr: kpiRow.avg_snr ?? null,
    },
    gateways,
    recentFrames,
    hourlyActivity,
    hourlyByGateway,
  };

  // 10. Cache in PostgreSQL
  try {
    await pool.query(`
      INSERT INTO telemetry_aggregation_cache (cache_key, from_date, to_date, summary_json, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (cache_key) DO UPDATE SET summary_json = $4, updated_at = NOW()
    `, [cacheKey, fromDate, toDate, summary]);
  } catch (err: any) {
    console.warn('[telemetryDb] Cache save note:', err.message);
  }

  return summary;
}
