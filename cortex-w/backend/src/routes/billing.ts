import { Router } from 'express';
import { pool } from '../db/pool.js';
import { config } from '../config/env.js';
import { proxyUpstream } from '../services/upstreamProxy.js';

const router = Router();

/**
 * Spec 28.3: upstream has a subtle trailing-slash distinction —
 *   GET  /api/billing    → list bills (no trailing slash)
 *   POST /api/billing/   → generate a bill (trailing slash required!)
 *
 * Our BFF hides this from the frontend; the frontend just calls:
 *   GET  /api/billing
 *   POST /api/billing
 */
router.get('/', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    const { householdId, status } = req.query as Record<string, string>;
    let query = 'SELECT * FROM bills WHERE 1=1';
    const params: (string | number)[] = [];
    if (householdId) { params.push(householdId); query += ` AND household_id=$${params.length}`; }
    if (status) { params.push(status); query += ` AND status=$${params.length}`; }
    query += ' ORDER BY bill_date DESC';
    const result = await pool.query(query, params);
    return res.json(result.rows);
  }
  // Upstream: no trailing slash for list
  const upstream = await proxyUpstream('GET', '/api/billing', {
    query: req.query as Record<string, string>,
    headers: { Authorization: req.headers.authorization ?? '' },
  });
  res.status(upstream.status).json(upstream.data);
});

router.post('/', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    const b = req.body;
    const result = await pool.query(
      `INSERT INTO bills (household_id, asset_id, site_id, bill_date, due_date, prev_reading, current_reading, consumption, amount, status)
       VALUES ($1,$2,6394,$3,$4,$5,$6,$7,$8,'Pending') RETURNING *`,
      [b.householdId, b.assetId, b.billDate, b.dueDate, b.prevReading, b.currentReading, b.consumption, b.amount],
    );
    return res.status(201).json(result.rows[0]);
  }
  // Upstream: trailing slash required for create!
  const upstream = await proxyUpstream('POST', '/api/billing/', {
    body: req.body,
    headers: { Authorization: req.headers.authorization ?? '' },
  });
  res.status(upstream.status).json(upstream.data);
});

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
