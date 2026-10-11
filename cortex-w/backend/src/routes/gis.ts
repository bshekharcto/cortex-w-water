import { Router } from 'express';
import { proxyUpstream } from '../services/upstreamProxy.js';
import { config } from '../config/env.js';
import { pool } from '../db/pool.js';
import { localDate } from '../services/localDate.js';
import { requireClient, scopeSiteIds, rootSites } from '../services/clientContext.js';
import { clientTenantIds } from '../services/tenantScope.js';

const router = Router();

// In-memory cache for live GIS meters to avoid re-fetching ~5.5MB payloads on every view change
interface CachedGisData {
  timestamp: number;
  siteId: string;
  gateways: any[];
  meters: any[];
  summary: {
    totalMeters: number;
    activeCount: number;
    warningCount: number;
    problemCount: number;
    gatewayCount: number;
  };
}

// Keyed by client AND site: one client's payload must never be served to another.
const gisCache = new Map<string, CachedGisData>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds cache

/**
 * The token to call upstream with: always the signed-in client's own, so
 * upstream applies that client's permissions. There is deliberately no
 * service-account fallback — outside an authenticated request this throws.
 */
export async function getAuthToken(_providedHeader?: string): Promise<string> {
  const ctx = requireClient();
  return ctx.token; // '' in seed mode, where nothing calls upstream
}

/** A site to use when the request names none: the client's first top-level site. */
function defaultSiteId(): string {
  const ctx = requireClient();
  const first = rootSites(ctx)[0];
  return first ? String(first.id) : 'ALL';
}

export async function getLiveGisData(authHeader?: string, siteId: string = 'ALL') {
  const now = Date.now();
  const cacheKey = `${requireClient().key}|${siteId}`;
  const cachedGis = gisCache.get(cacheKey);
  if (cachedGis && now - cachedGis.timestamp < CACHE_TTL_MS) {
    return cachedGis;
  }

  const today = localDate(0);
  const lastWeek = localDate(-7);

  const headers: Record<string, string> = {};
  const token = await getAuthToken(authHeader);
  if (token) {
    headers['Authorization'] = token;
  }

  // If siteId is 'ALL', omit siteIds so Cognecto returns all cities (Bhubaneswar, Puri, Cuttack)
  const isAll = !siteId || siteId.toUpperCase() === 'ALL';
  const siteQuery: Record<string, string> = isAll ? {} : { siteIds: siteId };

  // Fetch in parallel
  const [geoRes, perfRes, locRes, healthRes, dbTelemetryRes] = await Promise.all([
    proxyUpstream('GET', '/api/map/geofence', {
      query: siteQuery,
      headers,
    }).catch(() => ({ status: 500, data: null })),
    proxyUpstream('GET', '/api/water/gateway-performance', {
      query: { ...siteQuery, fromDate: lastWeek, toDate: today },
      headers,
    }).catch(() => ({ status: 500, data: null })),
    proxyUpstream('GET', '/api/map/asset-locations', {
      query: siteQuery,
      headers,
    }).catch(() => ({ status: 500, data: null })),
    proxyUpstream('GET', '/api/water/meter-health', {
      query: siteQuery,
      headers,
    }).catch(() => ({ status: 500, data: null })),
    pool.query(`
      WITH latest_reading AS (
        -- Same intra-day retry-packet corruption as the per-day readings
        -- queries: pick the most recent CALENDAR DAY per meter, then the
        -- highest (correct) reading within that day, rather than whichever
        -- packet happened to arrive last — a lower-valued same-day retry
        -- would otherwise silently show as a too-low "current reading".
        SELECT DISTINCT ON (meter_id)
          meter_id, decoded_at, forward_flow_kl AS current_reading_kl, dev_eui
        FROM water_meter_readings_v2
        ORDER BY meter_id, date_key DESC, forward_flow_kl DESC, time DESC
      ),
      yesterday AS (
        SELECT meter_id, total_consumption_kl AS yesterday_kl
        FROM water_daily_summary
        WHERE summary_date = ($1::date - INTERVAL '1 day')::date
      ),
      last10d AS (
        SELECT meter_id, SUM(total_consumption_kl) AS last10d_kl
        FROM water_daily_summary
        WHERE summary_date >= ($1::date - INTERVAL '10 days')::date
        GROUP BY meter_id
      ),
      month_total AS (
        SELECT meter_id, total_consumption_kl AS month_kl
        FROM water_monthly_summary
        WHERE summary_month = DATE_TRUNC('month', $1::date)::date
      )
      SELECT
        lr.meter_id, lr.decoded_at AS last_seen, lr.current_reading_kl, lr.dev_eui,
        COALESCE(y.yesterday_kl, 0) AS yesterday_kl,
        COALESCE(l10.last10d_kl, 0) AS last10d_kl,
        COALESCE(m.month_kl, 0) AS month_kl
      FROM latest_reading lr
      LEFT JOIN yesterday y ON y.meter_id = lr.meter_id
      LEFT JOIN last10d l10 ON l10.meter_id = lr.meter_id
      LEFT JOIN month_total m ON m.meter_id = lr.meter_id
    `, [localDate(0)]).catch((err) => {
      console.warn('[gis] DB telemetry query notice:', err.message);
      return { rows: [] };
    }),
  ]);

  const geofences = Array.isArray(geoRes.data) ? geoRes.data : [];
  const perfList = Array.isArray(perfRes.data) ? perfRes.data : [];
  const locations = typeof locRes.data === 'object' && locRes.data !== null ? (locRes.data as Record<string, any>) : {};
  const healthList = Array.isArray(healthRes.data) ? healthRes.data : [];

  // Build lookup map for real meter telemetry (readings, consumption) from PostgreSQL
  const dbMeterDataMap = new Map<string, any>();
  if (dbTelemetryRes && Array.isArray(dbTelemetryRes.rows)) {
    dbTelemetryRes.rows.forEach((r: any) => {
      if (!r.meter_id) return;
      const iso = r.last_seen ? new Date(r.last_seen).toISOString() : null;
      const entry = {
        lastSeen: iso,
        currentReadingKl: r.current_reading_kl !== null ? Number(r.current_reading_kl) : null,
        devEui: r.dev_eui || null,
        yesterdayKl: Number(r.yesterday_kl) || 0,
        last10dKl: Number(r.last10d_kl) || 0,
        monthKl: Number(r.month_kl) || 0,
      };
      const raw = String(r.meter_id);
      dbMeterDataMap.set(raw, entry);
      const clean = raw.replace(/^0+/, '');
      dbMeterDataMap.set(clean, entry);
      dbMeterDataMap.set(clean.padStart(10, '0'), entry);
    });
  }

  console.log(`[gis] Upstream fetch for site ${siteId}: geofences=${geofences.length}, locations=${Object.keys(locations).length}, health=${healthList.length}, dbMetersWithTelemetry=${dbMeterDataMap.size}`);

  // 1. Process Gateways
  const gateways = geofences.map((g: any) => {
    const coords = g.geofenceCoordinates?.[0] || {};
    const match = g.name.match(/gw[- ]?([0-9a-fA-F]+)/i);
    const hex = match ? match[1].toLowerCase() : '';
    const gwPerf = perfList.filter((p: any) => p.gatewayId && (p.gatewayId.endsWith(hex) || p.gatewayId.includes(hex)));
    const latestPerf = gwPerf[gwPerf.length - 1];
    const activeCount = latestPerf?.activeMeterCount || 0;

    const radiusMeters = g.radius || 1000;
    const avgRssi = activeCount > 0 ? -82 : -98;
    const avgSnr = activeCount > 0 ? 9 : 4;
    return {
      id: String(g.id),
      alias: (g.name || 'Gateway').trim(),
      gatewayId: latestPerf?.gatewayId || (hex ? '506f98000000' + hex.padStart(4, '0') : String(g.id)),
      lat: coords.latitude || 20.2961,
      lng: coords.longitude || 85.8245,
      radius: radiusMeters,
      radiusMeters,
      address: g.address || '',
      status: activeCount > 0 ? 'reporting' : 'degraded',
      activeMeters: activeCount,
      metersObserved: activeCount,
      avgRssi,
      avgSnr,
    };
  });

  // Map gateways for fast lookup
  const gwMap = new Map<string, any>();
  gateways.forEach((gw: any) => {
    gwMap.set(gw.gatewayId, gw);
  });

  // 2. Process Meters with GPS join across all cities (Bhubaneswar, Puri, Cuttack)
  let activeCount = 0;
  let warningCount = 0;
  let problemCount = 0;

  const meters = healthList.map((h: any) => {
    const loc = locations[String(h.assetId)] || locations[h.assetId];
    const rssi = typeof h.rssi === 'number' ? h.rssi : -100;
    const gw = gwMap.get(h.gatewayId);

    let status: 'active' | 'weak' | 'silent' = 'active';
    if (rssi < -105) {
      status = 'silent';
      problemCount++;
    } else if (rssi < -95) {
      status = 'weak';
      warningCount++;
    } else {
      activeCount++;
    }

    const shortId = (h.householdId || `${h.assetId}`).split('/').pop() || `${h.assetId}`;
    const hhId = h.householdId || '';
    const locSiteId = loc?.siteId;

    // Detect city accurately
    const isPuri = hhId.includes('/PRI/') || hhId.includes('PRI') || locSiteId === 6908;
    const isCuttack = hhId.includes('/CTC/') || hhId.includes('CTC') || locSiteId === 6916;
    const city = isPuri ? 'Puri' : isCuttack ? 'Cuttack' : 'Bhubaneswar';

    let defaultLocality = 'Bhubaneswar Zone';
    let defaultGatewayAlias = 'Bhubaneswar Base';
    if (isPuri) {
      defaultLocality = 'Puri Coastal Zone';
      defaultGatewayAlias = 'Puri LoRa Link';
    } else if (isCuttack) {
      defaultLocality = 'Cuttack CDA / Sector 11';
      defaultGatewayAlias = 'GW-2a0 (sector 11)';
    }

    const rawMeterId = String(h.meterId || h.assetId || '');
    const cleanId = rawMeterId.replace(/^0+/, '');
    const paddedId = cleanId.padStart(10, '0');
    const dbData = dbMeterDataMap.get(rawMeterId) || dbMeterDataMap.get(paddedId) || dbMeterDataMap.get(cleanId);
    const finalLastSeen = dbData?.lastSeen || h.lastSeenDate || h.decodedAt || 'Never';

    let recencyBucket: 'last72h' | 'last10d' | 'last30d' | 'never' = 'never';
    if (finalLastSeen && finalLastSeen !== 'Never') {
      const ts = new Date(finalLastSeen).getTime();
      if (!isNaN(ts)) {
        const ageHours = Math.max(0, now - ts) / (1000 * 3600);
        if (ageHours <= 72) recencyBucket = 'last72h';
        else if (ageHours <= 240) recencyBucket = 'last10d';
        else if (ageHours <= 720) recencyBucket = 'last30d';
        else recencyBucket = 'never';
      }
    }

    return {
      id: h.meterId || String(h.assetId),
      assetId: h.assetId,
      meterId: h.meterId || `M-${h.assetId}`,
      devEui: h.devEui || dbData?.devEui || null,
      householdId: h.householdId || `WS/${isPuri ? 'PRI' : isCuttack ? 'CTC' : 'BMC'}/${h.assetId}`,
      householdShortId: shortId,
      householdName: h.householdName || `Consumer (${shortId})`,
      city,
      locality: gw?.alias ? gw.alias.replace(/^Gw-[^ ]+ /i, '').replace(/[()]/g, '') : defaultLocality,
      gatewayId: h.gatewayId || (isCuttack ? '506f9800000002a0' : ''),
      gatewayAlias: gw?.alias || defaultGatewayAlias,
      // No real distance-to-gateway calculation exists yet (needs real lat/lng
      // math against the gateway's own coordinates) — null, not a fake number.
      distanceMeters: null,
      lat: loc?.latitude ?? null,
      lng: loc?.longitude ?? null,
      status,
      rssi,
      snr: Math.round((rssi + 120) / 4),
      lastSeen: finalLastSeen,
      recencyBucket,
      // No real pipe-diameter/connection-type/install-date source exists in
      // this codebase — null rather than a fabricated constant.
      pipeDiameter: null,
      connectionType: null,
      installDate: null,
      currentReadingM3: dbData?.currentReadingKl ?? null,
      yesterdayConsumptionL: dbData ? Math.round(dbData.yesterdayKl * 1000) : null,
      monthConsumptionM3: dbData ? Number(dbData.monthKl.toFixed(3)) : null,
      last10DaysTotalL: dbData ? Math.round(dbData.last10dKl * 1000) : null,
      lastSeenDate: finalLastSeen !== 'Never' ? finalLastSeen : '',
      decodedAt: finalLastSeen !== 'Never' ? finalLastSeen : '',
    };
  }).filter((m: any) => m.lat !== null && m.lng !== null);

  const fresh: CachedGisData = {
    timestamp: now,
    siteId,
    gateways,
    meters,
    summary: {
      totalMeters: meters.length,
      activeCount,
      warningCount,
      problemCount,
      gatewayCount: gateways.length,
    },
  };
  gisCache.set(cacheKey, fresh);
  return fresh;
}

// GET /api/gis/gateways
router.get('/gateways', async (req, res) => {
  try {
    const siteId = (req.query.siteId as string) || 'ALL';
    if (scopeSiteIds(requireClient(), siteId) === null) return res.status(404).json({ error: 'Unknown site' });
    const authHeader = req.headers.authorization;
    const data = await getLiveGisData(authHeader, siteId);
    res.json(data.gateways);
  } catch (err: any) {
    console.error('[gis] Error fetching gateways:', err.message);
    res.status(500).json({ error: 'Failed to fetch gateways' });
  }
});

// GET /api/gis/meters
router.get('/meters', async (req, res) => {
  try {
    const siteId = (req.query.siteId as string) || 'ALL';
    if (scopeSiteIds(requireClient(), siteId) === null) return res.status(404).json({ error: 'Unknown site' });
    const city = req.query.city as string | undefined;
    const gatewayId = req.query.gatewayId as string | undefined;
    const problemsOnly = req.query.problemsOnly === 'true';
    const search = (req.query.search as string | undefined)?.toLowerCase();
    const limitQuery = req.query.limit as string | undefined;
    const limit = limitQuery && limitQuery !== 'all' ? parseInt(limitQuery, 10) : 0;

    const authHeader = req.headers.authorization;
    const data = await getLiveGisData(authHeader, siteId);

    let filtered = data.meters;

    if (city && city !== 'ALL') {
      filtered = filtered.filter((m) => m.city?.toLowerCase() === city.toLowerCase());
    }

    if (gatewayId && gatewayId !== 'all') {
      filtered = filtered.filter((m) => m.gatewayId === gatewayId || m.gatewayId.includes(gatewayId));
    }

    if (problemsOnly) {
      filtered = filtered.filter((m) => m.status === 'problem' || m.status === 'weak' || m.status === 'silent');
    }

    if (search) {
      filtered = filtered.filter((m) =>
        m.meterId.toLowerCase().includes(search) ||
        m.householdId.toLowerCase().includes(search) ||
        m.gatewayId.toLowerCase().includes(search)
      );
    }

    const resultMeters = limit > 0 ? filtered.slice(0, limit) : filtered;

    res.json({
      summary: data.summary,
      totalMatching: filtered.length,
      returnedCount: resultMeters.length,
      meters: resultMeters,
    });
  } catch (err: any) {
    console.error('[gis] Error fetching meters:', err.message);
    res.status(500).json({ error: 'Failed to fetch meters' });
  }
});

// GET /api/gis/performance
router.get('/performance', async (req, res) => {
  try {
    const siteId = (req.query.siteId as string) || defaultSiteId();
    if (scopeSiteIds(requireClient(), siteId) === null) return res.status(404).json({ error: 'Unknown site' });
    const today = localDate(0);
    const lastWeek = localDate(-7);
    const fromDate = (req.query.fromDate as string) || lastWeek;
    const toDate = (req.query.toDate as string) || today;

    const authHeader = req.headers.authorization;
    const perfRes = await proxyUpstream('GET', '/api/water/gateway-performance', {
      query: { siteIds: siteId, fromDate, toDate },
      headers: authHeader ? { Authorization: authHeader } : {},
    });

    res.json(perfRes.data || []);
  } catch (err: any) {
    console.error('[gis] Error fetching gateway performance:', err.message);
    res.status(500).json({ error: 'Failed to fetch gateway performance' });
  }
});

// GET /api/gis/meter-detail/:assetId
// One meter for the Meter 360 drawer. Everything about the meter's readings comes from Postgres, the same tables and rules
// as the Dashboard (water_meter_daily for the days, water_meter_latest for the newest frame, the site's own time zone for
// "yesterday" and "this month"). The beta API is asked only for what Postgres does not hold: contact details, photos, the
// replacement history and the latest bill. If one of those calls fails the rest is still returned and the part is named in
// `unavailable`; a value nobody knows is null, never a stand-in. With ?core=1 the beta API is not called at all: the answer
// comes from Postgres alone (fast), and `partial: true` says the beta parts are still to be asked for.
router.get('/meter-detail/:assetId', async (req, res) => {
  try {
    const assetId = Number(req.params.assetId);
    const meterIdParam = (req.query.meterId as string) || '';
    if (!Number.isInteger(assetId)) return res.status(404).json({ error: 'Meter not found' });

    // The meter must be one of this client's own, and so must any meterId passed with it: the beta lookups below are not
    // scoped to the caller, so an own assetId with someone else's meterId would otherwise return their consumer details.
    // 404, not 403, so ids can't be probed.
    const metaRes = await pool.query(
      `SELECT m.meter_id, m.asset_id, m.site_id, m.consumer_name, m.household_custom_id, m.address, m.ward,
              COALESCE(s.tz_sql, 'UTC') AS tz,
              l.decoded_at, l.forward_flow_kl, l.rssi, l.snr, l.gateway_id, l.dev_eui
         FROM meter_metadata m
         LEFT JOIN site_metadata s ON s.site_id = m.site_id
         LEFT JOIN water_meter_latest l ON l.meter_id = m.meter_id
        WHERE m.asset_id = $1
          AND ($2::bigint[] IS NULL OR m.tenant_id = ANY($2::bigint[]))
          AND ($3 = '' OR m.meter_id = $3)
        LIMIT 1`,
      [assetId, clientTenantIds(), meterIdParam]
    );
    const meta = metaRes.rows[0];
    if (!meta) return res.status(404).json({ error: 'Meter not found' });
    const meterId: string = meta.meter_id;

    const token = await getAuthToken(req.headers.authorization);
    const headers: Record<string, string> = token ? { Authorization: token } : {};
    const today = localDate(0);
    const last30Days = localDate(-30);

    // A call that threw or got a server error is "unavailable"; a 404/204 just means there is nothing to show.
    const unavailable: string[] = [];
    const coreOnly = req.query.core === '1';
    const call = async (name: string, run: () => Promise<{ status: number; data: unknown }>) => {
      if (coreOnly) return null;
      try {
        const r = await run();
        if (r.status >= 500) unavailable.push(name);
        return r.status >= 200 && r.status < 300 ? r.data : null;
      } catch {
        unavailable.push(name);
        return null;
      }
    };

    const [asset, imeiData, imagesData, latestBill, hhDetail, daily, summary, frame] = await Promise.all([
      call('consumer', () => proxyUpstream('GET', `/api/asset/${assetId}`, { headers })) as Promise<any>,
      call('replacement history', () => proxyUpstream('GET', `/api/household/imei-history`, { query: { assetId: String(assetId) }, headers })),
      call('photos', () => proxyUpstream('GET', `/api/water/meter-image/${assetId}`, { headers })),
      call('bill', () => proxyUpstream('GET', `/api/billing/latest-bill/${assetId}`, { headers })) as Promise<any>,
      call('consumer', () =>
        proxyUpstream('POST', `/api/water/household-meter-details`, {
          body: { searchType: 'METER_NUMBER', value: meterId, fromDate: last30Days, toDate: today },
          headers,
        })
      ) as Promise<any>,
      // the last 10 days that have a reading (day as text: a DATE read through a JS Date shifts a day in time zones east of UTC)
      pool.query(
        `SELECT day::text AS day, reading_kl, used_kl FROM water_meter_daily WHERE meter_id = $1 ORDER BY day DESC LIMIT 10`,
        [meterId]
      ),
      // yesterday and this month at the meter's own site, same rules as the Dashboard
      pool.query(
        `WITH t AS (SELECT (NOW() AT TIME ZONE $2)::date AS today)
         SELECT (SELECT w.used_kl FROM water_meter_daily w, t WHERE w.meter_id = $1 AND w.day = t.today - 1)           AS yesterday_kl,
                (SELECT SUM(w.used_kl) FROM water_meter_daily w, t WHERE w.meter_id = $1 AND w.day >= date_trunc('month', t.today)::date) AS month_kl`,
        [meterId, meta.tz]
      ),
      // the newest live frame's radio settings (the one thing water_meter_latest does not keep)
      pool.query(
        `SELECT time, frequency, dr, adr, f_cnt FROM water_meter_readings_v2 WHERE meter_id = $1 AND is_history = false ORDER BY time DESC LIMIT 1`,
        [meterId]
      ),
    ]);

    const asNum = (v: unknown): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
    const imeiHistories: any[] = Array.isArray(imeiData) ? imeiData : [];
    const images: any[] = Array.isArray(imagesData) ? imagesData : [];

    // Photo attachments from installation records and meter-swap history
    const photos: Array<{ documentId?: number; name: string; category: string; url: string; uploadDate?: string }> = [];
    images.forEach((img: any) => {
      if (img.s3BucketURL) {
        photos.push({ documentId: img.documentId, name: img.name, category: img.category || 'NEW_METER_DOCUMENT', url: img.s3BucketURL, uploadDate: img.uploadDateTime });
      }
    });
    imeiHistories.forEach((ih: any) => {
      if (Array.isArray(ih.attachments)) {
        ih.attachments.forEach((att: any) => {
          if (att.s3BucketURL && !photos.some((p) => p.url === att.s3BucketURL)) {
            photos.push({ documentId: att.documentId, name: att.name, category: att.category || 'OLD_METER_DOCUMENT', url: att.s3BucketURL, uploadDate: att.uploadDateTime });
          }
        });
      }
    });
    const replacement = imeiHistories.find((ih: any) => ih.oldImeiNumber && ih.oldImeiNumber !== ih.newImeiNumber);

    // Oldest first, only days that exist: nothing is padded to ten
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dailyReadings = [...daily.rows].reverse().map((r: any) => {
      const [, mm, dd] = String(r.day).split('-');
      const usedKl = Number(r.used_kl) || 0;
      return {
        date: String(r.day),
        shortDate: `${MONTHS[Number(mm) - 1] ?? mm} ${dd}`,
        readingM3: Number((Number(r.reading_kl) || 0).toFixed(3)),
        consumptionL: Math.round(usedKl * 1000),
        consumptionM3: Number(usedKl.toFixed(3)),
      };
    });

    const yesterdayKl = asNum(summary.rows[0]?.yesterday_kl);
    const monthKl = asNum(summary.rows[0]?.month_kl);
    const f = frame.rows[0];

    res.json({
      assetId,
      meterId,
      assetName: asset?.name ?? null,
      status: asset?.status ?? null,
      latestReading: asNum(meta.forward_flow_kl),
      readingDate: meta.decoded_at ? new Date(meta.decoded_at).toISOString() : null,
      consumption: yesterdayKl == null ? null : Number(yesterdayKl.toFixed(3)),
      monthToDateM3: monthKl == null ? null : Number(monthKl.toFixed(3)),
      signalRssi: asNum(meta.rssi),
      signalSnr: asNum(meta.snr),
      lastSeen: meta.decoded_at ? new Date(meta.decoded_at).toISOString() : null,
      gatewayId: meta.gateway_id ? String(meta.gateway_id).toLowerCase() : null,
      devEui: meta.dev_eui ?? null,
      lastFrame: f ? { time: new Date(f.time).toISOString(), frequencyHz: asNum(f.frequency), dataRate: asNum(f.dr), adr: f.adr ?? null, fCnt: asNum(f.f_cnt) } : null,
      consumer: {
        id: asset?.household?.id ?? null,
        customId: asset?.household?.customId ?? hhDetail?.consumerId ?? meta.household_custom_id ?? null,
        name: asset?.household?.name ?? hhDetail?.consumerName ?? meta.consumer_name ?? null,
        mobile: asset?.household?.mobile ?? null,
        location: asset?.household?.location ?? hhDetail?.address ?? meta.address ?? null,
        ward: asset?.household?.ward ?? meta.ward ?? null,
        status: asset?.household?.status ?? null,
        registrationDate: asset?.household?.registrationDate ?? asset?.createdDate ?? null,
        siteName: asset?.siteName ?? hhDetail?.siteName ?? null,
      },
      replacement: replacement
        ? {
            oldMeterNumber: replacement.oldImeiNumber,
            oldMeterReading: replacement.oldMeterReading,
            newMeterNumber: replacement.newImeiNumber,
            newMeterReading: replacement.newMeterReading,
            date: replacement.uninstalledDate ?? null,
            status: replacement.status ?? null,
          }
        : null,
      photos,
      latestBill: latestBill ?? null,
      dailyReadings,
      partial: coreOnly,
      unavailable: [...new Set(unavailable)],
    });
  } catch (err: any) {
    console.error('[gis] Error fetching meter detail:', err.message);
    res.status(500).json({ error: 'Failed to fetch meter detail' });
  }
});

// Helper: Haversine distance in meters
function computeHaversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// GET /api/gis/geofences & GET /api/gis/geofence
async function handleGeofences(req: any, res: any) {
  try {
    const siteIds = req.query.siteIds || defaultSiteId();
    if (scopeSiteIds(requireClient(), String(siteIds)) === null) return res.status(404).json({ error: 'Unknown site' });
    const authHeader = req.headers.authorization;
    const token = await getAuthToken(authHeader);
    const upstream = await proxyUpstream('GET', '/api/map/geofence', {
      query: { siteIds: String(siteIds) },
      headers: token ? { Authorization: token } : {},
    });
    res.status(upstream.status).json(upstream.data || []);
  } catch (err: any) {
    console.error('[gis] Error fetching geofences:', err.message);
    res.status(500).json({ error: 'Failed to fetch geofences' });
  }
}
router.get('/geofences', handleGeofences);
router.get('/geofence', handleGeofences);

// GET /api/gis/asset-locations
router.get('/asset-locations', async (req, res) => {
  try {
    const siteIds = req.query.siteIds || defaultSiteId();
    if (scopeSiteIds(requireClient(), String(siteIds)) === null) return res.status(404).json({ error: 'Unknown site' });
    const authHeader = req.headers.authorization;
    const token = await getAuthToken(authHeader);
    const upstream = await proxyUpstream('GET', '/api/map/asset-locations', {
      query: { siteIds: String(siteIds) },
      headers: token ? { Authorization: token } : {},
    });
    res.status(upstream.status).json(upstream.data || {});
  } catch (err: any) {
    console.error('[gis] Error fetching asset locations:', err.message);
    res.status(500).json({ error: 'Failed to fetch asset locations' });
  }
});

// POST /api/gis/gateway-placement/compute
router.post('/gateway-placement/compute', async (req, res) => {
  try {
    const siteId = Number(req.body.siteId ?? defaultSiteId());
    if (scopeSiteIds(requireClient(), String(siteId)) === null) return res.status(404).json({ error: 'Unknown site' });
    const gatewayCount = Number(req.body.gatewayCount ?? req.body.numberOfGateways ?? 5);
    const coverageRadiusM = Number(req.body.coverageRadiusM ?? req.body.radius ?? 500);

    const authHeader = req.headers.authorization;
    const token = await getAuthToken(authHeader);
    const headers: Record<string, string> = token ? { Authorization: token } : {};

    // Parallel fetch: upstream compute + existing geofences to enrich nearest existing gateways
    const [computeRes, fenceRes] = await Promise.all([
      proxyUpstream('POST', '/api/map/gateway-placement/compute', {
        body: { siteId, gatewayCount, coverageRadiusM },
        headers,
      }),
      proxyUpstream('GET', '/api/map/geofence', {
        query: { siteIds: String(siteId) },
        headers,
      }).catch(() => ({ status: 500, data: [] })),
    ]);

    if (computeRes.status !== 200 || !computeRes.data) {
      return res.status(computeRes.status).json(computeRes.data || { error: 'Computation failed' });
    }

    const rawData = computeRes.data as any;
    const rawGateways: any[] = Array.isArray(rawData.gateways) ? rawData.gateways : [];
    const fences: any[] = Array.isArray(fenceRes.data) ? fenceRes.data : [];

    // Filter valid existing gateways with coordinates
    const existingGateways = fences.filter((f: any) => f.radius && f.geofenceCoordinates?.[0]);

    // Enrich candidate gateways
    const enrichedGateways = rawGateways.map((g: any, index: number) => {
      const gNum = g.gatewayNumber ?? (index + 1);
      const assigned = g.metersAssigned ?? g.assignedAssetIds?.length ?? 0;
      const covered = g.metersCoveredCount ?? 0;
      const percent = assigned > 0 ? Math.round((covered / assigned) * 100) : 0;
      const avgDist = g.avgDistanceM ? Number(g.avgDistanceM.toFixed(1)) : null;
      const maxDist = g.maxDistanceM ? Number(g.maxDistanceM.toFixed(1)) : null;

      // Find nearest existing gateway using Haversine distance
      let nearestName: string | null = null;
      let nearestDist: number | null = null;

      for (const ex of existingGateways) {
        const coords = ex.geofenceCoordinates[0];
        const d = computeHaversineDistanceM(g.latitude, g.longitude, coords.latitude, coords.longitude);
        if (nearestDist === null || d < nearestDist) {
          nearestDist = d;
          nearestName = ex.name || 'Existing Gateway';
        }
      }

      return {
        ...g,
        gatewayNumber: gNum,
        metersAssigned: assigned,
        metersCoveredCount: covered,
        percentCovered: percent,
        avgDistanceM: avgDist,
        maxDistanceM: maxDist,
        coverageRadiusM,
        nearestExistingName: nearestName,
        nearestExistingDistanceM: nearestDist !== null ? Number(nearestDist.toFixed(1)) : null,
      };
    });

    const totalCovered = rawData.totalMetersCovered ?? enrichedGateways.reduce((sum, g) => sum + g.metersCoveredCount, 0);
    // If upstream doesn't report totalMeters, we have no reliable real count
    // for this site — report null rather than a stale hardcoded guess.
    const totalMeters = rawData.totalMeters ?? null;
    const overallPercent = totalMeters ? Math.round((totalCovered / totalMeters) * 100) : null;

    res.json({
      siteId,
      gatewayCount,
      coverageRadiusM,
      totalMeters,
      totalMetersCovered: totalCovered,
      overallCoveragePercent: overallPercent,
      excludedMeterCount: rawData.excludedMeterCount ?? 0,
      excludedAssetIds: rawData.excludedAssetIds ?? [],
      gateways: enrichedGateways,
      existingGatewaysCount: existingGateways.length,
    });
  } catch (err: any) {
    console.error('[gis] Error computing gateway placement:', err.message);
    res.status(500).json({ error: 'Failed to compute gateway placement' });
  }
});

export default router;


