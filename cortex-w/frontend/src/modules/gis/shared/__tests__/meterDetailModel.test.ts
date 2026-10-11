import { describe, it, expect } from 'vitest';
import { consumerHeadline, csvCell, formatMHz, statusBadge, summarizeDays } from '../meterDetailModel';

describe('summarizeDays', () => {
  it('has no Infinity and no invented numbers when there are no days', () => {
    expect(summarizeDays([])).toEqual({ days: 0, totalL: 0, avgL: 0, maxL: null, minL: null });
  });
  it('totals, averages and ranges only the days that exist', () => {
    expect(summarizeDays([{ consumptionL: 100 }, { consumptionL: 0 }, { consumptionL: 350 }])).toEqual({ days: 3, totalL: 450, avgL: 150, maxL: 350, minL: 0 });
  });
});

describe('formatMHz', () => {
  it('formats Hz as MHz and shows a dash for unknown values', () => {
    expect(formatMHz(865_202_000)).toBe('865.2 MHz');
    expect(formatMHz(null)).toBe('—');
    expect(formatMHz(0)).toBe('—');
  });
});

describe('consumerHeadline', () => {
  it('never prints empty brackets or "Ward ()"', () => {
    expect(consumerHeadline({ name: null, ward: null, id: null })).toBe('Consumer not linked');
    expect(consumerHeadline({ name: 'A Kumar', ward: '12', id: 'WS/BMC/1' })).toBe('A Kumar · Ward 12 · WS/BMC/1');
    expect(consumerHeadline({ name: 'A Kumar', ward: null, id: 'WS/BMC/1' })).toBe('A Kumar · WS/BMC/1');
  });
});

describe('statusBadge', () => {
  it('maps the status scales and tolerates a missing status', () => {
    expect(statusBadge('live')).toEqual({ label: 'LIVE', cssKey: 'live' });
    expect(statusBadge('never')).toEqual({ label: 'NEVER SEEN', cssKey: 'never' });
    expect(statusBadge('weak')).toEqual({ label: 'WEAK', cssKey: 'weak' });
    expect(statusBadge(null).label).toBe('—');
  });
});

describe('csvCell', () => {
  it('quotes values that would break the row', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
    expect(csvCell(12)).toBe('12');
  });
});
