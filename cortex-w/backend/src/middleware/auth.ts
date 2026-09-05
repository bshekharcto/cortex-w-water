import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export interface AuthPayload {
  displayName: string;
  role: string;
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(); // let route decide if auth is required
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.JWT_LOCAL_SIGNING_SECRET) as AuthPayload;
    (req as any).user = payload;
  } catch {
    // If not signed with local secret, decode upstream Cognecto JWT
    const decoded = jwt.decode(token) as any;
    if (decoded) {
      (req as any).user = {
        displayName: decoded.userName ?? decoded.displayName ?? 'WATCO User',
        role: Array.isArray(decoded.Roles) ? decoded.Roles[0] : (decoded.Roles ?? 'Root'),
        userId: decoded.sub,
        rawToken: token,
      };
    }
  }
  next();
}

/** Issue a local demo JWT in seed mode */
export function issueLocalToken(displayName: string, role: string): string {
  return jwt.sign({ displayName, role } satisfies AuthPayload, config.JWT_LOCAL_SIGNING_SECRET, { expiresIn: '8h' });
}
