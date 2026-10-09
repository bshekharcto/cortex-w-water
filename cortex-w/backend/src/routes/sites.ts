import { Router } from 'express';
import { getSiteOptions, SessionExpiredError } from '../services/dashboardService.js';

const router = Router();

// The sites the caller may filter by: the real site tree from the metadata mirror, limited to what the beta says the
// caller can open. "All Sites" always comes first.
router.get('/', async (req, res) => {
  try {
    const sites = await getSiteOptions(req.headers.authorization);
    res.json([{ id: 'ALL', name: 'All Sites', parentId: null, label: 'All Sites' }, ...sites]);
  } catch (err: any) {
    if (err instanceof SessionExpiredError) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    res.status(500).json({ error: 'Failed to fetch sites', message: err.message });
  }
});

export default router;
