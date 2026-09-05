import { Router, type Request, type Response } from 'express';
import { config } from '../config/env.js';
import { issueLocalToken } from '../middleware/auth.js';
import { proxyUpstream } from '../services/upstreamProxy.js';

const router = Router();

const SEED_USERS: Record<string, { password: string; displayName: string; role: string }> = {
  admin:       { password: 'admin', displayName: 'Admin User',     role: 'Admin' },
  consumer:    { password: 'admin', displayName: 'Consumer User',  role: 'Consumer' },
  'bill desk': { password: 'admin', displayName: 'Bill Desk User', role: 'Bill Desk' },
  billdesk:    { password: 'admin', displayName: 'Bill Desk User', role: 'Bill Desk' },
  operations:  { password: 'admin', displayName: 'Ops User',       role: 'Operations' },
  billing:     { password: 'admin', displayName: 'Billing User',   role: 'Billing' },
};

async function loginCognecto(username: string, password: string) {
  try {
    const targetUrl = `${config.COGNECTO_API_URL || 'https://api.cognecto.com'}/api/auth/login`;
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
      },
      body: JSON.stringify({ username, password }),
    });

    if (res.status === 200) {
      const data = (await res.json()) as { token?: string };
      if (data.token) {
        // Decode JWT payload to extract user info
        try {
          const parts = data.token.split('.');
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
          return {
            token: data.token,
            displayName: payload.userName ?? username,
            role: Array.isArray(payload.Roles) ? payload.Roles[0] : (payload.Roles ?? 'Root'),
            userId: payload.sub,
            isCognecto: true,
          };
        } catch {
          return {
            token: data.token,
            displayName: username,
            role: 'Root',
            isCognecto: true,
          };
        }
      }
    }
  } catch (err) {
    console.error('Cognecto login request failed:', err);
  }
  return null;
}

router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  // 1. If WATCO or API mode or non-seed user: authenticate with Cognecto
  const isWatcoOrApi = config.APP_DATA_MODE === 'api' || username.toLowerCase().includes('watco');
  if (isWatcoOrApi) {
    const cognectoAuth = await loginCognecto(username, password);
    if (cognectoAuth) {
      return res.json(cognectoAuth);
    }
    if (config.APP_DATA_MODE === 'api') {
      return res.status(401).json({ error: 'Invalid Cognecto credentials' });
    }
  }

  // 2. Check local seed users (for Admin, Consumer, Bill Desk)
  const user = SEED_USERS[username?.toLowerCase()];
  if (user && user.password === password) {
    const token = issueLocalToken(user.displayName, user.role);
    return res.json({ token, displayName: user.displayName, role: user.role, isCognecto: false });
  }

  // 3. Fallback: try Cognecto in case an arbitrary Cognecto user logs in
  const fallbackAuth = await loginCognecto(username, password);
  if (fallbackAuth) {
    return res.json(fallbackAuth);
  }

  return res.status(401).json({ error: 'Invalid credentials' });
});

router.post('/logout', (_req, res) => {
  res.status(204).send();
});

export default router;
