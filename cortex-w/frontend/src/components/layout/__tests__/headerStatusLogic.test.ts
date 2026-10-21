import { describe, expect, it } from 'vitest';
import { headerPill } from '../headerStatusLogic';

describe('headerPill', () => {
  it('shows the scheduler time (HH:MM) when no page has taken the pill over', () => {
    expect(headerPill(undefined, '2026-10-09 18:15:00')?.text).toBe('18:15');
    expect(headerPill(undefined, null)).toBeNull();
  });

  it("shows the page's own time instead of the scheduler's when a page has taken it over", () => {
    const pill = headerPill({ text: '21 Oct 2026, 14:32:05', title: 'live' }, '2026-10-09 18:15:00');
    expect(pill).toEqual({ text: '21 Oct 2026, 14:32:05', title: 'live' });
  });

  it('shows nothing while the page that took it over has no time yet (never the scheduler time)', () => {
    expect(headerPill({ text: null }, '2026-10-09 18:15:00')).toBeNull();
    expect(headerPill({ text: '' }, '2026-10-09 18:15:00')).toBeNull();
  });

  it('falls back to the default tooltip when the page gives none', () => {
    expect(headerPill({ text: 'x' }, null)?.title).toMatch(/last updated/);
  });
});
