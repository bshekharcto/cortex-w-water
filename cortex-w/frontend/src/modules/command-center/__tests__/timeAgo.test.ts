import { describe, it, expect } from 'vitest';
import { formatAgo } from '../utils/timeAgo';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('formatAgo', () => {
  it('picks the right unit', () => {
    expect(formatAgo(ago(12_000), NOW)).toBe('12s ago');
    expect(formatAgo(ago(3 * 60_000), NOW)).toBe('3m ago');
    expect(formatAgo(ago(5 * 3_600_000), NOW)).toBe('5h ago');
    expect(formatAgo(ago(4 * 86_400_000), NOW)).toBe('4d ago');
  });

  it('never goes negative when a clock is slightly ahead', () => {
    expect(formatAgo(new Date(NOW + 5000).toISOString(), NOW)).toBe('0s ago');
  });

  it('says n/a when there is no usable timestamp', () => {
    expect(formatAgo(null, NOW)).toBe('n/a');
    expect(formatAgo(undefined, NOW)).toBe('n/a');
    expect(formatAgo('garbage', NOW)).toBe('n/a');
  });
});
