import type { GatewayItem, MeterTelemetryItem, RawFrameItem } from '../types/commandCenter.types';

export const NOW_ISO = new Date().toISOString();

export const frame = (id: string, over: Partial<RawFrameItem> = {}): RawFrameItem => ({
  id,
  decodedAt: NOW_ISO,
  meterTimestamp: NOW_ISO,
  meterId: `meter-${id}`,
  devEui: null,
  gatewayId: 'gw-a',
  gatewayAlias: 'GW-AAAA',
  fCnt: 1,
  fPort: 12,
  frequency: 865062500,
  dr: 5,
  rssi: -80,
  snr: 5,
  confirmed: false,
  adr: false,
  checksumStatus: 'OK',
  statusByte: 0,
  statusEvent: 'FRAME_RECEIVED',
  ...over,
});

export const meter = (meterId: string, over: Partial<MeterTelemetryItem> = {}): MeterTelemetryItem => ({
  meterId,
  devEui: null,
  lastSeenDate: NOW_ISO,
  frames1H: 1,
  frames24H: 1,
  lastRssi: -80,
  lastSnr: 5,
  fCnt: 1,
  fPort: 12,
  frequency: 865062500,
  dr: 5,
  adr: false,
  confirmed: false,
  otherGatewaysCount: 0,
  statusChips: ['live'],
  diagnostics: [],
  gatewaysHeard: [{ gatewayId: 'gw-a', alias: 'GW-AAAA', rssi: -80, snr: 5, lastSeenAt: NOW_ISO, isLatest: true }],
  ...over,
});

export const gateway = (gatewayId: string, alias: string, over: Partial<GatewayItem> = {}): GatewayItem => ({
  gatewayId,
  alias,
  uniqueMeters: 1,
  frameCount: 1,
  lastFrameDecodedAt: NOW_ISO,
  avgRssi: -80,
  avgSnr: 5,
  trendPct: null,
  status: 'reporting',
  ...over,
});

/** jsdom has no ResizeObserver; the virtual-row hook needs one. */
export function stubResizeObserver() {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = () => {}; // not implemented by jsdom
}

/** A plain in-memory Storage (newer Node ships its own experimental localStorage that shadows jsdom's). */
export function stubLocalStorage() {
  const data = new Map<string, string>();
  const storage = {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  return storage;
}
