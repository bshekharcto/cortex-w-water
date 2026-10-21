// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { GisMeter } from '../gisData';

const getMeterDetail = vi.fn();
vi.mock('@/services/api/mapApi', () => ({ mapApi: { getMeterDetail: (...a: unknown[]) => getMeterDetail(...a) } }));

import { MeterHistoryDrawer } from '../MeterHistoryDrawer';

const meter = {
  assetId: 77,
  meterId: 'MTR-77',
  gatewayId: '506f980000000001',
  householdName: 'A Consumer',
  status: 'connected',
  alerts: [],
} as unknown as GisMeter;

const core = {
  assetId: 77, meterId: 'MTR-77', latestReading: 12.5, lastSeen: '2026-10-21T01:00:00Z', consumption: 0.2, monthToDateM3: 3,
  consumer: { customId: 'C-1', name: 'A Consumer', mobile: null, location: 'Road 1', ward: '4', status: null, siteName: null },
  replacement: null, photos: [], latestBill: null, partial: true, unavailable: [],
  dailyReadings: [{ date: '2026-10-20', shortDate: 'Oct 20', readingM3: 12.3, consumptionL: 200, consumptionM3: 0.2 }],
};
const profile = { ...core, consumer: { ...core.consumer, mobile: '9999900000', status: 'ACTIVE' }, latestBill: { totalAmount: 123 } };
const documents = { ...core, photos: [{ name: 'p1', category: 'NEW_METER_DOCUMENT', url: 'https://s3.example/p1.jpg' }] };

function open() {
  return render(
    <MemoryRouter>
      <MeterHistoryDrawer meter={meter} onClose={() => undefined} />
    </MemoryRouter>
  );
}
const calls = () => getMeterDetail.mock.calls.map((c) => c[2] as { core?: boolean; parts?: string[] } | undefined);

beforeEach(() => {
  getMeterDetail.mockReset();
  getMeterDetail.mockImplementation(async (_a: unknown, _m: unknown, opts?: { core?: boolean; parts?: string[] }) => {
    if (opts?.core) return core;
    if (opts?.parts?.[0] === 'profile') return profile;
    if (opts?.parts?.[0] === 'documents') return documents;
    return { ...core, ...profile, ...documents };
  });
});
afterEach(cleanup);

describe('Meter 360 loads only what is on screen', () => {
  it('opening a meter fetches only the database part: no contact, bill, replacement or photos', async () => {
    open();
    await waitFor(() => expect(screen.getByText(/Meter MTR-77/)).toBeTruthy());
    await waitFor(() => expect(calls()).toHaveLength(1));
    expect(calls()[0]).toEqual({ core: true });
    // and no image is on the page
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });

  it('the bill is not fetched with the meter: its footer points to Consumer Profile', async () => {
    open();
    await waitFor(() => expect(screen.getByText('Bill: see Consumer Profile')).toBeTruthy());
  });

  it('opening Consumer Profile asks once for the contact/bill and once for the photos/replacement, then shows the photos', async () => {
    open();
    await waitFor(() => expect(calls()).toHaveLength(1));
    fireEvent.click(screen.getByText('Consumer Profile'));
    await waitFor(() => expect(calls()).toHaveLength(3));
    expect(calls().slice(1).map((c) => c?.parts?.join(','))).toEqual(expect.arrayContaining(['profile', 'documents']));
    await waitFor(() => expect(document.querySelectorAll('img.gis-photo-thumb')).toHaveLength(1));
    expect(screen.getByText('9999900000')).toBeTruthy();
    // switching tabs and back does not ask again
    fireEvent.click(screen.getByText(/Readings/));
    fireEvent.click(screen.getByText('Consumer Profile'));
    await new Promise((r) => setTimeout(r, 30));
    expect(calls()).toHaveLength(3);
    // the bill appears in the first tab once it has been fetched
    fireEvent.click(screen.getByText(/Readings/));
    expect(screen.getByText('Est. ₹123')).toBeTruthy();
  });

  it('a failed photo load says so and can be retried', async () => {
    getMeterDetail.mockImplementation(async (_a: unknown, _m: unknown, opts?: { core?: boolean; parts?: string[] }) => {
      if (opts?.core) return core;
      if (opts?.parts?.[0] === 'documents') throw new Error('boom');
      return profile;
    });
    open();
    await waitFor(() => expect(calls()).toHaveLength(1));
    fireEvent.click(screen.getByText('Consumer Profile'));
    await waitFor(() => expect(screen.getByText(/Could not load the photos/)).toBeTruthy());
    getMeterDetail.mockImplementation(async () => documents);
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(document.querySelectorAll('img.gis-photo-thumb')).toHaveLength(1));
  });

  it('shows the last-communication gateway under the nearest one when given', async () => {
    render(
      <MemoryRouter>
        <MeterHistoryDrawer
          meter={meter}
          onClose={() => undefined}
          nearestGateway={{ gatewayId: 'near · Near GW', distanceLabel: '300 m' }}
          lastGateway={{ gatewayId: '506f980000000001 · GW-1', distanceLabel: '1.1 km' }}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Nearest gateway')).toBeTruthy();
    expect(screen.getByText('Last communication via')).toBeTruthy();
    expect(screen.getByText('506f980000000001 · GW-1')).toBeTruthy();
    expect(screen.getByText('1.1 km')).toBeTruthy();
  });
});
