import type { ErrorRequestHandler, RequestHandler, Router } from 'express';

/**
 * Express 4 does not catch a rejected promise from an async handler: the
 * request just hangs, and on a long-running server the unhandled rejection can
 * take the process down. Wrap every route handler so a rejection reaches the
 * error handler below instead.
 */
export function wrapAsync(router: Router): Router {
  for (const layer of router.stack as any[]) {
    for (const l of layer.route?.stack ?? []) {
      const orig = l.handle;
      if (typeof orig !== 'function' || orig.length > 3) continue; // leave error handlers alone
      l.handle = (req: any, res: any, next: any) => {
        try {
          const out = orig(req, res, next);
          if (out && typeof out.catch === 'function') out.catch(next);
        } catch (err) {
          next(err);
        }
      };
    }
  }
  return router;
}

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

/**
 * The only place an unexpected error becomes a response. The client gets a
 * generic message; the detail (which can name tables, hosts or upstream
 * paths) stays in the server log.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = Number(err?.status ?? err?.statusCode);
  if (status >= 400 && status < 500) {
    const message = err?.type === 'entity.too.large' ? 'Request too large' : err?.type === 'entity.parse.failed' ? 'Invalid JSON' : 'Bad request';
    return res.status(status).json({ error: message });
  }
  console.error(`[api] Unhandled error on ${req.method} ${req.path}:`, err?.message || err);
  res.status(500).json({ error: 'Internal server error' });
};
