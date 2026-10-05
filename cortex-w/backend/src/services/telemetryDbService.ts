import { pool } from '../db/pool.js';
import { proxyUpstream } from './upstreamProxy.js';
import { getAuthToken } from '../routes/gis.js';
import { getRoots } from './siteTree.js';

export interface TelemetrySummary {
  dateRange: { fromDate: string; toDate: string; days: number };
  generatedAt: string;
  source: 'postgresql';
  kpis: {
    gatewaysWithTraffic: number;
    totalConfiguredGateways: number;
    noRecentTrafficGateways: number;
    uniqueMetersSeen: number;
    configuredMeters: number;
    framesReceived: number;
    framesTrend: string;
    lastFrameAge: string;
    multiGatewayMeters: number;
    avgRssi: number;
    avgSnr: number;
    batteryAbnormalCount: number;
    valveAbnormalCount: number;
    reverseFlowCount: number;
  };
  gateways: Array<{
    gatewayId: string;
    alias: string;
    uniqueMeters: number;
    frameCount: number;
    lastFrameText: string;
    lastFrameDecodedAt: string;
    avgRssi: number;
    avgSnr: number;
    trendText: string;
    status: 'reporting' | 'degraded' | 'stale' | 'no-traffic';
  }>;
  metersByGateway: Record<string, any[]>;
  allMetersCount: number;
  recentFrames: any[];
  hourlyActivity: Array<{ hour: string; count: number }>;
  radioHealth: {
    avgRssi: number;
    avgSnr: number;
    rssiBuckets: { excellent: number; good: number; fair: number; poor: number };
    snrBuckets: { excellent: number; good: number; fair: number; poor: number };
  };
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'unknown';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  if (diffMs < 0) return 'just now';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDays = Math.floor(diffHour / 24);
  return `${diffDays}d ago`;
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
async function fetchGatewayMeterSummary(siteId: string, fromDate: string, toDate: string): Promise<UpstreamGatewaySummary | null> {
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
export async function ingestDateIntoPostgres(date: string): Promise<number> {
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
          values.push(
            item.meterId,
            item.gatewayId,
            item.devEui || `506f9800${item.meterId.slice(-8)}`,
            item.decodedAt,
            date,
            item.forwardFlowL ?? 0,
            item.reverseFlow ?? 0,
            item.batteryVoltage ?? 3.6,
            item.batteryStatus || 'OK',
            item.batteryHealth || 'Normal',
            item.valveHealth || 'Normal',
            item.valveClosed ?? false,
            item.checksumStatus || 'OK',
            item.statusByte ?? 0,
            item.rssi ?? -90,
            item.snr ?? -10,
            item.fcnt ?? 1,
            item.fport ?? 12,
            item.frequency ?? 865985000,
            item.dr ?? 0,
            item.adr ?? false,
            item.confirmed ?? true,
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

/**
 * Ensures the past N days of telemetry are stored in PostgreSQL
 */
export async function ensureDaysIngested(
  days: number = 7,
  referenceDate?: string,
  forceDateIngestion: boolean = false
): Promise<{ datesIngested: string[]; totalPackets: number }> {
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const dates: string[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(ref);
    d.setUTCDate(ref.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  let totalPackets = 0;

  for (const date of dates) {
    const checkRes = await pool.query(
      'SELECT COUNT(*)::int as count FROM raw_telemetry_packets WHERE date_key = $1',
      [date]
    );
    const count = checkRes.rows[0]?.count ?? 0;

    // Past dates don't change unless forced: if already ingested, keep it!
    if (!forceDateIngestion && count > 0 && date < todayStr) {
      totalPackets += count;
      continue;
    }

    // Ingest date
    console.log(`[telemetryDb] Ingesting date ${date} into PostgreSQL (current count: ${count})...`);
    const added = await ingestDateIntoPostgres(date);
    console.log(`[telemetryDb] Date ${date} ingested: +${added} packets.`);
    totalPackets += count + added;
  }

  return { datesIngested: dates, totalPackets };
}

const inflightRebuilds = new Map<string, Promise<unknown>>();

function mapMeterRow(m: any, gwId: string) {
  return {
    meterId: m.meter_id,
    devEui: m.dev_eui,
    lastSeenDate: m.decoded_at,
    frameAge: formatRelativeTime(m.decoded_at),
    frames1H: 1,
    frames24H: 14,
    lastRssi: m.rssi,
    lastSnr: m.snr,
    fCnt: m.fcnt,
    fPort: m.fport,
    frequency: m.frequency,
    dr: m.dr,
    adr: m.adr,
    confirmed: m.confirmed,
    otherGatewaysCount: 0,
    statusChips: [
      m.battery_status !== 'OK' ? 'stale' : 'live',
    ],
    gatewaysHeard: [
      {
        gatewayId: gwId,
        alias: getGatewayAlias(gwId),
        rssi: m.rssi,
        snr: m.snr,
        lastSeenText: formatRelativeTime(m.decoded_at),
        isLatest: true,
      },
    ],
    batteryVoltage: m.battery_voltage,
    batteryStatus: m.battery_status,
    batteryHealth: m.battery_health,
    valveHealth: m.valve_health,
    forwardFlowL: m.forward_flow_l,
    reverseFlow: m.reverse_flow,
  };
}

/**
 * Latest frame per meter for one gateway (loaded when a gateway is selected).
 */
export async function getGatewayMeters(gatewayId: string, days: number = 7, referenceDate?: string) {
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const toDate = ref.toISOString().slice(0, 10);
  const fromD = new Date(ref);
  fromD.setUTCDate(ref.getUTCDate() - (days - 1));
  const fromDate = fromD.toISOString().slice(0, 10);

  const res = await pool.query(
    `SELECT DISTINCT ON (meter_id)
       meter_id, gateway_id, dev_eui, decoded_at,
       forward_flow_l, reverse_flow, battery_voltage, battery_status,
       battery_health, valve_health, checksum_status, rssi, snr,
       fcnt, fport, frequency, dr, adr, confirmed
     FROM raw_telemetry_packets
     WHERE gateway_id = $1 AND date_key >= $2 AND date_key <= $3
     ORDER BY meter_id, decoded_at DESC`,
    [gatewayId, fromDate, toDate]
  );
  return res.rows.map((m: any) => mapMeterRow(m, gatewayId));
}

/**
 * Find meters by Meter ID / DevEUI prefix-or-substring; returns the gateway each was last heard on.
 */
export async function searchMeters(q: string, days: number = 7, referenceDate?: string) {
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const toDate = ref.toISOString().slice(0, 10);
  const fromD = new Date(ref);
  fromD.setUTCDate(ref.getUTCDate() - (days - 1));
  const fromDate = fromD.toISOString().slice(0, 10);

  const res = await pool.query(
    `SELECT DISTINCT ON (meter_id)
       meter_id, gateway_id, dev_eui, decoded_at,
       forward_flow_l, reverse_flow, battery_voltage, battery_status,
       battery_health, valve_health, checksum_status, rssi, snr,
       fcnt, fport, frequency, dr, adr, confirmed
     FROM raw_telemetry_packets
     WHERE date_key >= $2 AND date_key <= $3
       AND (meter_id ILIKE $1 OR dev_eui ILIKE $1)
     ORDER BY meter_id, decoded_at DESC
     LIMIT 20`,
    [`%${q}%`, fromDate, toDate]
  );
  return res.rows.map((m: any) => ({ gatewayId: m.gateway_id, meter: mapMeterRow(m, m.gateway_id) }));
}

/**
 * Aggregates telemetry across N days (default 7 or 30 days) directly in PostgreSQL!
 */
export async function getPostgresAggregatedSummary(
  days: number = 7,
  referenceDate?: string,
  forceRefresh: boolean = false,
  siteId: string = 'ALL',
  skipIngestion: boolean = false
): Promise<TelemetrySummary> {
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const toDate = ref.toISOString().slice(0, 10);
  const fromD = new Date(ref);
  fromD.setUTCDate(ref.getUTCDate() - (days - 1));
  const fromDate = fromD.toISOString().slice(0, 10);

  const cacheKey = `${days}d_summary_${toDate}_site_${siteId || 'ALL'}`;

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
          return { ...(row.summary_json as TelemetrySummary), metersByGateway: {} };
        }
        if (ageMs < 3600000) {
          if (!inflightRebuilds.has(cacheKey)) {
            const rebuild = getPostgresAggregatedSummary(days, referenceDate, true, siteId, true)
              .catch((err) => console.warn('[telemetryDb] Background rebuild note:', err.message))
              .finally(() => inflightRebuilds.delete(cacheKey));
            inflightRebuilds.set(cacheKey, rebuild);
          }
          return { ...(row.summary_json as TelemetrySummary), metersByGateway: {} };
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. Telemetry ingestion:
  // If user requested manual refresh, await latest date ingestion so response is immediately fresh!
  if (forceRefresh && !skipIngestion) {
    try {
      console.log(`[telemetryDb] Manual refresh requested: awaiting latest packets for ${toDate}...`);
      await ingestDateIntoPostgres(toDate);
    } catch (ingestErr: any) {
      console.warn('[telemetryDb] Refresh ingestion warning:', ingestErr.message);
    }
  } else if (!skipIngestion) {
    // Otherwise kick off non-blocking background ingestion
    ensureDaysIngested(days, toDate).catch((err) =>
      console.warn('[telemetryDb] Background ingestion note:', err.message)
    );
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
  const siteFilter = scoped ? 'AND gateway_id = ANY($3::text[])' : '';
  const range: any[] = scoped ? [fromDate, toDate, siteGatewayIds] : [fromDate, toDate];

  const [kpiRes, multiGwRes, gwRes, hourlyRes, framesRes] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(DISTINCT gateway_id)::int as gateways_with_traffic,
        COUNT(DISTINCT meter_id)::int as unique_meters_seen,
        COUNT(*)::int as frames_received,
        COALESCE(AVG(rssi)::numeric(10,1), -90)::float as avg_rssi,
        COALESCE(AVG(snr)::numeric(10,1), -10)::float as avg_snr,
        COUNT(*) FILTER (WHERE battery_status != 'OK')::int as battery_abnormal_count,
        COUNT(*) FILTER (WHERE valve_health != 'Normal')::int as valve_abnormal_count,
        COUNT(*) FILTER (WHERE reverse_flow > 0.05)::int as reverse_flow_count,
        MAX(decoded_at) as latest_frame_at,
        COUNT(*) FILTER (WHERE rssi >= -80)::int as rssi_excellent,
        COUNT(*) FILTER (WHERE rssi < -80 AND rssi >= -95)::int as rssi_good,
        COUNT(*) FILTER (WHERE rssi < -95 AND rssi >= -105)::int as rssi_fair,
        COUNT(*) FILTER (WHERE rssi < -105)::int as rssi_poor,
        COUNT(*) FILTER (WHERE snr >= 0)::int as snr_excellent,
        COUNT(*) FILTER (WHERE snr < 0 AND snr >= -5)::int as snr_good,
        COUNT(*) FILTER (WHERE snr < -5 AND snr >= -12)::int as snr_fair,
        COUNT(*) FILTER (WHERE snr < -12)::int as snr_poor
      FROM raw_telemetry_packets
      WHERE date_key >= $1 AND date_key <= $2 ${siteFilter}
    `, range),
    pool.query(`
      SELECT COUNT(*)::int as count FROM (
        SELECT meter_id FROM raw_telemetry_packets
        WHERE date_key >= $1 AND date_key <= $2 ${siteFilter}
        GROUP BY meter_id HAVING COUNT(DISTINCT gateway_id) > 1
      ) sub
    `, range),
    pool.query(`
      SELECT
        gateway_id,
        COUNT(DISTINCT meter_id)::int as unique_meters,
        COUNT(*)::int as frame_count,
        MAX(decoded_at) as latest_decoded_at,
        COALESCE(AVG(rssi)::numeric(10,1), -90)::float as avg_rssi,
        COALESCE(AVG(snr)::numeric(10,1), -10)::float as avg_snr
      FROM raw_telemetry_packets
      WHERE date_key >= $1 AND date_key <= $2 ${siteFilter}
      GROUP BY gateway_id
      ORDER BY unique_meters DESC, frame_count DESC
    `, range),
    pool.query(`
      SELECT TO_CHAR(decoded_at, 'HH24:00') as hour_str, COUNT(*)::int as count
      FROM raw_telemetry_packets
      WHERE date_key >= $1 AND date_key <= $2 ${siteFilter}
      GROUP BY hour_str
      ORDER BY hour_str ASC
    `, range),
    pool.query(`SELECT * FROM raw_telemetry_packets WHERE TRUE ${siteFilter.replace('$3', '$1')} ORDER BY decoded_at DESC LIMIT 100`, scoped ? [siteGatewayIds] : []),
  ]);

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
      let status: 'reporting' | 'degraded' | 'stale' | 'no-traffic' = 'reporting' as 'reporting' | 'degraded' | 'stale' | 'no-traffic';
      if (!r) status = 'stale'; // heard meters upstream, but no packets in our store for this window
      else if (r.avg_rssi < -105 || r.avg_snr < -15) status = 'degraded';

      return {
        gatewayId,
        alias: getGatewayAlias(gatewayId),
        uniqueMeters: upstreamMeters.get(gatewayId) ?? r?.unique_meters ?? 0,
        frameCount: r?.frame_count ?? 0,
        lastFrameText: r ? formatRelativeTime(r.latest_decoded_at) : 'n/a',
        lastFrameDecodedAt: (r?.latest_decoded_at ?? '') as string,
        avgRssi: r?.avg_rssi ?? 0,
        avgSnr: r?.avg_snr ?? 0,
        trendText: '+3.8% vs 7d',
        status,
      };
    })
    .sort((a, b) => b.uniqueMeters - a.uniqueMeters || b.frameCount - a.frameCount);

  // Meters are loaded per gateway on demand (see getGatewayMeters) to keep this payload small.
  const metersByGateway: Record<string, any[]> = {};

  const hourlyActivityMap = new Map<string, number>();
  for (let h = 0; h < 24; h++) {
    hourlyActivityMap.set(`${String(h).padStart(2, '0')}:00`, 0);
  }
  for (const r of hourlyRes.rows) {
    hourlyActivityMap.set(r.hour_str, r.count);
  }
  const hourlyActivity = Array.from(hourlyActivityMap.entries()).map(([hour, count]) => ({
    hour,
    count,
  }));

  const radioRow = kpiRow;

  const recentFrames = framesRes.rows.map((r: any, idx: number) => ({
    id: `pg-frame-${idx}-${r.meter_id}`,
    decodedAt: r.decoded_at,
    meterTimestamp: r.meter_timestamp || r.decoded_at,
    meterId: r.meter_id,
    devEui: r.dev_eui,
    gatewayId: r.gateway_id,
    gatewayAlias: getGatewayAlias(r.gateway_id),
    fCnt: r.fcnt,
    fPort: r.fport,
    frequency: r.frequency,
    dr: r.dr,
    rssi: r.rssi,
    snr: r.snr,
    confirmed: r.confirmed,
    adr: r.adr,
    checksumStatus: r.checksum_status,
    statusByte: r.status_byte,
    statusEvent: r.reverse_flow > 0.05 ? 'WEAK_RSSI' : 'FRAME_RECEIVED',
  }));

  const summary: TelemetrySummary = {
    dateRange: { fromDate, toDate, days },
    generatedAt: new Date().toISOString(),
    source: 'postgresql',
    kpis: {
      gatewaysWithTraffic: gateways.filter((g) => g.status !== 'stale' && g.status !== 'no-traffic').length,
      totalConfiguredGateways: gateways.length,
      noRecentTrafficGateways: gateways.filter((g) => g.status === 'stale' || g.status === 'no-traffic').length,
      uniqueMetersSeen: upstreamSummary?.totalUniqueMeters ?? kpiRow.unique_meters_seen ?? 0,
      configuredMeters: upstreamSummary?.totalUniqueMeters ?? kpiRow.unique_meters_seen ?? 0,
      framesReceived: kpiRow.frames_received ?? 0,
      framesTrend: '+6.5% vs 7d',
      lastFrameAge: formatRelativeTime(kpiRow.latest_frame_at),
      multiGatewayMeters: upstreamSummary?.metersOnMultipleGateways ?? multiGatewayMeters,
      avgRssi: kpiRow.avg_rssi ?? -90,
      avgSnr: kpiRow.avg_snr ?? -10,
      batteryAbnormalCount: kpiRow.battery_abnormal_count ?? 0,
      valveAbnormalCount: kpiRow.valve_abnormal_count ?? 0,
      reverseFlowCount: kpiRow.reverse_flow_count ?? 0,
    },
    gateways,
    metersByGateway,
    allMetersCount: upstreamSummary?.totalUniqueMeters ?? kpiRow.unique_meters_seen ?? 0,
    recentFrames,
    hourlyActivity,
    radioHealth: {
      avgRssi: kpiRow.avg_rssi ?? -90,
      avgSnr: kpiRow.avg_snr ?? -10,
      rssiBuckets: {
        excellent: radioRow.rssi_excellent ?? 0,
        good: radioRow.rssi_good ?? 0,
        fair: radioRow.rssi_fair ?? 0,
        poor: radioRow.rssi_poor ?? 0,
      },
      snrBuckets: {
        excellent: radioRow.snr_excellent ?? 0,
        good: radioRow.snr_good ?? 0,
        fair: radioRow.snr_fair ?? 0,
        poor: radioRow.snr_poor ?? 0,
      },
    },
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
