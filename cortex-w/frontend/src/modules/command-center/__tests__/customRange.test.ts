import { describe, it, expect } from 'vitest';
import { MAX_RANGE_DAYS, validateCustomRange } from '../utils/customRange';

describe('custom range validation', () => {
  it('accepts a normal range and a single day', () => {
    expect(validateCustomRange({ from: '2026-09-29', to: '2026-10-01' })).toBeNull();
    expect(validateCustomRange({ from: '2026-10-01', to: '2026-10-01' })).toBeNull();
  });

  it('explains each way a range can be unusable', () => {
    expect(validateCustomRange({ from: '', to: '2026-10-01' })).toMatch(/both/i);
    expect(validateCustomRange({ from: '2026-10-05', to: '2026-09-01' })).toMatch(/on or before/i);
    expect(validateCustomRange({ from: 'x', to: 'y' })).toMatch(/valid/i);
  });

  it('allows exactly the maximum span and rejects one day more, naming the size', () => {
    const start = Date.parse('2026-01-01');
    const iso = (n: number) => new Date(start + n * 86400000).toISOString().slice(0, 10);
    expect(validateCustomRange({ from: iso(0), to: iso(MAX_RANGE_DAYS - 1) })).toBeNull();
    expect(validateCustomRange({ from: iso(0), to: iso(MAX_RANGE_DAYS) })).toMatch(new RegExp(`${MAX_RANGE_DAYS} days.*${MAX_RANGE_DAYS + 1}`));
  });
});
