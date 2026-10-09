import { describe, it, expect } from 'vitest';
import { bucketSizeLabel, formatBucketTick, formatBucketTooltip, percentChange } from '../utils/trafficLabels';

describe('traffic chart labels', () => {
  it('axis ticks: a day for daily buckets, a clock time otherwise', () => {
    expect(formatBucketTick('2026-10-06T00:00', '1d')).toBe('06 Oct');
    expect(formatBucketTick('2026-10-06T14:20', '5m')).toBe('14:20');
    expect(formatBucketTick('2026-10-06T14:00', '1h')).toBe('14:00');
  });

  it('tooltips include the date for sub-day buckets', () => {
    expect(formatBucketTooltip('2026-10-06T00:00', '1d')).toBe('06 Oct');
    expect(formatBucketTooltip('2026-10-06T14:20', '15m')).toBe('06 Oct 14:20');
  });

  it('does not shift the label through a timezone conversion', () => {
    expect(formatBucketTick('2026-01-01T00:00', '1d')).toBe('01 Jan');
  });

  it('bucket names', () => {
    expect(bucketSizeLabel('5m')).toBe('5-minute');
    expect(bucketSizeLabel('1d')).toBe('daily');
  });

  it('percent change, and null when there is nothing to compare', () => {
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(10, 0)).toBeNull();
  });
});
