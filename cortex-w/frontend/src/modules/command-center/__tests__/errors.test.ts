import { describe, it, expect } from 'vitest';
import { describeError, isAbortError } from '../utils/errors';

describe('describeError', () => {
  it('shows the server\'s own explanation from the shared client\'s error objects', () => {
    expect(describeError({ status: 400, operatorMessage: 'That request was not valid.', technicalMessage: 'Invalid time window — Custom range cannot exceed 90 days' })).toBe('Custom range cannot exceed 90 days');
    expect(describeError({ status: 503, operatorMessage: 'x', technicalMessage: 'Telemetry summary unavailable — Site gateway summary is unavailable from the upstream API' })).toBe('Site gateway summary is unavailable from the upstream API');
  });

  it('falls back to the operator message, then to the caller\'s fallback', () => {
    expect(describeError({ status: 404, operatorMessage: 'That record could not be found.' })).toBe('That record could not be found.');
    expect(describeError(undefined, 'Search failed')).toBe('Search failed');
    expect(describeError({}, 'Search failed')).toBe('Search failed');
  });

  it('says plainly when the backend cannot be reached', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toMatch(/cannot reach the server/i);
  });

  it('uses the message of a normal Error', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('recognises a cancelled request', () => {
    const abort = new DOMException('aborted', 'AbortError');
    expect(isAbortError(abort)).toBe(true);
    expect(isAbortError(new Error('x'))).toBe(false);
    expect(describeError(abort)).toBe('Request cancelled');
  });
});
