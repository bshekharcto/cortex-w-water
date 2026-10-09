/**
 * Turns whatever a Command Center request threw into a short, human-readable reason.
 *
 * The shared HTTP client throws `UiApiError` objects (not `Error`s) whose `technicalMessage` carries the
 * server's own explanation ("<error> — <message>"), so checking `instanceof Error` alone loses it.
 */
export function describeError(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof DOMException && err.name === 'AbortError') return 'Request cancelled';
  if (err instanceof TypeError) return 'Cannot reach the server. Is the backend running?';
  if (err instanceof Error) return err.message || fallback;
  if (err && typeof err === 'object') {
    const e = err as { technicalMessage?: unknown; operatorMessage?: unknown };
    if (typeof e.technicalMessage === 'string' && e.technicalMessage) {
      // "Invalid time window — Custom range cannot exceed 90 days" -> the specific part
      const parts = e.technicalMessage.split(' — ');
      return parts[parts.length - 1];
    }
    if (typeof e.operatorMessage === 'string' && e.operatorMessage) return e.operatorMessage;
  }
  return fallback;
}

/** An aborted request is expected (the user moved on); callers should ignore it silently. */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}
