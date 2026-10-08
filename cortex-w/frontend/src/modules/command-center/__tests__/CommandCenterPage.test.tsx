// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CommandCenterPage } from '../pages/CommandCenterPage';
import { frame, gateway, meter, stubLocalStorage, stubResizeObserver } from './fixtures';

vi.mock('@/services/api/commandCenterApi', async (orig) => ({
  ...(await orig<typeof import('@/services/api/commandCenterApi')>()),
  fetchSites: vi.fn(),
  fetchCommandCenterSummary: vi.fn(),
  fetchCommandCenterHealth: vi.fn(),
  fetchGatewayMeters: vi.fn(),
  fetchMeter: vi.fn(),
  searchMeters: vi.fn(),
  fetchMeterFrames: vi.fn(),
  fetchGatewayFrames: vi.fn(),
  fetchFleetFrames: vi.fn(),
  fetchTraffic: vi.fn(),
  fetchRadioHealth: vi.fn(),
  fetchFleetMeters: vi.fn(),
}));
import * as api from '@/services/api/commandCenterApi';

// "0025" is both a meter id fragment and part of gateway gw-0025-x's id: the old search jumped to the gateway
const gwNear = gateway('gw-0025-x', 'GW-XXXX');
const gwOther = gateway('gw-other', 'GW-OTHR');

const summary = (frames = [frame('1', { meterId: 'm-feed', gatewayId: 'gw-other', gatewayAlias: 'GW-OTHR' })]) => ({
  generatedAt: '2026-10-08T05:00:00.000Z',
  isCached: false,
  kpis: {
    gatewaysWithTraffic: 2, totalConfiguredGateways: 2, noRecentTrafficGateways: 0, uniqueMetersSeen: 2, framesReceived: 1,
    framesTrendPct: null, lastFrameAt: null, multiGatewayMeters: 0, avgRssi: null, avgSnr: null,
  },
  thresholds: {
    gatewayStaleMinutes: 1440, gatewayCriticalMinutes: 2880, meterStaleMinutes: 1440, meterCriticalHours: 48,
    gatewayTrafficDropWarningPct: 30, gatewayTrafficDropCriticalPct: 60, rssiWeakDbm: -95, rssiCriticalDbm: -105,
    snrWeakDb: -10, snrCriticalDb: -18, trendMinPrevFrames: 20, trendsEnabled: false,
    rssiBands: { strong: -80, good: -90, weak: -100 }, snrBands: { excellent: 5, good: 0, marginal: -10 },
  },
  gateways: [gwNear, gwOther],
  recentFrames: frames,
});

const hit = (gatewayId: string, meterId: string) => ({ gatewayId, meter: meter(meterId, { gatewayId } as never) });

async function mountAndSettle() {
  render(
    <MemoryRouter initialEntries={['/app/command-center']}>
      <CommandCenterPage />
    </MemoryRouter>
  );
  await waitFor(() => expect(api.fetchGatewayMeters).toHaveBeenCalled()); // the first gateway is auto-selected once loaded
}
const search = (text: string) =>
  fireEvent.change(screen.getByLabelText(/Search meter ID, DevEUI or gateway/i), { target: { value: text } });

beforeEach(() => {
  stubResizeObserver();
  stubLocalStorage();
  vi.mocked(api.fetchSites).mockResolvedValue([{ id: 'ALL', name: 'All Sites' }]);
  vi.mocked(api.fetchCommandCenterSummary).mockResolvedValue(summary() as never);
  vi.mocked(api.fetchCommandCenterHealth).mockResolvedValue({ syncBehind: false, session: null } as never);
  vi.mocked(api.fetchGatewayMeters).mockResolvedValue([]);
  vi.mocked(api.fetchMeter).mockResolvedValue(null);
  vi.mocked(api.searchMeters).mockResolvedValue([]);
  vi.mocked(api.fetchMeterFrames).mockResolvedValue({ total: 0, limit: 15, offset: 0, items: [] });
  vi.mocked(api.fetchGatewayFrames).mockResolvedValue({ total: 0, limit: 100, offset: 0, items: [] });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('global search', () => {
  it('an exact gateway alias opens the gateway without searching meters', async () => {
    await mountAndSettle();
    search('GW-OTHR');
    await waitFor(() => expect(api.fetchGatewayMeters).toHaveBeenCalledWith('gw-other', expect.anything(), expect.anything()));
    expect(api.searchMeters).not.toHaveBeenCalled();
  });

  it('a meter id fragment that also sits inside a gateway id finds the meter, not the gateway', async () => {
    vi.mocked(api.searchMeters).mockResolvedValue([hit('gw-other', 'm-0025-7')]);
    await mountAndSettle();
    vi.mocked(api.fetchGatewayMeters).mockClear();
    search('0025');
    await waitFor(() => expect(api.fetchMeterFrames).toHaveBeenCalledWith('m-0025-7', expect.anything(), expect.anything()));
    expect(api.fetchGatewayMeters).toHaveBeenCalledWith('gw-other', expect.anything(), expect.anything());
    expect(api.fetchGatewayMeters).not.toHaveBeenCalledWith('gw-0025-x', expect.anything(), expect.anything());
  });

  it('an exact meter id is looked up exactly, so a capped substring search cannot lose it', async () => {
    vi.mocked(api.fetchMeter).mockResolvedValue(hit('gw-other', 'zz-last'));
    await mountAndSettle();
    search('zz-last');
    await waitFor(() => expect(api.fetchMeterFrames).toHaveBeenCalledWith('zz-last', expect.anything(), expect.anything()));
    expect(api.searchMeters).not.toHaveBeenCalled();
  });

  it('a meter whose gateway is not in the selected site opens, and the page says so instead of jumping', async () => {
    vi.mocked(api.searchMeters).mockResolvedValue([hit('gw-elsewhere', 'm-far-1')]);
    await mountAndSettle();
    vi.mocked(api.fetchGatewayMeters).mockClear();
    search('far');
    expect(await screen.findByText(/gateway is not part of the selected site/i)).toBeTruthy();
    await waitFor(() => expect(api.fetchMeterFrames).toHaveBeenCalledWith('m-far-1', expect.anything(), expect.anything()));
    expect(api.fetchGatewayMeters).not.toHaveBeenCalledWith('gw-elsewhere', expect.anything(), expect.anything());
  });

  it('with no meter match, a partial gateway match still works', async () => {
    await mountAndSettle();
    search('0025');
    await waitFor(() => expect(api.fetchGatewayMeters).toHaveBeenCalledWith('gw-0025-x', expect.anything(), expect.anything()));
  });
});

describe('opening a meter by id (feed rows, drawers, links)', () => {
  const openFeedMeter = async () => {
    await mountAndSettle();
    fireEvent.click(await screen.findByTitle('Click to inspect Meter m-feed'));
  };

  it('uses the exact lookup and opens the meter', async () => {
    vi.mocked(api.fetchMeter).mockResolvedValueOnce(hit('gw-other', 'm-feed'));
    await openFeedMeter();
    await waitFor(() => expect(api.fetchMeterFrames).toHaveBeenCalledWith('m-feed', expect.anything(), expect.anything()));
    expect(api.searchMeters).not.toHaveBeenCalled();
  });

  it('falls back to a 90-day look-back and flags the meter as outside the window', async () => {
    vi.mocked(api.fetchMeter).mockResolvedValueOnce(null).mockResolvedValueOnce(hit('gw-other', 'm-feed'));
    await openFeedMeter();
    expect(await screen.findByText(/was not heard in the selected window/i)).toBeTruthy();
    expect(vi.mocked(api.fetchMeter).mock.calls[1][1]).toEqual({ days: 90 });
  });

  it('tells the user when the meter has no stored frames at all (it used to do nothing)', async () => {
    await openFeedMeter();
    expect(await screen.findByText(/has no stored frames in the last 90 days/i)).toBeTruthy();
  });
});
