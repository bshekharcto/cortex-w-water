import { Router } from 'express';
import { pool } from '../db/pool.js';
import { config } from '../config/env.js';
import { proxyUpstream } from '../services/upstreamProxy.js';
import { fetchAndAggregateTelemetry } from '../services/telemetryAggregator.js';
import { getPostgresAggregatedSummary } from '../services/telemetryDbService.js';
import { syncLatestTelemetry } from '../services/telemetrySyncWorker.js';

const router = Router();

// ---------- Telemetry Sync & Cron Job ----------

router.all('/sync-cron', async (req, res) => {
  try {
    // Optional Vercel CRON_SECRET authorization check
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'Unauthorized: invalid CRON_SECRET' });
      }
    }

    const customDate = req.query.date as string | undefined;
    const customDates = customDate ? [customDate] : undefined;

    console.log('[commandCenter] Cron/Manual sync triggered:', {
      ip: req.ip,
      method: req.method,
      customDate,
    });

    const result = await syncLatestTelemetry(customDates);
    return res.json({
      status: result.success ? 'success' : 'error',
      ...result,
    });
  } catch (err: any) {
    console.error('[commandCenter] Cron sync failed:', err);
    return res.status(500).json({ error: 'Sync failed', message: err.message });
  }
});

// ---------- Live Telemetry Aggregator (PostgreSQL 7-Day Default & Sub-second Feed) ----------

router.get('/summary', async (req, res) => {
  try {
    const days = parseInt((req.query.days as string) || '7', 10);
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const refresh = req.query.refresh === 'true';
    const siteId = (req.query.siteId as string) || (req.query.siteIds as string) || 'ALL';

    try {
      const pgSummary = await getPostgresAggregatedSummary(days, date, refresh, siteId);
      return res.json(pgSummary);
    } catch (pgErr: any) {
      console.warn('[commandCenter] Fallback to memory aggregator:', pgErr.message);
      const fallback = await fetchAndAggregateTelemetry(date, refresh);
      return res.json(fallback);
    }
  } catch (err: any) {
    console.error('[commandCenter] Error generating telemetry summary:', err);
    res.status(500).json({ error: 'Failed to aggregate telemetry', message: err.message });
  }
});

router.get('/feed', async (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || '100', 10);
    try {
      const result = await pool.query(
        'SELECT * FROM raw_telemetry_packets ORDER BY decoded_at DESC LIMIT $1',
        [limit]
      );
      if (result.rows.length > 0) {
        return res.json(
          result.rows.map((r: any, idx: number) => ({
            id: `feed-${r.id || idx}-${r.meter_id}`,
            decodedAt: r.decoded_at,
            meterTimestamp: r.meter_timestamp || r.decoded_at,
            meterId: r.meter_id,
            devEui: r.dev_eui,
            gatewayId: r.gateway_id,
            gatewayAlias: `GW-${(r.gateway_id || '').slice(-3).toUpperCase()}`,
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
          }))
        );
      }
    } catch (pgErr) {
      // ignore and fallback
    }

    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const summary = await fetchAndAggregateTelemetry(date, false);
    res.json((summary.recentFrames || []).slice(0, limit));
  } catch (err: any) {
    console.error('[commandCenter] Error getting live feed:', err);
    res.status(500).json({ error: 'Failed to get live feed', message: err.message });
  }
});

// ---------- Dashboard ----------

router.get('/water-summary', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    return res.json({
      'Total Households':  { value: '193125', lastUpdated: '2026-09-04T18:00:00Z' },
      'Active Meters':     { value: '2532',   lastUpdated: '2026-09-04T18:00:00Z' },
      'Water Consumption': { value: '2338.92', lastUpdated: '2026-09-04T18:00:00Z' },
      'Average Consumption': { value: '0.9', lastUpdated: '2026-09-04T18:00:00Z' },
    });
  }
  const { fromDate, toDate, siteIds } = req.query as Record<string, string>;
  const upstream = await proxyUpstream('POST', '/api/module/water-summary', {
    body: {
      propertyNameList: ['Total Households', 'Active Meters', 'Water Consumption', 'Average Consumption'],
      startDate: `${fromDate}T00:00:00.000+05:30`,
      endDate: `${toDate}T23:59:59.999+05:30`,
    },
    headers: { Authorization: req.headers.authorization ?? '' },
  });
  res.status(upstream.status).json(upstream.data);
});

router.get('/executive-summary', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    return res.json({
      householdsOnboarded: 193125, metersConfigured: 27996, householdsMapped: 18364,
      meterReplacementsYesterday: 3, criticalAlerts: 2, openMaintenanceRequests: 5,
      closedMaintenanceRequests: 12, topAlertTypes: ['Battery Abnormal', 'Valve Abnormal'],
      region: 'BHUBANESWAR', fromDate: '2026-09-01', toDate: '2026-09-04',
    });
  }
  // Upstream uses toDate, not endDate (spec 28.1)
  const { fromDate, toDate } = req.query as Record<string, string>;
  const upstream = await proxyUpstream('POST', `/api/water/executive-summary?fromDate=${fromDate}&toDate=${toDate}`, {
    body: { page: 0, size: 10 },
    headers: { Authorization: req.headers.authorization ?? '' },
  });
  res.status(upstream.status).json(upstream.data);
});

// ---------- Command Center ----------

router.get('/gateway-summary', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    const result = await pool.query(
      'SELECT gateway_id, alias, meters_observed, linked_meters, avg_rssi, avg_snr, battery_abnormal, valve_abnormal, latest_decoded_at FROM gateways ORDER BY meters_observed DESC',
    );
    const rows = result.rows;
    return res.json({
      totalUniqueMeters: rows.reduce((s: number, r: any) => s + r.meters_observed, 0),
      gatewayCount: rows.length,
      metersOnMultipleGateways: 0,
      perGateway: rows.map((r: any) => ({ gatewayId: r.gateway_id, uniqueMeterCount: r.meters_observed, alias: r.alias, avgRssi: r.avg_rssi, avgSnr: r.avg_snr, batteryAbnormal: r.battery_abnormal, valveAbnormal: r.valve_abnormal, latestDecodedAt: r.latest_decoded_at })),
    });
  }
  // Upstream: siteIds is comma-joined for this endpoint (spec 28.2)
  const { fromDate, toDate, siteIds } = req.query as Record<string, string>;
  const upstream = await proxyUpstream('GET', '/api/water/gateway-meter-summary', {
    query: { siteIds: siteIds ?? '', fromDate, toDate },
    headers: { Authorization: req.headers.authorization ?? '' },
  });
  res.status(upstream.status).json(upstream.data);
});

router.get('/meter-health', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    const result = await pool.query(
      'SELECT meter_id, household_id, gateway_id, decoded_at, rssi, battery_health, valve_health FROM meters ORDER BY decoded_at DESC',
    );
    return res.json(result.rows.map((r: any) => ({
      assetId: 0, meterId: r.meter_id, householdId: r.household_id,
      gatewayId: r.gateway_id, decodedAt: r.decoded_at, rssi: r.rssi,
      batteryStatus: r.battery_health, lastSeenDate: r.decoded_at, timeZone: 'Asia/Kolkata',
    })));
  }
  // Upstream: siteIds as repeated query params (spec 28.2)
  const siteIds = (req.query.siteIds as string)?.split(',') ?? [];
  const upstream = await proxyUpstream('GET', '/api/water/meter-health', {
    query: { siteIds },
    headers: { Authorization: req.headers.authorization ?? '' },
  });
  res.status(upstream.status).json(upstream.data);
});

router.get('/gateway-performance', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    const result = await pool.query('SELECT gateway_id, latest_decoded_at, meters_observed FROM gateways');
    return res.json(result.rows.map((r: any) => ({
      gatewayId: r.gateway_id, date: '2026-09-04', activeMeterCount: r.meters_observed,
    })));
  }
  const { fromDate, toDate, siteIds } = req.query as Record<string, string>;
  const upstream = await proxyUpstream('GET', '/api/water/gateway-performance', {
    query: { siteIds: (siteIds ?? '').split(','), fromDate, toDate },
    headers: { Authorization: req.headers.authorization ?? '' },
  });
  res.status(upstream.status).json(upstream.data);
});

router.post('/latest-meter-status', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    const { page = 0, size = 20 } = req.body ?? {};
    const result = await pool.query(
      'SELECT * FROM meters ORDER BY decoded_at DESC LIMIT $1 OFFSET $2',
      [size, page * size],
    );
    const countResult = await pool.query('SELECT COUNT(*) FROM meters');
    const total = parseInt(countResult.rows[0].count, 10);
    return res.json({
      content: result.rows.map((r: any) => ({
        meterId: r.meter_id, householdId: r.household_id, gatewayId: r.gateway_id,
        currentReading: r.forward_flow_l, batteryVoltage: r.battery_voltage,
        batteryHealth: r.battery_health, valveHealth: r.valve_health, rssi: r.rssi,
        snr: r.snr, valveStatus: r.valve_status === 'Closed', checksumStatus: r.checksum_status,
        decodedAt: r.decoded_at, meterTimestamp: r.meter_timestamp,
        siteId: String(r.site_id), siteName: 'BHUBANESWAR',
      })),
      totalElements: total, totalPages: Math.ceil(total / size),
      size, number: page, first: page === 0, last: (page + 1) * size >= total, empty: total === 0,
      numberOfElements: result.rows.length,
    });
  }
  const upstream = await proxyUpstream('POST', '/api/water/latest-meter-status/page', {
    body: req.body,
    headers: { Authorization: req.headers.authorization ?? '' },
  });
  res.status(upstream.status).json(upstream.data);
});

router.post('/raw-telemetry', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    const { cursor, size = 20 } = req.body ?? {};
    const result = await pool.query(
      'SELECT * FROM meters ORDER BY decoded_at DESC LIMIT $1',
      [size],
    );
    return res.json({
      content: result.rows.map((r: any) => ({
        meterId: r.meter_id, householdId: r.household_id, gatewayId: r.gateway_id,
        forwardFlowL: r.forward_flow_l, rssi: r.rssi, snr: r.snr,
        decodedAt: r.decoded_at, meterTimestamp: r.meter_timestamp,
      })),
      nextCursor: null, hasMore: false, estimatedTotal: result.rows.length,
    });
  }
  // Upstream uses endDate, not toDate (spec 28.1)
  const { fromDate, toDate } = req.body ?? {};
  const upstream = await proxyUpstream('POST', `/api/water/raw-data/cursor?fromDate=${fromDate}&endDate=${toDate}&rawReport=true`, {
    body: { cursor: req.body.cursor, size: req.body.size },
    headers: { Authorization: req.headers.authorization ?? '' },
  });
  res.status(upstream.status).json(upstream.data);
});

export default router;
