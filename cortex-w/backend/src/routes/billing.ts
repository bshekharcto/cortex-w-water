import { Router } from 'express';
import { pool } from '../db/pool.js';
import { config } from '../config/env.js';
import { proxyUpstream } from '../services/upstreamProxy.js';
import { getAuthToken, getLiveGisData } from './gis.js';

const router = Router();

// Helper to extract ward from address string (e.g. "WARD-36", "Ward 59", "W-36")
function extractWard(address?: string | null): string {
  if (!address) return '59';
  const match = address.match(/ward[-\s]*(\d+)/i) || address.match(/w[-\s]*(\d+)/i);
  return match ? match[1] : '59';
}

// Composite billing list handler with filtering, date range, search, and KPI aggregation
async function handleBillingList(req: any, res: any) {
  try {
    const page = parseInt((req.body?.page ?? req.query?.page ?? '0') as string, 10);
    const size = parseInt((req.body?.size ?? req.query?.size ?? '25') as string, 10);
    // Default to a rolling 90-day window ending today when no explicit range
    // is supplied — a fixed calendar date here would look "frozen in time"
    // once that window is in the past (same class of bug as the Command
    // Center TARGET_DATE issue).
    const defaultEndDate = new Date().toISOString().slice(0, 10);
    const defaultStartDate = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const startDate = (req.body?.startDate ?? req.query?.startDate ?? defaultStartDate) as string;
    const endDate = (req.body?.endDate ?? req.query?.endDate ?? defaultEndDate) as string;
    const search = ((req.body?.search ?? req.query?.search ?? '') as string).trim().toLowerCase();
    const statusFilter = ((req.body?.status ?? req.query?.status ?? 'ALL') as string).toUpperCase();
    const cityFilter = (req.body?.city ?? req.query?.city ?? 'ALL') as string;

    const token = await getAuthToken(req.headers.authorization);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = token;

    // Upstream Cognecto accepts POST /api/billing?startDate=...&endDate=... with body { page, size }
    const upstream = await proxyUpstream('POST', '/api/billing', {
      query: { startDate, endDate },
      body: { page: 0, size: 200 },
      headers,
    });

    if (upstream.status === 200 && upstream.data) {
      const pageData = upstream.data as any;
      const rawContent: any[] = Array.isArray(pageData.content)
        ? pageData.content
        : Array.isArray(pageData)
        ? pageData
        : [];

      // Enrich every bill record with city, consumption, and formatted values
      const enriched = rawContent.map((b: any) => {
        const address = b.address || '';
        const cid = b.customId || b.householdCustomId || '';
        const sName = (b.siteName || '').toLowerCase();

        const detectedCity =
          cid.includes('/PRI/') || address.toUpperCase().includes('PURI') || sName.includes('puri')
            ? 'Puri'
            : cid.includes('/CTC/') || address.toUpperCase().includes('CUTTACK') || sName.includes('cuttack')
            ? 'Cuttack'
            : 'Bhubaneswar';

        const prevR = Number(b.prevReading ?? 0);
        const currR = Number(b.currentReading ?? 0);
        const consumption = Math.max(0, Number((currR - prevR).toFixed(2)));

        return {
          ...b,
          city: detectedCity,
          consumption,
          householdName: b.householdName || 'Consumer Record',
          householdCustomId: b.householdCustomId || cid.split('-')[0] || `WS/BMC/${b.assetId || b.id}`,
          status: (b.status || 'OVERDUE').toUpperCase(),
          ward: extractWard(address),
        };
      });

      // Filter by search
      let filtered = enriched;
      if (search) {
        filtered = filtered.filter((b: any) => {
          return (
            (b.customId && b.customId.toLowerCase().includes(search)) ||
            (b.householdCustomId && b.householdCustomId.toLowerCase().includes(search)) ||
            (b.householdName && b.householdName.toLowerCase().includes(search)) ||
            (b.meterId && b.meterId.toLowerCase().includes(search)) ||
            (b.address && b.address.toLowerCase().includes(search))
          );
        });
      }

      // Filter by status
      if (statusFilter && statusFilter !== 'ALL') {
        filtered = filtered.filter((b: any) => b.status === statusFilter);
      }

      // Filter by city
      if (cityFilter && cityFilter !== 'ALL') {
        filtered = filtered.filter((b: any) => b.city.toLowerCase() === cityFilter.toLowerCase());
      }

      // Compute statistics across the filtered set
      const totalAmount = filtered.reduce((acc, b) => acc + (Number(b.amount) || 0), 0);
      const overdueBills = filtered.filter((b) => b.status === 'OVERDUE');
      const paidBills = filtered.filter((b) => b.status === 'PAID');
      const pendingBills = filtered.filter((b) => b.status === 'PENDING');

      const overdueAmount = overdueBills.reduce((acc, b) => acc + (Number(b.amount) || 0), 0);
      const paidAmount = paidBills.reduce((acc, b) => acc + (Number(b.amount) || 0), 0);

      const totalConsM3 = filtered.reduce((acc, b) => acc + (Number(b.consumption) || 0), 0);
      const avgConsM3 = filtered.length > 0 ? Number((totalConsM3 / filtered.length).toFixed(1)) : 0;

      // Slice for pagination
      const startIndex = page * size;
      const pagedContent = filtered.slice(startIndex, startIndex + size);

      return res.json({
        content: pagedContent,
        totalElements: filtered.length,
        totalPages: Math.ceil(filtered.length / size) || 1,
        number: page,
        size,
        first: page === 0,
        last: startIndex + size >= filtered.length,
        stats: {
          totalBills: filtered.length,
          totalAmount: Number(totalAmount.toFixed(2)),
          overdueAmount: Number(overdueAmount.toFixed(2)),
          paidAmount: Number(paidAmount.toFixed(2)),
          overdueCount: overdueBills.length,
          paidCount: paidBills.length,
          pendingCount: pendingBills.length,
          avgAmount: filtered.length > 0 ? Number((totalAmount / filtered.length).toFixed(2)) : 0,
          totalConsM3: Number(totalConsM3.toFixed(1)),
          avgConsM3,
        },
      });
    }

    // Fallback if upstream didn't return 200
    res.status(upstream.status).json(upstream.data || { content: [], totalElements: 0 });
  } catch (err: any) {
    console.error('[billing] Error fetching billing list:', err.message);
    res.status(500).json({ error: 'Failed to fetch billing data' });
  }
}

// Mount list endpoints for GET, POST, and /list
router.get('/', handleBillingList);
router.post('/list', handleBillingList);
router.post('/page', handleBillingList);
router.post('/', handleBillingList);

// GET /api/billing/:id/detail — Composite 360 Bill Detail with live meter telemetry & slab calculation
router.get('/:id/detail', async (req, res) => {
  try {
    const idOrCustomId = req.params.id;
    const token = await getAuthToken(req.headers.authorization);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = token;

    // Fetch live bills across a wide range to find the requested bill —
    // computed relative to today rather than a fixed calendar window, so
    // this keeps working correctly regardless of when it's actually run.
    const wideRangeStart = new Date(Date.now() - 5 * 365 * 86400000).toISOString().slice(0, 10);
    const wideRangeEnd = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    const upstream = await proxyUpstream('POST', '/api/billing', {
      query: { startDate: wideRangeStart, endDate: wideRangeEnd },
      body: { page: 0, size: 200 },
      headers,
    });

    const rawContent: any[] = Array.isArray((upstream.data as any)?.content)
      ? (upstream.data as any).content
      : [];

    const matchedBill = rawContent.find(
      (b: any) =>
        String(b.id) === String(idOrCustomId) ||
        b.customId === idOrCustomId ||
        b.householdCustomId === idOrCustomId
    );

    if (!matchedBill) {
      return res.status(404).json({ error: 'Bill record not found' });
    }

    const prevR = Number(matchedBill.prevReading ?? 0);
    const currR = Number(matchedBill.currentReading ?? 0);
    const consumption = Math.max(0, Number((currR - prevR).toFixed(2)));

    const address = matchedBill.address || '';
    const cid = matchedBill.customId || matchedBill.householdCustomId || '';
    const detectedCity =
      cid.includes('/PRI/') || address.toUpperCase().includes('PURI')
        ? 'Puri'
        : cid.includes('/CTC/') || address.toUpperCase().includes('CUTTACK')
        ? 'Cuttack'
        : 'Bhubaneswar';

    // Cross-reference with live GIS meters
    const gisData = await getLiveGisData(token, 'ALL');
    const matchedGisMeter = gisData.meters.find(
      (m) =>
        m.meterId === matchedBill.meterId ||
        m.householdId === matchedBill.householdCustomId ||
        (matchedBill.householdCustomId && m.householdShortId === matchedBill.householdCustomId)
    );

    // Last 10 unique days of REAL readings for this meter (no fabricated
    // fallback — matches the fix already applied in households.ts).
    let dailyReadings: any[] = [];
    const meterIdForReadings = matchedGisMeter?.meterId || matchedBill.meterId;
    if (meterIdForReadings) {
      try {
        const readingsRes = await pool.query(
          `SELECT DISTINCT ON (date_key) date_key, decoded_at, forward_flow_l
           FROM raw_telemetry_packets
           WHERE meter_id = $1
           ORDER BY date_key DESC, decoded_at DESC
           LIMIT 10`,
          [meterIdForReadings]
        );
        const realRows = readingsRes.rows.reverse(); // oldest -> newest for charting
        dailyReadings = realRows.map((r: any, idx: number) => {
          // forward_flow_l column stores KL (kilolitres) natively — 1 KL === 1 m3
          const readingKl = Number(r.forward_flow_l) || 0;
          const prevReadingKl = idx > 0 ? Number(realRows[idx - 1].forward_flow_l) || 0 : readingKl;
          const consKl = Math.max(0, readingKl - prevReadingKl);
          const consL = Math.round(consKl * 1000);
          const dateStr = new Date(r.decoded_at).toISOString();
          return {
            date: dateStr.split('T')[0],
            shortDate: dateStr.slice(5, 10),
            readingM3: Number(readingKl.toFixed(3)),
            reading: Number(readingKl.toFixed(3)),
            consumptionL: consL,
            consumptionM3: Number(consKl.toFixed(3)),
            consumption: consL,
            flag: 'Normal',
          };
        });
      } catch (err: any) {
        console.warn('[billing] Failed to fetch real readings:', err.message);
      }
    }
    // Pad with zero-value entries if fewer than 10 real readings exist (no fabricated data)
    while (dailyReadings.length < 10) {
      dailyReadings.unshift({
        date: null,
        shortDate: '--',
        readingM3: 0,
        reading: 0,
        consumptionL: 0,
        consumptionM3: 0,
        consumption: 0,
        flag: 'No Data',
      });
    }

    const billResponse = {
      ...matchedBill,
      city: detectedCity,
      consumption,
      ward: extractWard(address),
      status: (matchedBill.status || 'OVERDUE').toUpperCase(),
    };

    res.json({
      bill: billResponse,
      consumer: {
        customId: matchedBill.householdCustomId || cid.split('-')[0],
        name: matchedBill.householdName || 'Consumer Record',
        address: matchedBill.address || 'WATCO Service Area',
        city: detectedCity,
        ward: extractWard(address),
        siteName: matchedBill.siteName || detectedCity,
        mobile: matchedGisMeter?.householdPhone || '—',
      },
      meter: {
        meterId: matchedBill.meterId,
        assetId: matchedBill.assetId,
        currentReading: currR,
        prevReading: prevR,
        consumption,
        activeGisMeter: matchedGisMeter || null,
      },
      charges: matchedBill.billCharges || [],
      dailyReadings,
      tariffs: [
        { slab: 'Slab 1 (0 – 20 KL)', min: 0, max: 20, rate: 5.40, unit: '₹ / KL' },
        { slab: 'Slab 2 (21 – 30 KL)', min: 21, max: 30, rate: 6.43, unit: '₹ / KL' },
        { slab: 'Slab 3 (> 30 KL)', min: 31, max: null, rate: 9.50, unit: '₹ / KL' },
      ],
    });
  } catch (err: any) {
    console.error('[billing] Error fetching bill detail:', err.message);
    res.status(500).json({ error: 'Failed to fetch bill detail' });
  }
});

// Create bill
router.post('/create', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    const b = req.body;
    const result = await pool.query(
      `INSERT INTO bills (household_id, asset_id, site_id, bill_date, due_date, prev_reading, current_reading, consumption, amount, status)
       VALUES ($1,$2,6394,$3,$4,$5,$6,$7,$8,'Pending') RETURNING *`,
      [b.householdId, b.assetId, b.billDate, b.dueDate, b.prevReading, b.currentReading, b.consumption, b.amount],
    );
    return res.status(201).json(result.rows[0]);
  }
  const upstream = await proxyUpstream('POST', '/api/billing/', {
    body: req.body,
    headers: { Authorization: req.headers.authorization ?? '' },
  });
  res.status(upstream.status).json(upstream.data);
});

// Delete bill
router.delete('/:id', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    await pool.query('DELETE FROM bills WHERE id=$1', [req.params.id]);
    return res.status(204).send();
  }
  const upstream = await proxyUpstream('DELETE', `/api/billing/${req.params.id}`, {
    headers: { Authorization: req.headers.authorization ?? '' },
  });
  res.status(upstream.status).json(upstream.data);
});

export default router;
