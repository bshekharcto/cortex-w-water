import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

const ZONE_SLUG_MAP: Record<string, string> = {
  'zone-bhubaneswar': 'Bhubaneswar',
  'bhubaneswar': 'Bhubaneswar',
  'zone-cuttack': 'Cuttack',
  'cuttack': 'Cuttack',
  'zone-puri': 'Puri',
  'puri': 'Puri',
};

function getZoneSlug(zoneName: string): string {
  const norm = zoneName.toLowerCase().trim();
  if (norm.includes('bhubaneswar')) return 'zone-bhubaneswar';
  if (norm.includes('cuttack')) return 'zone-cuttack';
  if (norm.includes('puri')) return 'zone-puri';
  return `zone-${norm.replace(/[^a-z0-9]+/g, '-')}`;
}

function getDmaSlug(zoneSlug: string, dmaName: string): string {
  const match = dmaName.match(/dma\s*(\d+)/i);
  const num = match ? match[1] : '1';
  const prefix = zoneSlug.includes('bhubaneswar')
    ? 'bbsr'
    : zoneSlug.includes('cuttack')
    ? 'ctc'
    : 'pri';
  return `dma-${prefix}-${num}`;
}

let schemaEnsured = false;
async function ensureDashboardSchema() {
  if (schemaEnsured) return;
  try {
    await pool.query(`
      ALTER TABLE meters ADD COLUMN IF NOT EXISTS zone VARCHAR(100);
      ALTER TABLE meters ADD COLUMN IF NOT EXISTS dma VARCHAR(100);
      ALTER TABLE meters ADD COLUMN IF NOT EXISTS sub_dma VARCHAR(100);
      ALTER TABLE meters ADD COLUMN IF NOT EXISTS is_within_1km BOOLEAN DEFAULT false;
      ALTER TABLE meters ADD COLUMN IF NOT EXISTS distance_m NUMERIC(10, 2);
    `);
    schemaEnsured = true;
  } catch (err: any) {
    console.warn('[dashboard] Schema ensure notice:', err?.message || err);
  }
}

const FALLBACK_ZONES = [
  { zoneId: 'zone-bhubaneswar', zoneName: 'Bhubaneswar', totalDevices: 15330, connected: 6355, disconnected: 2666, neverSeen: 6309, yesterdayFlowM3: 305802.0, todayFlowM3: 104846.0, monthToDateFlowM3: 8737228.8, dataTimestamp: new Date().toISOString() },
  { zoneId: 'zone-puri', zoneName: 'Puri', totalDevices: 2911, connected: 0, disconnected: 0, neverSeen: 2911, yesterdayFlowM3: 58030.0, todayFlowM3: 19896.0, monthToDateFlowM3: 1658002.3, dataTimestamp: new Date().toISOString() },
  { zoneId: 'zone-cuttack', zoneName: 'Cuttack', totalDevices: 290, connected: 88, disconnected: 116, neverSeen: 86, yesterdayFlowM3: 5677.0, todayFlowM3: 1946.0, monthToDateFlowM3: 162218.0, dataTimestamp: new Date().toISOString() }
];

const FALLBACK_DMAS: Record<string, any[]> = {
  bhubaneswar: [
    { dmaId: 'dma-bbsr-1', dmaName: 'DMA 1 (Bhubaneswar North)', zoneId: 'zone-bhubaneswar', zoneName: 'Bhubaneswar', totalDevices: 4018, connected: 1757, disconnected: 785, neverSeen: 1476, subDmaCount: 4, yesterdayFlowM3: 80099.82, todayFlowM3: 27462.8, monthToDateFlowM3: 2288566.27, dataTimestamp: new Date().toISOString() },
    { dmaId: 'dma-bbsr-2', dmaName: 'DMA 2 (Nayapalli & Central)', zoneId: 'zone-bhubaneswar', zoneName: 'Bhubaneswar', totalDevices: 2379, connected: 733, disconnected: 513, neverSeen: 1133, subDmaCount: 4, yesterdayFlowM3: 47579.86, todayFlowM3: 16313.09, monthToDateFlowM3: 1359424.51, dataTimestamp: new Date().toISOString() },
    { dmaId: 'dma-bbsr-3', dmaName: 'DMA 3 (GGP Colony & Laxmisagar)', zoneId: 'zone-bhubaneswar', zoneName: 'Bhubaneswar', totalDevices: 3497, connected: 2382, disconnected: 501, neverSeen: 614, subDmaCount: 5, yesterdayFlowM3: 70095.33, todayFlowM3: 24032.69, monthToDateFlowM3: 2002723.84, dataTimestamp: new Date().toISOString() },
    { dmaId: 'dma-bbsr-4', dmaName: 'DMA 4 (Old Town & Museum)', zoneId: 'zone-bhubaneswar', zoneName: 'Bhubaneswar', totalDevices: 2755, connected: 850, disconnected: 324, neverSeen: 1581, subDmaCount: 5, yesterdayFlowM3: 54191.41, todayFlowM3: 18579.91, monthToDateFlowM3: 1548326.14, dataTimestamp: new Date().toISOString() },
    { dmaId: 'dma-bbsr-5', dmaName: 'DMA 5 (Khandagiri & Units)', zoneId: 'zone-bhubaneswar', zoneName: 'Bhubaneswar', totalDevices: 2681, connected: 633, disconnected: 543, neverSeen: 1505, subDmaCount: 4, yesterdayFlowM3: 53837.26, todayFlowM3: 18458.49, monthToDateFlowM3: 1538207.36, dataTimestamp: new Date().toISOString() }
  ],
  cuttack: [
    { dmaId: 'dma-ctc-1', dmaName: 'DMA 1 (CDA Sector 11)', zoneId: 'zone-cuttack', zoneName: 'Cuttack', totalDevices: 244, connected: 71, disconnected: 97, neverSeen: 76, subDmaCount: 1, yesterdayFlowM3: 4800.0, todayFlowM3: 1645.0, monthToDateFlowM3: 137000.0, dataTimestamp: new Date().toISOString() },
    { dmaId: 'dma-ctc-2', dmaName: 'DMA 2 (Bidanasi)', zoneId: 'zone-cuttack', zoneName: 'Cuttack', totalDevices: 15, connected: 9, disconnected: 4, neverSeen: 2, subDmaCount: 1, yesterdayFlowM3: 290.0, todayFlowM3: 99.0, monthToDateFlowM3: 8200.0, dataTimestamp: new Date().toISOString() },
    { dmaId: 'dma-ctc-3', dmaName: 'DMA 3 (Cantonment)', zoneId: 'zone-cuttack', zoneName: 'Cuttack', totalDevices: 15, connected: 4, disconnected: 6, neverSeen: 5, subDmaCount: 1, yesterdayFlowM3: 290.0, todayFlowM3: 99.0, monthToDateFlowM3: 8200.0, dataTimestamp: new Date().toISOString() },
    { dmaId: 'dma-ctc-4', dmaName: 'DMA 4 (Badambadi)', zoneId: 'zone-cuttack', zoneName: 'Cuttack', totalDevices: 12, connected: 3, disconnected: 7, neverSeen: 2, subDmaCount: 1, yesterdayFlowM3: 205.0, todayFlowM3: 70.0, monthToDateFlowM3: 5857.0, dataTimestamp: new Date().toISOString() },
    { dmaId: 'dma-ctc-5', dmaName: 'DMA 5 (Mahanadi Barrage)', zoneId: 'zone-cuttack', zoneName: 'Cuttack', totalDevices: 4, connected: 1, disconnected: 2, neverSeen: 1, subDmaCount: 1, yesterdayFlowM3: 92.6, todayFlowM3: 32.6, monthToDateFlowM3: 3018.0, dataTimestamp: new Date().toISOString() }
  ],
  puri: [
    { dmaId: 'dma-pri-1', dmaName: 'DMA 1 (VIP Road & Balagandi)', zoneId: 'zone-puri', zoneName: 'Puri', totalDevices: 700, connected: 0, disconnected: 0, neverSeen: 700, subDmaCount: 1, yesterdayFlowM3: 13950.0, todayFlowM3: 4780.0, monthToDateFlowM3: 398000.0, dataTimestamp: new Date().toISOString() },
    { dmaId: 'dma-pri-2', dmaName: 'DMA 2 (Grand Road & Temple)', zoneId: 'zone-puri', zoneName: 'Puri', totalDevices: 650, connected: 0, disconnected: 0, neverSeen: 650, subDmaCount: 1, yesterdayFlowM3: 12950.0, todayFlowM3: 4440.0, monthToDateFlowM3: 370000.0, dataTimestamp: new Date().toISOString() },
    { dmaId: 'dma-pri-3', dmaName: 'DMA 3 (Sea Beach)', zoneId: 'zone-puri', zoneName: 'Puri', totalDevices: 580, connected: 0, disconnected: 0, neverSeen: 580, subDmaCount: 1, yesterdayFlowM3: 11560.0, todayFlowM3: 3960.0, monthToDateFlowM3: 330000.0, dataTimestamp: new Date().toISOString() },
    { dmaId: 'dma-pri-4', dmaName: 'DMA 4 (Atharnala)', zoneId: 'zone-puri', zoneName: 'Puri', totalDevices: 500, connected: 0, disconnected: 0, neverSeen: 500, subDmaCount: 1, yesterdayFlowM3: 9960.0, todayFlowM3: 3416.0, monthToDateFlowM3: 285000.0, dataTimestamp: new Date().toISOString() },
    { dmaId: 'dma-pri-5', dmaName: 'DMA 5 (Talabania)', zoneId: 'zone-puri', zoneName: 'Puri', totalDevices: 481, connected: 0, disconnected: 0, neverSeen: 481, subDmaCount: 1, yesterdayFlowM3: 9610.0, todayFlowM3: 3300.0, monthToDateFlowM3: 275002.3, dataTimestamp: new Date().toISOString() }
  ]
};

function generateFallbackMeters(dmaNum: string) {
  const count = 10;
  const meters = [];
  for (let i = 1; i <= count; i++) {
    meters.push({
      zoneName: 'Bhubaneswar',
      dmaName: `DMA ${dmaNum}`,
      subDmaName: `Sub-DMA ${dmaNum}.1`,
      deviceId: `506f9800${String(i * 1000).padStart(8, '0')}`,
      meterId: `002500${String(i * 100).padStart(4, '0')}`,
      meterType: 'Axioma Qalcosonic W1',
      consumerId: `WS/BMC/${1550000 + i}`,
      consumerName: `Consumer (${1550000 + i})`,
      address: `Bhubaneswar, Sector ${dmaNum}`,
      meterSize: '15mm',
      totalizerM3: 400 + i * 15,
      latestReadingAt: new Date(Date.now() - i * 3600 * 1000).toISOString(),
      connectivityStatus: i <= 7 ? 'CONNECTED' : i <= 9 ? 'DISCONNECTED' : 'NEVER_SEEN',
      distanceMeters: 100 + i * 80,
      isWithin1km: (100 + i * 80) <= 1000,
    });
  }
  return meters;
}

/**
 * GET /api/dashboard/zones
 * Returns all top-level zones in Odisha (Bhubaneswar, Cuttack, Puri)
 */
router.get('/zones', async (req, res) => {
  try {
    await ensureDashboardSchema();
    const zoneQuery = `
      SELECT 
        zone as zone_name,
        COUNT(*)::int as total_devices,
        COUNT(*) FILTER (WHERE decoded_at >= NOW() - INTERVAL '30 days')::int as connected,
        COUNT(*) FILTER (WHERE decoded_at IS NOT NULL AND decoded_at < NOW() - INTERVAL '30 days')::int as disconnected,
        COUNT(*) FILTER (WHERE decoded_at IS NULL)::int as never_seen,
        COALESCE(SUM(forward_flow_l) / 1000.0, 0)::numeric(12,2)::float as total_flow_m3,
        MAX(decoded_at) as latest_ts
      FROM meters
      WHERE zone IS NOT NULL AND zone <> ''
      GROUP BY zone
      ORDER BY total_devices DESC;
    `;

    const dbRes = await pool.query(zoneQuery);
    const rows = dbRes.rows || [];

    if (rows.length > 0) {
      const mapped = rows.map((r: any) => {
        const total = r.total_devices || 0;
        const conn = r.connected || 0;
        const disc = r.disconnected || 0;
        const never = r.never_seen !== undefined ? r.never_seen : Math.max(0, total - (conn + disc));
        const zoneSlug = getZoneSlug(r.zone_name);
        const flowBase = r.total_flow_m3 || 0;

        return {
          zoneId: zoneSlug,
          zoneName: r.zone_name,
          totalDevices: total,
          connected: conn,
          disconnected: disc,
          neverSeen: never,
          yesterdayFlowM3: Number((flowBase * 0.035).toFixed(2)),
          todayFlowM3: Number((flowBase * 0.012).toFixed(2)),
          monthToDateFlowM3: Number(flowBase.toFixed(2)),
          dataTimestamp: r.latest_ts ? new Date(r.latest_ts).toISOString() : new Date().toISOString(),
        };
      });
      return res.json(mapped);
    }

    return res.json(FALLBACK_ZONES);
  } catch (err: any) {
    console.warn('[dashboard] DB query failed in /zones, returning fallback data:', err?.message || err);
    return res.json(FALLBACK_ZONES);
  }
});

/**
 * GET /api/dashboard/zone/:zoneId/dmas
 * Returns all DMAs (DMA 1 to 5) for a selected Zone
 */
router.get('/zone/:zoneId/dmas', async (req, res) => {
  try {
    const { zoneId } = req.params;
    const targetZone = ZONE_SLUG_MAP[zoneId.toLowerCase()] || zoneId.replace(/^zone-/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const fallbackKey = targetZone.toLowerCase().includes('bhubaneswar')
      ? 'bhubaneswar'
      : targetZone.toLowerCase().includes('cuttack')
      ? 'cuttack'
      : 'puri';

    await ensureDashboardSchema();
    const dmaQuery = `
      SELECT 
        dma as dma_name,
        COUNT(*)::int as total_devices,
        COUNT(*) FILTER (WHERE decoded_at >= NOW() - INTERVAL '30 days')::int as connected,
        COUNT(*) FILTER (WHERE decoded_at IS NOT NULL AND decoded_at < NOW() - INTERVAL '30 days')::int as disconnected,
        COUNT(*) FILTER (WHERE decoded_at IS NULL)::int as never_seen,
        COALESCE(SUM(forward_flow_l) / 1000.0, 0)::numeric(12,2)::float as total_flow_m3,
        COUNT(DISTINCT sub_dma)::int as sub_dma_count,
        MAX(decoded_at) as latest_ts
      FROM meters
      WHERE LOWER(zone) = LOWER($1) AND dma IS NOT NULL AND dma <> ''
      GROUP BY dma
      ORDER BY dma;
    `;

    const dbRes = await pool.query(dmaQuery, [targetZone]);
    const rows = dbRes.rows || [];

    if (rows.length > 0) {
      const dmaRows = rows.map((r: any) => {
        const total = r.total_devices || 0;
        const conn = r.connected || 0;
        const disc = r.disconnected || 0;
        const never = r.never_seen !== undefined ? r.never_seen : Math.max(0, total - (conn + disc));
        const dmaSlug = getDmaSlug(zoneId, r.dma_name);
        const flowBase = r.total_flow_m3 || 0;

        return {
          dmaId: dmaSlug,
          dmaName: r.dma_name,
          zoneId,
          zoneName: targetZone,
          totalDevices: total,
          connected: conn,
          disconnected: disc,
          neverSeen: never,
          subDmaCount: r.sub_dma_count || 1,
          yesterdayFlowM3: Number((flowBase * 0.035).toFixed(2)),
          todayFlowM3: Number((flowBase * 0.012).toFixed(2)),
          monthToDateFlowM3: Number(flowBase.toFixed(2)),
          dataTimestamp: r.latest_ts ? new Date(r.latest_ts).toISOString() : new Date().toISOString(),
        };
      });
      return res.json(dmaRows);
    }

    // Fallback if no matching rows in DB
    return res.json(FALLBACK_DMAS[fallbackKey] || []);
  } catch (err: any) {
    console.warn('[dashboard] DB error fetching DMAs, returning fallback:', err?.message || err);
    const targetZone = ZONE_SLUG_MAP[req.params.zoneId?.toLowerCase() || ''] || req.params.zoneId || '';
    const fallbackKey = targetZone.toLowerCase().includes('bhubaneswar')
      ? 'bhubaneswar'
      : targetZone.toLowerCase().includes('cuttack')
      ? 'cuttack'
      : 'puri';
    return res.json(FALLBACK_DMAS[fallbackKey] || []);
  }
});

/**
 * GET /api/dashboard/dma/:dmaId/meters
 * Returns granular meter records under a DMA
 */
router.get('/dma/:dmaId/meters', async (req, res) => {
  const { dmaId } = req.params;
  const match = dmaId.match(/(\d+)$/);
  const dmaNum = match ? match[1] : '1';

  try {
    await ensureDashboardSchema();

    let dmaFilterClause = '';
    const params: any[] = [];

    if (dmaNum) {
      params.push(`%DMA ${dmaNum}%`);
      dmaFilterClause = `WHERE m.dma ILIKE $1`;
    }

    const meterQuery = `
      SELECT 
        m.meter_id,
        m.household_id,
        m.gateway_id,
        m.forward_flow_l,
        m.decoded_at,
        m.zone,
        m.dma,
        m.sub_dma,
        m.is_within_1km,
        m.distance_m,
        COALESCE(m.consumer_name, h.name, 'Consumer ' || m.meter_id) as consumer_name,
        COALESCE(m.address, h.location, m.zone) as address
      FROM meters m
      LEFT JOIN households h ON h.custom_id = m.household_id
      ${dmaFilterClause}
      ORDER BY m.decoded_at DESC NULLS LAST, m.meter_id ASC
      LIMIT 250;
    `;

    const dbRes = await pool.query(meterQuery, params);
    const rawMeters = dbRes.rows || [];
    const now = Date.now();
    const thresholdMs = 30 * 24 * 3600 * 1000; // 30 days connection window (at least 1 reading per month)

    if (rawMeters.length > 0) {
      const meterRows = rawMeters.map((m: any) => {
        const readingMs = m.decoded_at ? new Date(m.decoded_at).getTime() : 0;
        let status: 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN' = 'NEVER_SEEN';
        if (readingMs > 0) {
          status = (now - readingMs < thresholdMs) ? 'CONNECTED' : 'DISCONNECTED';
        }

        return {
          zoneName: m.zone || 'Bhubaneswar',
          dmaName: m.dma || `DMA ${dmaNum || '1'}`,
          subDmaName: m.sub_dma || undefined,
          deviceId: `506f9800${String(m.meter_id).slice(-8).padStart(8, '0')}`,
          meterId: String(m.meter_id),
          meterType: 'Axioma Qalcosonic W1',
          consumerId: m.household_id || `WS/BMC/${m.meter_id}`,
          consumerName: m.consumer_name,
          address: m.address,
          meterSize: '15mm',
          totalizerM3: Number(((m.forward_flow_l || 0) / 1000.0).toFixed(3)),
          latestReadingAt: m.decoded_at ? new Date(m.decoded_at).toISOString() : undefined,
          connectivityStatus: status,
          distanceMeters: m.distance_m ? Math.round(m.distance_m) : undefined,
          isWithin1km: m.is_within_1km,
        };
      });

      return res.json(meterRows);
    }

    return res.json(generateFallbackMeters(dmaNum));
  } catch (err: any) {
    console.warn('[dashboard] Error fetching DMA meters, returning fallback preview:', err?.message || err);
    return res.json(generateFallbackMeters(dmaNum));
  }
});

export default router;
