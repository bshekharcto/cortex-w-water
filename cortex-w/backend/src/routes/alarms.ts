import { Router } from 'express';
import { pool } from '../db/pool.js';
import { config } from '../config/env.js';

const router = Router();

router.get('/', async (_req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    const result = await pool.query('SELECT * FROM alarms ORDER BY CASE severity WHEN \'critical\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END');
    return res.json(result.rows);
  }
  // No upstream alarm API exists yet (spec 13.6). Return empty in api mode.
  res.json([]);
});

router.patch('/:id/status', async (req, res) => {
  if (config.APP_DATA_MODE === 'seed') {
    const { status } = req.body;
    await pool.query('UPDATE alarms SET status=$1 WHERE id=$2', [status, req.params.id]);
    return res.json({ id: req.params.id, status });
  }
  res.status(501).json({ error: 'Alarm status update not available in API mode' });
});

export default router;
