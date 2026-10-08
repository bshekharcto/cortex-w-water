import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireClient } from '../services/clientContext.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const ctx = requireClient();
    // Seed mode reads the demo sites table; otherwise only the signed-in
    // client's own sites, as reported by upstream for their token.
    const rows = ctx.unscoped
      ? (await pool.query('SELECT id, name FROM sites ORDER BY name')).rows
      : [...ctx.sites].sort((a, b) => a.name.localeCompare(b.name));
    res.json([{ id: 'ALL', name: 'All Sites' }, ...rows.map((r: any) => ({ id: String(r.id), name: r.name }))]);
  } catch (err: any) {
    console.error('[sites] Failed to fetch sites:', err.message);
    res.status(500).json({ error: 'Failed to fetch sites' });
  }
});

export default router;
