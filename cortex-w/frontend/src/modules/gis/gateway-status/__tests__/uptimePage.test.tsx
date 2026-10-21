// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { ConnectivityReport, GatewayConnectivity } from '@/services/api/gatewayStatusApi';

const report = vi.fn();
const presets = vi.fn();
vi.mock('@/services/api/gatewayStatusApi', () => ({ gatewayStatusApi: { report: (...a: unknown[]) => report(...a), presets: (...a: unknown[]) => presets(...a) } }));
const downloadFile = vi.fn();
vi.mock('../xlsx', async (orig) => ({ ...(await orig<typeof import('../xlsx')>()), downloadFile: (...a: unknown[]) => downloadFile(...a) }));

import { GatewayUptimePage } from '../pages/GatewayUptimePage';
import { GatewayStatusPage } from '../pages/GatewayStatusPage';
import { todayIn, addDays } from '../gatewayStatusModel';

const today = todayIn('Asia/Kolkata');
const yesterday = addDays(today, -1);
const day = (date: string, online: number, offline: number) => ({ date, onlineSeconds: online, offlineSeconds: offline, outages: 0, heartbeatsReceived: 0, heartbeatsExpected: 0 });
const gw = (id: string, address: string | null, days: ReturnType<typeof day>[], status: GatewayConnectivity['status'] = 'online'): GatewayConnectivity => ({
  gatewayId: id, status, lastSeenAt: null, uptimePercent: null, onlineSeconds: null, observedSeconds: null, downtimeEvents: 0,
  heartbeatsReceived: null, heartbeatsExpected: null, latitude: null, longitude: null, address, days,
});
const D1 = addDays(yesterday, -1);
const mk = (): ConnectivityReport => ({
  range: { startDate: D1, endDate: yesterday, timeZone: 'Asia/Kolkata' },
  generatedAt: new Date().toISOString(), counts: { online: 2, offline: 1, noData: 0, total: 3 }, historyAvailableFrom: null,
  gateways: [
    // 23:18:30 online on both days
    gw('506f9800000002a6', 'Nayapali', [day(D1, 83_910, 2_430), day(yesterday, 83_910, 2_430)]),
    // down all the first day, 12:00 online the second
    gw('506f9800000002a7', 'Sadar', [day(D1, 0, 86_400), day(yesterday, 43_200, 43_140)], 'offline'),
    // started on the second day: watched 10:53, online 10:50
    gw('506f9800000002a2', 'Mancheswar', [day(yesterday, 39_010, 170)]),
  ],
});

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname}{l.search}</div>;
}
function open(path = '/app/gis/gateway-status/uptime') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Where />
      <Routes>
        <Route path="/app/gis/gateway-status" element={<GatewayStatusPage />} />
        <Route path="/app/gis/gateway-status/uptime" element={<GatewayUptimePage />} />
        <Route path="/app/gis/gateway-status/:gatewayId" element={<div>timeline of a gateway</div>} />
      </Routes>
    </MemoryRouter>
  );
}
const rowOf = (id: string) => screen.getByText(id).closest('tr') as HTMLElement;
const cells = (id: string) => [...rowOf(id).querySelectorAll('td.gs-up-cell')].map((c) => c.textContent);

beforeEach(() => {
  report.mockReset();
  presets.mockReset();
  downloadFile.mockReset();
  report.mockImplementation(async () => mk());
  presets.mockImplementation(async () => ({ generatedAt: new Date().toISOString(), ranges: { '1D': mk(), '3D': mk(), '7D': mk(), '14D': mk() } }));
});
afterEach(cleanup);

describe('Gateway Uptime page', () => {
  it('asks for the last 15 whole days by default (ending yesterday) and lists every gateway, best average first', async () => {
    open();
    await waitFor(() => expect(screen.getByText('506f9800000002a6')).toBeTruthy());
    const asked = report.mock.calls[0][0] as { startDate: string; endDate: string };
    expect(asked.endDate).toBe(yesterday);
    expect(asked.startDate).toBe(addDays(yesterday, -14) < '2026-10-01' ? '2026-10-01' : addDays(yesterday, -14));
    const order = [...document.querySelectorAll('tbody tr')].map((r) => r.querySelector('td')?.textContent);
    // averages: 02a2 99.5 (its one watched day), 02a6 97.1, 02a7 25.0
    expect(order).toEqual(['506f9800000002a2', '506f9800000002a6', '506f9800000002a7']);
  });

  it('shows hours:minutes with "–" for no data and "*" for a part-watched day, and switches to percent', async () => {
    open();
    await waitFor(() => expect(screen.getByText('506f9800000002a6')).toBeTruthy());
    // the last two columns are the two days with data; earlier days of the 15 are "–"
    expect(cells('506f9800000002a6').slice(-2)).toEqual(['23:18', '23:18']);
    expect(cells('506f9800000002a6').slice(0, 3)).toEqual(['–', '–', '–']);
    expect(cells('506f9800000002a7').slice(-2)).toEqual(['0:00', '12:00']);
    expect(cells('506f9800000002a2').slice(-2)).toEqual(['–', '10:50*']);
    expect(within(rowOf('506f9800000002a6')).getAllByRole('cell').pop()?.textContent).toBe('23:18');

    fireEvent.click(screen.getByRole('button', { name: 'Percent' }));
    expect(cells('506f9800000002a6').slice(-2)).toEqual(['97.1', '97.1']);
    expect(cells('506f9800000002a7').slice(-2)).toEqual(['0.0', '50.0']);
    expect(cells('506f9800000002a2').slice(-2)).toEqual(['–', '99.5*']);
    expect(within(rowOf('506f9800000002a6')).getAllByRole('cell').pop()?.textContent).toBe('97.1%');
    // the unit is kept in the address
    expect(screen.getByTestId('where').textContent).toContain('unit=percent');
  });

  it('colours each cell by its band', async () => {
    open();
    await waitFor(() => expect(screen.getByText('506f9800000002a6')).toBeTruthy());
    const bg = (id: string, i: number) => (rowOf(id).querySelectorAll('td.gs-up-cell')[i] as HTMLElement).style.background;
    const n = rowOf('506f9800000002a6').querySelectorAll('td.gs-up-cell').length;
    // 97.1% -> the top band; 0% -> the lowest; 50.0% -> the 50-75 band; no data -> the pale grey
    expect(bg('506f9800000002a6', n - 1)).toMatch(/rgb\(187, 247, 208\)|#bbf7d0/i);
    expect(bg('506f9800000002a7', n - 2)).toMatch(/rgb\(254, 202, 202\)|#fecaca/i);
    expect(bg('506f9800000002a7', n - 1)).toMatch(/rgb\(254, 215, 170\)|#fed7aa/i);
    expect(bg('506f9800000002a6', 0)).toMatch(/rgb\(248, 250, 252\)|#f8fafc/i);
  });

  it('filters by gateway ID or address, by status and by "average below"', async () => {
    open();
    await waitFor(() => expect(screen.getByText('506f9800000002a6')).toBeTruthy());
    const ids = () => [...document.querySelectorAll('tbody tr')].map((r) => r.querySelector('td')?.textContent);
    fireEvent.change(screen.getByLabelText('Search gateways'), { target: { value: 'sadar' } });
    expect(ids()).toEqual(['506f9800000002a7']);
    fireEvent.change(screen.getByLabelText('Search gateways'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Offline/ }));
    expect(ids()).toEqual(['506f9800000002a7']);
    fireEvent.click(screen.getByRole('button', { name: /Offline/ }));
    fireEvent.change(screen.getByLabelText('Average below'), { target: { value: '75' } });
    expect(ids()).toEqual(['506f9800000002a7']);
    expect(screen.getByText(/1 of 3 gateways/)).toBeTruthy();
  });

  it('sorts by the address and back by the average', async () => {
    open();
    await waitFor(() => expect(screen.getByText('506f9800000002a6')).toBeTruthy());
    const ids = () => [...document.querySelectorAll('tbody tr')].map((r) => r.querySelector('td')?.textContent);
    fireEvent.click(screen.getByRole('button', { name: /^Address/ }));
    expect(ids()).toEqual(['506f9800000002a2', '506f9800000002a6', '506f9800000002a7']); // Mancheswar, Nayapali, Sadar
    fireEvent.click(screen.getByRole('button', { name: /^Address/ }));
    expect(ids()).toEqual(['506f9800000002a7', '506f9800000002a6', '506f9800000002a2']);
  });

  it('shows the colour legend and the notes under the chart', async () => {
    open();
    await waitFor(() => expect(screen.getByText('506f9800000002a6')).toBeTruthy());
    for (const label of ['95–100%', '90–95%', '75–90%', '50–75%', 'below 50%']) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText(/no data recorded for that day/)).toBeTruthy();
  });

  it('downloads an Excel file with both units, or a CSV of the unit being looked at', async () => {
    open();
    await waitFor(() => expect(screen.getByText('506f9800000002a6')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Download/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Excel/ }));
    expect(downloadFile).toHaveBeenCalledTimes(1);
    expect(downloadFile.mock.calls[0][0]).toMatch(/^Gateway_Uptime_both_\d{2}[A-Za-z]{3}-\d{2}[A-Za-z]{3}\d{4}\.xlsx$/);
    expect(downloadFile.mock.calls[0][1]).toBeInstanceOf(Uint8Array);

    fireEvent.click(screen.getByRole('button', { name: 'Percent' }));
    fireEvent.click(screen.getByRole('button', { name: /Download/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /CSV/ }));
    expect(downloadFile).toHaveBeenCalledTimes(2);
    expect(downloadFile.mock.calls[1][0]).toMatch(/^Gateway_Uptime_percent_.*\.csv$/);
    const csv = downloadFile.mock.calls[1][1] as string;
    expect(csv).toContain('506f9800000002a6,Nayapali,');
    expect(csv).toContain('97.1');
  });

  it('a download carries only the gateways the filters leave', async () => {
    open();
    await waitFor(() => expect(screen.getByText('506f9800000002a6')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Search gateways'), { target: { value: 'sadar' } });
    fireEvent.click(screen.getByRole('button', { name: /Download/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /CSV/ }));
    const csv = downloadFile.mock.calls[0][1] as string;
    expect(csv).toContain('506f9800000002a7');
    expect(csv).not.toContain('506f9800000002a6');
  });

  it('offers 7 / 15 / 30 days and a calendar, and asks again for the range chosen', async () => {
    open();
    await waitFor(() => expect(screen.getByText('506f9800000002a6')).toBeTruthy());
    expect(screen.getByRole('button', { name: '7D' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '15D' }).className).toContain('active');
    expect(screen.getByRole('button', { name: '30D' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pick dates' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '7D' }));
    await waitFor(() => expect(report.mock.calls.length).toBeGreaterThan(1));
    const last = report.mock.calls[report.mock.calls.length - 1][0] as { startDate: string; endDate: string };
    expect(last).toMatchObject({ startDate: addDays(yesterday, -6), endDate: yesterday });
    expect(screen.getByTestId('where').textContent).toContain('range=7D');
  });
});

describe('from the Gateway Status page', () => {
  it('has an "Uptime chart" button next to the date range that opens the page (not mistaken for a gateway ID)', async () => {
    open('/app/gis/gateway-status');
    const button = await screen.findByRole('button', { name: /Uptime chart/ });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/app/gis/gateway-status/uptime'));
    expect(await screen.findByText('Gateway Uptime')).toBeTruthy();
    expect(screen.queryByText('timeline of a gateway')).toBeNull();
  });

  it('the uptime page goes back to Gateway Status', async () => {
    open();
    await waitFor(() => expect(screen.getByText('506f9800000002a6')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Back to Gateway Status' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/app/gis/gateway-status'));
  });
});
