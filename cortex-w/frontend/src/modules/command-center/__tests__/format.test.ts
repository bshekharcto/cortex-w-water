import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { fmt, formatFrequency, formatLocalTime, formatStatusByte, formatTrend, utcTitle, yesNo } from '../utils/format';

beforeAll(() => {
  vi.stubEnv('TZ', 'Asia/Kolkata'); // the operators' timezone, so the expectations below are fixed
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe('display formatting never invents values', () => {
  it('missing data shows an em dash', () => {
    expect(fmt(null)).toBe('—');
    expect(fmt(undefined, ' dBm')).toBe('—');
    expect(fmt('')).toBe('—');
    expect(fmt(0, ' dB')).toBe('0 dB'); // zero is a real value
  });

  it('yes/no distinguishes "no" from "we do not know"', () => {
    expect(yesNo(true)).toBe('Yes');
    expect(yesNo(false)).toBe('No');
    expect(yesNo(null)).toBe('—');
    expect(yesNo(undefined)).toBe('—');
  });

  it('frequency: upstream Hz is shown as MHz', () => {
    expect(formatFrequency(865062500)).toBe('865.0625');
    expect(formatFrequency(865985000, true)).toBe('865.985 MHz');
    expect(formatFrequency(868.1)).toBe('868.1'); // already MHz
    expect(formatFrequency(null)).toBe('—');
  });

  it('status byte as hex and decimal', () => {
    expect(formatStatusByte(168)).toBe('0xA8 (168)');
    expect(formatStatusByte(5)).toBe('0x05 (5)');
    expect(formatStatusByte(null)).toBe('—');
  });

  it('trend arrows, and nothing when there is nothing to compare', () => {
    expect(formatTrend(12)).toBe('↑ 12%');
    expect(formatTrend(-38)).toBe('↓ 38%');
    expect(formatTrend(0)).toBe('→ 0%');
    expect(formatTrend(null)).toBe('');
  });

  it('times: today shows only the clock, other days add the date, in the viewer\'s timezone', () => {
    const now = new Date('2026-10-06T10:00:00Z'); // 15:30 IST
    expect(formatLocalTime('2026-10-06T03:16:26Z', now)).toBe('08:46:26');
    expect(formatLocalTime('2026-10-04T23:30:00Z', now)).toBe('05 Oct 05:00:00');
    expect(formatLocalTime(null)).toBe('—');
    expect(formatLocalTime('not a date')).toBe('—');
  });

  it('the tooltip carries the exact UTC instant', () => {
    expect(utcTitle('2026-10-06T03:16:26.539Z')).toBe('2026-10-06 03:16:26.539 UTC');
    expect(utcTitle(undefined)).toBeUndefined();
  });
});
