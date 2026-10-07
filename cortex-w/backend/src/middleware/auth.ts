import { type Request, type Response, type NextFunction } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { config } from '../config/env.js';
import {
  AuthUnavailableError,
  SEED_CLIENT,
  resolveClient,
  runWithClient,
  touchClient,
  type ClientCtx,
} from '../services/clientContext.js';

export interface AuthPayload {
  displayName: string;
  role: string;
}

export interface AuthUser extends AuthPayload {
  userId?: string;
  verified: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
    client?: ClientCtx;
  }
}

const upstreamKey = config.UPSTREAM_JWT_PUBLIC_KEY?.replace(/\\n/g, '\n') ?? config.UPSTREAM_JWT_SECRET;

/** Local demo tokens exist only outside pure api mode. */
function acceptsLocalTokens(): boolean {
  return config.APP_DATA_MODE !== 'api';
}

function verifyLocal(token: string): AuthUser | null {
  if (!acceptsLocalTokens()) return null;
  try {
    const p = jwt.verify(token, config.JWT_LOCAL_SIGNING_SECRET, { algorithms: ['HS256'] }) as JwtPayload & AuthPayload;
    if (typeof p.displayName !== 'string' || typeof p.role !== 'string') return null;
    return { displayName: p.displayName, role: p.role, verified: true };
  } catch {
    return null;
  }
}

/**
 * An upstream (cog-core-api) token. cog-core-api signs with a key we don't
 * hold (HS512), so instead of checking the signature ourselves we ask it:
 * resolveClient() succeeds only if the upstream accepts the token, and returns
 * the client (and sites) it belongs to. If a verification key IS configured it
 * is checked as well, as an extra layer in front of that call.
 */
async function verifyUpstream(token: string): Promise<{ user: AuthUser; client: ClientCtx } | null> {
  if (config.APP_DATA_MODE === 'seed') return null;
  if (upstreamKey) {
    try {
      jwt.verify(token, upstreamKey, {
        algorithms: config.UPSTREAM_JWT_PUBLIC_KEY ? ['RS256', 'ES256'] : ['HS256', 'HS384', 'HS512'],
        ...(config.UPSTREAM_JWT_ISSUER ? { issuer: config.UPSTREAM_JWT_ISSUER } : {}),
      });
    } catch {
      return null;
    }
  }
  const client = await resolveClient(token);
  if (!client) return null;
  const d = (jwt.decode(token) ?? {}) as any; // safe to read now: upstream vouched for it
  return {
    client,
    user: {
      displayName: d.userName ?? d.displayName ?? 'User',
      role: Array.isArray(d.Roles) ? d.Roles[0] : (d.Roles ?? 'Unknown'),
      userId: d.sub,
      verified: true,
    },
  };
}

/**
 * Populates req.user / req.client from a valid bearer token and runs the rest
 * of the request inside that client's context. Never rejects a request itself
 * (see requireAuth), except to say the identity service is unavailable.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  const token = header.slice(7).trim();

  const local = verifyLocal(token);
  if (local) {
    req.user = local;
    req.client = SEED_CLIENT;
    return runWithClient(SEED_CLIENT, next);
  }

  try {
    const up = await verifyUpstream(token);
    if (!up) return next(); // unknown/expired/forged: no user, requireAuth answers 401
    req.user = up.user;
    req.client = up.client;
    touchClient(up.client);
    return runWithClient(up.client, next);
  } catch (err) {
    if (err instanceof AuthUnavailableError) {
      console.error('[auth] identity check failed:', err.message);
      return res.status(503).json({ error: 'Authentication service unavailable, try again shortly' });
    }
    return next(err);
  }
}

// Reachable without a token. Everything else under the API is denied by default.
const PUBLIC_PATHS = new Set(['/', '/health', '/api/auth/login', '/api/auth/logout']);
// Called by the scheduler, which authenticates with CRON_SECRET instead.
const CRON_PATH = '/api/command-center/sync-cron';

/** Deny by default: 401 unless the request carries a verified user or is on the public list. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (PUBLIC_PATHS.has(req.path) || req.path === CRON_PATH) return next();
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  next();
}

/** Issue a local demo JWT in seed mode */
export function issueLocalToken(displayName: string, role: string): string {
  return jwt.sign({ displayName, role } satisfies AuthPayload, config.JWT_LOCAL_SIGNING_SECRET, {
    expiresIn: '8h',
    algorithm: 'HS256',
  });
}
