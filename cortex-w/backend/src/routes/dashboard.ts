import { Router } from 'express';
import { config } from '../config/env.js';
import { proxyUpstream } from '../services/upstreamProxy.js';
import { getAuthToken } from './gis.js';

const router = Router();

// Real implementation: cog-core-api's /api/water/dma-report/zones/{siteId}
// endpoint already returns exactly what this module needs — real per-area
// consumption (yesterday/today/monthly flow), real connectivity counts, and
// an embedded real meter list — for a given top-level site. Despite the
// endpoint's name, each returned item is what THIS app calls a "DMA"; our
// own "Zone" concept (Bhubaneswar/Cuttack/Puri) is one level up, so /zones
// below aggregates across all items returned per known top-level site.
//
// The FALLBACK_ constants remain, used ONLY in seed mode (config.APP_DATA_MODE
// === 'seed') as a local demo dataset requiring no network access — never
// used as a silent fallback for real users. See ECOSYSTEM_ARCHITECTURE.md.
function isSeedMode() {
  return config.APP_DATA_MODE === 'seed';
}

// Known top-level site IDs (District-level, per cog-core-api's hierarchy)
// for each of our "Zone" (city) groupings.
const ZONE_SITE_IDS: Record<string, number> = {
  'zone-bhubaneswar': 6394,
  'zone-cuttack': 6916,
  'zone-puri': 6906,
};

function zoneNameFromId(zoneId: string): string {
  return zoneId.replace(/^zone-/, '').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fetchRealDmaReport(siteId: number, authHeader?: string): Promise<any[]> {
  const token = await getAuthToken(authHeader);
  const headers: Record<string, string> = token ? { Authorization: token } : {};
  const upstream = await proxyUpstream('GET', `/api/water/dma-report/zones/${siteId}`, { headers }).catch(
    () => ({ status: 500, data: null })
  );
  return Array.isArray(upstream.data) ? upstream.data : [];
}

const FALLBACK_ZONES = [
  { zoneId: 'zone-bhubaneswar', zoneName: 'Bhubaneswar', totalDevices: 15330, connected: 6355, disconnected: 2666, neverSeen: 6309, yesterdayFlowM3: 305802.0, todayFlowM3: 104846.0, monthToDateFlowM3: 8737228.8, dataTimestamp: new Date().toISOString() },
  { zoneId: 'zone-puri', zoneName: 'Puri', totalDevices: 2911, connected: 0, disconnected: 0, neverSeen: 2911, yesterdayFlowM3: 58030.0, todayFlowM3: 19896.0, monthToDateFlowM3: 1658002.3, dataTimestamp: new Date().toISOString() },
  { zoneId: 'zone-cuttack', zoneName: 'Cuttack', totalDevices: 290, connected: 88, disconnected: 116, neverSeen: 86, yesterdayFlowM3: 5677.0, todayFlowM3: 1946.0, monthToDateFlowM3: 162218.0, dataTimestamp: new Date().toISOString() }
];

const FALLBACK_DMAS: Record<string, any[]> = {
  bhubaneswar: [
    { dmaId: 'dma-bbsr-1', dmaName: 'DMA 1 (Bhubaneswar North)', zoneId: 'zone-bhubaneswar', zoneName: 'Bhubaneswar', totalDevices: 4018, connected: 1757, disconnected: 785, neverSeen: 1476, subDmaCount: 4, yesterdayFlowM3: 80099.82, todayFlowM3: 27462.8, monthToDateFlowM3: 2288566.27, dataTimestamp: new Date().toISOString() },
  ],
  cuttack: [
    { dmaId: 'dma-ctc-1', dmaName: 'DMA 1 (CDA Sector 11)', zoneId: 'zone-cuttack', zoneName: 'Cuttack', totalDevices: 244, connected: 71, disconnected: 97, neverSeen: 76, subDmaCount: 1, yesterdayFlowM3: 4800.0, todayFlowM3: 1645.0, monthToDateFlowM3: 137000.0, dataTimestamp: new Date().toISOString() },
  ],
  puri: [
    { dmaId: 'dma-pri-1', dmaName: 'DMA 1 (VIP Road & Balagandi)', zoneId: 'zone-puri', zoneName: 'Puri', totalDevices: 700, connected: 0, disconnected: 0, neverSeen: 700, subDmaCount: 1, yesterdayFlowM3: 13950.0, todayFlowM3: 4780.0, monthToDateFlowM3: 398000.0, dataTimestamp: new Date().toISOString() },
  ],
};

/**
 * GET /api/dashboard/zones
 * Returns all top-level zones (Bhubaneswar, Cuttack, Puri), aggregated from
 * cog-core-api's real per-DMA data for each known site.
 */
router.get('/zones', async (req, res) => {
  try {
    const results = await Promise.all(
      Object.entries(ZONE_SITE_IDS).map(async ([zoneId, siteId]) => {
        const rows = await fetchRealDmaReport(siteId, req.headers.authorization);
        const totalDevices = rows.reduce((s, r) => s + (r.totalDevices || 0), 0);
        const connected = rows.reduce((s, r) => s + (r.connected || 0), 0);
        const disconnected = rows.reduce((s, r) => s + (r.disconnected || 0), 0);
        const neverSeen = rows.reduce((s, r) => s + (r.neverSeen || 0), 0);
        const yesterdayFlowM3 = rows.reduce((s, r) => s + (r.yesterdayFlow || 0), 0);
        const todayFlowM3 = rows.reduce((s, r) => s + (r.todayFlow || 0), 0);
        const monthToDateFlowM3 = rows.reduce((s, r) => s + (r.monthlyFlow || 0), 0);
        return {
          zoneId,
          zoneName: zoneNameFromId(zoneId),
          totalDevices,
          connected,
          disconnected,
          neverSeen,
          yesterdayFlowM3: Number(yesterdayFlowM3.toFixed(2)),
          todayFlowM3: Number(todayFlowM3.toFixed(2)),
          monthToDateFlowM3: Number(monthToDateFlowM3.toFixed(2)),
          dataTimestamp: new Date().toISOString(),
        };
      })
    );

    const hasAnyData = results.some((r) => r.totalDevices > 0);
    if (hasAnyData) return res.json(results);
    return res.json(isSeedMode() ? FALLBACK_ZONES : results);
  } catch (err: any) {
    console.warn('[dashboard] Error fetching zones:', err?.message || err);
    return res.json(isSeedMode() ? FALLBACK_ZONES : []);
  }
});

/**
 * GET /api/dashboard/zone/:zoneId/dmas
 * Returns real per-DMA rows for a selected zone (city), from cog-core-api.
 */
router.get('/zone/:zoneId/dmas', async (req, res) => {
  const { zoneId } = req.params;
  const normalizedZoneId = zoneId.toLowerCase();
  const siteId = ZONE_SITE_IDS[normalizedZoneId];

  try {
    if (!siteId) {
      return res.json([]);
    }

    const rows = await fetchRealDmaReport(siteId, req.headers.authorization);
    const zoneName = zoneNameFromId(normalizedZoneId);

    if (rows.length > 0) {
      const dmaRows = rows.map((r: any) => ({
        dmaId: String(r.id),
        dmaName: r.name,
        zoneId: normalizedZoneId,
        zoneName,
        totalDevices: r.totalDevices || 0,
        connected: r.connected || 0,
        disconnected: r.disconnected || 0,
        neverSeen: r.neverSeen || 0,
        subDmaCount: 1,
        yesterdayFlowM3: r.yesterdayFlow || 0,
        todayFlowM3: r.todayFlow || 0,
        monthToDateFlowM3: r.monthlyFlow || 0,
        dataTimestamp: r.timestamp || new Date().toISOString(),
      }));
      return res.json(dmaRows);
    }

    const fallbackKey = normalizedZoneId.includes('bhubaneswar')
      ? 'bhubaneswar'
      : normalizedZoneId.includes('cuttack')
      ? 'cuttack'
      : 'puri';
    return res.json(isSeedMode() ? (FALLBACK_DMAS[fallbackKey] || []) : []);
  } catch (err: any) {
    console.warn('[dashboard] Error fetching DMAs:', err?.message || err);
    if (!isSeedMode()) return res.json([]);
    const fallbackKey = normalizedZoneId.includes('bhubaneswar')
      ? 'bhubaneswar'
      : normalizedZoneId.includes('cuttack')
      ? 'cuttack'
      : 'puri';
    return res.json(FALLBACK_DMAS[fallbackKey] || []);
  }
});

/**
 * GET /api/dashboard/dma/:dmaId/meters
 * Returns the real meter list embedded in cog-core-api's DMA report response
 * for whichever known site actually contains this dmaId.
 */
router.get('/dma/:dmaId/meters', async (req, res) => {
  const { dmaId } = req.params;

  try {
    for (const [zoneId, siteId] of Object.entries(ZONE_SITE_IDS)) {
      const rows = await fetchRealDmaReport(siteId, req.headers.authorization);
      const match = rows.find((r: any) => String(r.id) === String(dmaId));
      if (match) {
        const zoneName = zoneNameFromId(zoneId);
        const meterRows = (match.meters || []).map((m: any) => ({
          zoneName,
          dmaName: match.name,
          deviceId: m.assetId ? `506f9800${String(m.assetId).padStart(8, '0')}` : undefined,
          meterId: m.meterId,
          meterType: 'Axioma Qalcosonic W1',
          consumerId: m.consumerId,
          consumerName: m.consumerName,
          address: m.address,
          meterSize: '15mm',
          totalizerM3: m.totalizer ?? 0,
          latestReadingAt: m.decodedAt || undefined,
          connectivityStatus: m.connectivityStatus || 'NEVER_SEEN',
        }));
        return res.json(meterRows);
      }
    }

    // dmaId not found under any known site — genuinely no data, not an error
    return res.json([]);
  } catch (err: any) {
    console.warn('[dashboard] Error fetching DMA meters:', err?.message || err);
    return res.json([]);
  }
});

export default router;
