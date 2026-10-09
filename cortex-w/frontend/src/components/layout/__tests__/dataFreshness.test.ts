import { describe, it, expect } from 'vitest';
import { nextFreshness, type FreshnessState } from '../freshnessLogic';

const empty: FreshnessState = { localTime: null, updatedAt: null, version: 0 };
const at = (iso: string, local: string) => ({ updatedAt: iso, localTime: local });

describe('nextFreshness', () => {
  it('shows the time of the first answer without counting it as a change', () => {
    const s = nextFreshness(empty, at('2026-10-09T13:00:00.000Z', '2026-10-09 18:30:00'));
    expect(s).toEqual({ updatedAt: '2026-10-09T13:00:00.000Z', localTime: '2026-10-09 18:30:00', version: 0 });
  });

  it('keeps the version while the update is the same one', () => {
    const first = nextFreshness(empty, at('2026-10-09T13:00:00.000Z', '2026-10-09 18:30:00'));
    expect(nextFreshness(first, at('2026-10-09T13:00:00.000Z', '2026-10-09 18:30:00')).version).toBe(0);
  });

  it('raises the version when the scheduler has updated the numbers again', () => {
    const first = nextFreshness(empty, at('2026-10-09T13:00:00.000Z', '2026-10-09 18:30:00'));
    const next = nextFreshness(first, at('2026-10-09T13:15:00.000Z', '2026-10-09 18:45:00'));
    expect(next.version).toBe(1);
    expect(next.localTime).toBe('2026-10-09 18:45:00');
    expect(nextFreshness(next, at('2026-10-09T13:30:00.000Z', '2026-10-09 19:00:00')).version).toBe(2);
  });
});
