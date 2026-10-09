import type { Response } from 'express';

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
