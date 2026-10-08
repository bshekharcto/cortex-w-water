// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { LiveNetworkFeed } from '../components/LiveNetworkFeed';
import { frame, stubResizeObserver } from './fixtures';

vi.mock('@/services/api/commandCenterApi', async (orig) => ({
  ...(await orig<typeof import('@/services/api/commandCenterApi')>()),
  fetchFleetFrames: vi.fn(),
}));
import { fetchFleetFrames } from '@/services/api/commandCenterApi';

const noop = () => {};
const win = { days: 7 };
const first = [frame('5'), frame('4'), frame('3')];

function feed(frames = first, w = win, siteId = 'ALL') {
  return <LiveNetworkFeed frames={frames} onSelectMeter={noop} onInspectFrame={noop} win={w} siteId={siteId} />;
}
const rows = () => document.querySelectorAll('tr.cc-feed-row').length;

beforeEach(() => {
  stubResizeObserver();
  vi.mocked(fetchFleetFrames).mockResolvedValue({ total: 5, limit: 100, offset: 3, items: [frame('2'), frame('1')] });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function loadOlder() {
  fireEvent.click(screen.getByText(/Load older frames/));
  await waitFor(() => expect(rows()).toBe(5));
}

describe('LiveNetworkFeed paging', () => {
  it('pages older frames after the ones from the summary', async () => {
    render(feed());
    await loadOlder();
    expect(fetchFleetFrames).toHaveBeenCalledWith(win, 'ALL', expect.objectContaining({ offset: 3 }));
  });

  it('keeps paged-in frames when a refresh brings a fresh first page that overlaps the old one', async () => {
    const { rerender } = render(feed());
    await loadOlder();
    rerender(feed([frame('6'), frame('5'), frame('4'), frame('3')]));
    expect(rows()).toBe(6); // 4 from the summary + the 2 already paged in
  });

  it('starts over when so many frames arrived that the new page no longer overlaps (it would leave a gap)', async () => {
    const { rerender } = render(feed());
    await loadOlder();
    rerender(feed([frame('20'), frame('19'), frame('18')]));
    await waitFor(() => expect(rows()).toBe(3));
  });

  it('starts over when the window or the site changes', async () => {
    const { rerender } = render(feed());
    await loadOlder();
    rerender(feed(first, { days: 30 }));
    await waitFor(() => expect(rows()).toBe(3));
    await loadOlder();
    rerender(feed(first, { days: 30 }, '42'));
    await waitFor(() => expect(rows()).toBe(3));
  });
});
