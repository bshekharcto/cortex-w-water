import type { Request, Response } from 'express';
import { resolveWindow, type TelemetryWindow } from '../services/telemetryDbService.js';

const ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;

/** A gateway/meter id from a URL or query string, or null when it isn't a plausible id. */
export function validId(v: unknown): string | null {
  return typeof v === 'string' && ID_RE.test(v) ? v : null;
}

/** 'ALL' (the default) or a numeric site id; anything else is null. */
export function validSite(v: unknown): string | null {
  if (v === undefined || v === '') return 'ALL';
  return typeof v === 'string' && (v === 'ALL' || /^\d{1,12}$/.test(v)) ? v : null;
}

/** Parses ?hours= | ?days= | ?from=&to= into a window resolved against the server clock. */
export function windowFromQuery(q: Record<string, unknown>): TelemetryWindow {
  const num = (v: unknown) => (v === undefined || v === '' ? undefined : Number(v));
  return resolveWindow({ hours: num(q.hours), days: num(q.days), from: q.from as string, to: q.to as string });
}

/** The requested window, or answers 400 itself and returns null (a bad window is the client's fault). */
export function windowOr400(req: Request, res: Response): TelemetryWindow | null {
  try {
    return windowFromQuery(req.query);
  } catch (err) {
    res.status(400).json({ error: 'Invalid time window', message: (err as Error).message });
    return null;
  }
}

/** Page size/offset with sane bounds. */
export function pageParams(q: Record<string, unknown>, defaultLimit: number) {
  return {
    limit: Math.min(Math.max(parseInt(q.limit as string, 10) || defaultLimit, 1), 200),
    offset: Math.max(parseInt(q.offset as string, 10) || 0, 0),
  };
}

export function badRequest(res: Response, what: string) {
  res.status(400).json({ error: `Invalid ${what}`, message: `The ${what} in the request is not valid.` });
}
