import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM sites ORDER BY name');
    const sites = [
      { id: 'ALL', name: 'All Sites' },
      ...result.rows.map((r: any) => ({ id: String(r.id), name: r.name })),
    ];
    res.json(sites);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch sites', message: err.message });
  }
});

export default router;
