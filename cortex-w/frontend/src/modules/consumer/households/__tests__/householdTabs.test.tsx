// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MeterPhotoGrid } from '@/modules/gis/shared/MeterPhotoGrid';
import { BillingTab } from '../components/tabs/BillingTab';
import { HardwareTab } from '../components/tabs/HardwareTab';
import { ReadingsTab } from '../components/tabs/ReadingsTab';

afterEach(cleanup);

describe('MeterPhotoGrid', () => {
  it('has a loading, an error (with retry), an empty and a filled state', () => {
    const retry = vi.fn();
    const { rerender } = render(<MeterPhotoGrid photos={[]} state="loading" />);
    expect(screen.getByText('Loading photos…')).toBeTruthy();
    rerender(<MeterPhotoGrid photos={[]} state="error" onRetry={retry} />);
    fireEvent.click(screen.getByText('Retry'));
    expect(retry).toHaveBeenCalledTimes(1);
    rerender(<MeterPhotoGrid photos={[]} state="done" />);
    expect(screen.getByText('No proof photos uploaded for this meter.')).toBeTruthy();
    rerender(<MeterPhotoGrid photos={[{ name: 'a.jpg', category: 'NEW_METER_DOCUMENT', url: 'https://x/a.jpg' }]} state="done" />);
    expect(screen.getByText('NEW METER DOCUMENT')).toBeTruthy();
  });
});

describe('BillingTab', () => {
  it('says so while loading and when there is no bill, and shows only what the billing system returned', () => {
    const { rerender } = render(<BillingTab bills={null} state="loading" onRetry={() => {}} />);
    expect(screen.getByText('Loading billing…')).toBeTruthy();
    rerender(<BillingTab bills={{ latestBill: null, slabs: [], unavailable: [] }} state="done" onRetry={() => {}} />);
    expect(screen.getByText('No bill has been generated for this household yet.')).toBeTruthy();
    expect(screen.getByText('No tariff is configured for this site.')).toBeTruthy();
    rerender(<BillingTab bills={{ latestBill: { amount: 120.5, status: 'pending', startDate: '2026-09-01', endDate: '2026-09-30' }, slabs: [{ minUnits: 0, maxUnits: 10, ratePerUnit: 5 }], unavailable: [] }} state="done" onRetry={() => {}} />);
    expect(screen.getByText('PENDING')).toBeTruthy();
    expect(screen.getByText('₹ 120.50')).toBeTruthy();
    expect(screen.queryByText('PAID')).toBeNull(); // nothing is assumed paid
  });
});

describe('HardwareTab', () => {
  it('shows dashes, never made-up radio values, when nothing is known', () => {
    render(<HardwareTab core={null} hardware={{ meter: null }} documents={{ photos: [], replacement: null, unavailable: [] }} hardwareState="done" documentsState="done" onRetry={() => {}} />);
    expect(screen.getByText('No meter is linked to this household.', { selector: 'p' })).toBeTruthy();
    expect(screen.getByText('No meter replacement is recorded for this household.')).toBeTruthy();
    expect(screen.queryByText(/865/)).toBeNull();
    expect(screen.queryByText(/-84/)).toBeNull();
  });
  it('shows the meter, its radio link and a retry when the photos failed', () => {
    const retry = vi.fn();
    const meter = { meterId: '0011223344', assetId: 1, siteId: 2, isActive: true, installedDate: null, ward: null, devEui: 'AA11', lastSeen: null, readingM3: 12.5, rssi: -99, snr: 4, gatewayId: 'gw1' };
    render(<HardwareTab core={{ consumer: {} as never, meters: [meter], primaryMeterId: meter.meterId, readings: [], yesterdayM3: null, monthToDateM3: null }} hardware={{ meter, lastFrame: { time: '2026-10-01T00:00:00Z', frequencyHz: 865200000, dataRate: 3, adr: true, fCnt: 9 } }} documents={null} hardwareState="done" documentsState="error" onRetry={retry} />);
    expect(screen.getAllByText('0011223344').length).toBeGreaterThan(0);
    expect(screen.getByText('-99 dBm')).toBeTruthy();
    expect(screen.getByText('865.2 MHz · DR3')).toBeTruthy();
    fireEvent.click(screen.getAllByText('Retry')[0]);
    expect(retry).toHaveBeenCalledWith('documents');
  });
});

describe('ReadingsTab', () => {
  it('does not pad missing days: with no readings it says why', () => {
    const { rerender } = render(<ReadingsTab readings={[]} loading={false} hasMeter={false} fileStem="x" />);
    expect(screen.getByText('No meter is linked to this household.')).toBeTruthy();
    rerender(<ReadingsTab readings={[]} loading={true} hasMeter={true} fileStem="x" />);
    expect(screen.getByText('Loading readings…')).toBeTruthy();
    rerender(<ReadingsTab readings={[{ date: '2026-10-02', shortDate: 'Oct 02', readingM3: 5, consumptionL: 300, consumptionM3: 0.3 }]} loading={false} hasMeter={true} fileStem="x" />);
    expect(screen.getAllByText('300 L').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.gis-bar-col').length).toBe(1);
  });
});
