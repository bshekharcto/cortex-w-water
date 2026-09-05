export interface UiApiError {
  status: number;
  operatorMessage: string;
  technicalMessage?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * The upstream backend returns error bodies in at least four shapes
 * (spec 28.6): a standard error object, a bare validation string array,
 * `{"error-type": "..."}`, and a report-specific `{"error","message"}`.
 * Normalize once, here, so pages never branch on response shape.
 */
export function normalizeApiError(status: number, body: unknown): UiApiError {
  const fallback = 'Something went wrong talking to the water platform.';

  if (Array.isArray(body)) {
    return {
      status,
      operatorMessage: 'Some fields need attention before this can be saved.',
      fieldErrors: body.reduce<Record<string, string>>((acc, msg, i) => {
        acc[`field_${i}`] = String(msg);
        return acc;
      }, {}),
    };
  }

  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (typeof b['error-type'] === 'string') {
      return { status, operatorMessage: fallback, technicalMessage: b['error-type'] as string };
    }
    if (typeof b.error === 'string' || typeof b.message === 'string') {
      return {
        status,
        operatorMessage: humanizeStatus(status),
        technicalMessage: [b.error, b.message].filter(Boolean).join(' — '),
      };
    }
  }

  return { status, operatorMessage: humanizeStatus(status) };
}

function humanizeStatus(status: number): string {
  switch (status) {
    case 400: return 'That request was not valid. Please check the fields and try again.';
    case 401: return 'Your session has expired. Please sign in again.';
    case 403: return 'You do not have permission to do that.';
    case 404: return 'That record could not be found.';
    case 405: return 'This action is not supported for that request.';
    default: return 'Something went wrong talking to the water platform.';
  }
}
