import { Router } from 'express';
import { pool } from '../db/pool.js';
import { config } from '../config/env.js';
import { proxyUpstream } from '../services/upstreamProxy.js';

const router = Router();

router.get('/', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    const result = await pool.query('SELECT id, name FROM sites ORDER BY name');
    return res.json(result.rows);
  }
  const upstream = await proxyUpstream('GET', '/sites', {
    headers: { Authorization: req.headers.authorization ?? '' },
  });
  const data = upstream.data as any;
  const items = data?._embedded?.sites ?? [];
  res.json(items);
});

export default router;
