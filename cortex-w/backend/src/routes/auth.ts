import { Router, type Request, type Response } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { PgRateLimitStore } from '../middleware/pgRateLimitStore.js';
import { config } from '../config/env.js';
import { issueLocalToken } from '../middleware/auth.js';
import { forgetToken, resolveClient, runWithClient } from '../services/clientContext.js';
import { warmClientCaches } from './dashboard.js';

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
    const targetUrl = `${config.COGNECTO_API_URL ?? config.UPSTREAM_API_BASE_URL}/api/auth/login`;
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

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Throttle per account as well as per address, so one account can't be
  // guessed at from many IPs.
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}|${String(req.body?.username ?? '').toLowerCase()}`,
  skipSuccessfulRequests: true,
  // Shared across serverless instances; if Postgres is unreachable, fail open
  // (login itself still needs upstream) rather than lock everyone out.
  store: new PgRateLimitStore('login'),
  passOnStoreError: true,
  message: { error: 'Too many login attempts. Try again later.' },
});

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};

  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  // Seed mode: local demo users only. Every other mode: upstream is the only
  // source of credentials.
  if (config.APP_DATA_MODE === 'seed') {
    const user = SEED_USERS[username.toLowerCase()];
    if (user && user.password === password) {
      const token = issueLocalToken(user.displayName, user.role);
      return res.json({ token, displayName: user.displayName, role: user.role, isCognecto: false });
    }
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const cognectoAuth = await loginCognecto(username, password);
  if (cognectoAuth) {
    // Start loading this client's data now, under their own token, so the
    // first dashboard they open isn't the one that pays for it.
    resolveClient(cognectoAuth.token)
      .then((client) => client && runWithClient(client, warmClientCaches))
      .catch((err) => console.warn('[auth] post-login warm-up skipped:', err?.message || err));
    return res.json(cognectoAuth);
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

router.post('/logout', (req, res) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) forgetToken(header.slice(7).trim());
  res.status(204).send();
});

export default router;
