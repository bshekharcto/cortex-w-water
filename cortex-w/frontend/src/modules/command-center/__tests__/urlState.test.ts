import { describe, it, expect } from 'vitest';
import { buildUrlSearch, parseUrlState, DEFAULT_URL_STATE, type CcUrlState } from '../utils/urlState';

const RANGE = { from: '2026-09-30', to: '2026-10-06' };
const base = (over: Partial<CcUrlState> = {}): CcUrlState => ({ ...DEFAULT_URL_STATE, ...RANGE, ...over });

describe('URL state', () => {
  it('leaves defaults out so URLs stay short', () => {
    expect(buildUrlSearch(base())).toBe('');
  });

  it('round-trips a full investigation', () => {
    const state = base({ site: '6906', window: '6H', gateway: '506f9800000002a0', tab: 'FRAMES', meter: '0025011333', mode: 'Meters' });
    const parsed = parseUrlState(buildUrlSearch(state), {}, RANGE);
    expect(parsed).toEqual(state);
  });

  it('keeps custom dates only for a custom window', () => {
    const custom = base({ window: 'CUSTOM', from: '2026-09-01', to: '2026-09-05' });
    const search = buildUrlSearch(custom);
    expect(search).toContain('window=CUSTOM');
    expect(parseUrlState(search, {}, RANGE)).toMatchObject({ window: 'CUSTOM', from: '2026-09-01', to: '2026-09-05' });
    expect(buildUrlSearch(base({ window: '30D' }))).not.toContain('from=');
  });

  it('a shared link with a bad custom range does not open on an error state', () => {
    for (const q of ['window=CUSTOM&from=2026-10-05&to=2026-09-01', 'window=CUSTOM&from=2026-01-01&to=2026-10-05', 'window=CUSTOM&from=bad&to=worse']) {
      expect(parseUrlState(q, {}, RANGE)).toMatchObject({ window: 'CUSTOM', ...RANGE });
    }
  });

  it('ignores malformed values and falls back to the defaults', () => {
    const parsed = parseUrlState('window=bogus&site=;drop&tab=zzz&gateway=<x>&meter=a b', {}, RANGE);
    expect(parsed).toMatchObject({ window: '7D', site: 'ALL', tab: 'METERS', gateway: null, meter: null });
  });

  it('legacy path parameters win over the query string', () => {
    const parsed = parseUrlState('gateway=aaa&meter=bbb', { gatewayId: '506f9800000002a4', meterId: '0025016559' }, RANGE);
    expect(parsed.gateway).toBe('506f9800000002a4');
    expect(parsed.meter).toBe('0025016559');
  });

  it('accepts the window in any letter case', () => {
    expect(parseUrlState('window=24h', {}, RANGE).window).toBe('24H');
  });
});
