import type { GatewayTabType, TimeWindow } from '../types/commandCenter.types';
import { validateCustomRange } from './customRange';

/** Everything that defines "what the operator is looking at", so an investigation can be shared or refreshed. */
export interface CcUrlState {
  site: string;
  window: TimeWindow;
  from: string;
  to: string;
  gateway: string | null;
  tab: GatewayTabType;
  meter: string | null;
  mode: 'Gateways' | 'Meters';
}

const WINDOWS: TimeWindow[] = ['1H', '6H', '24H', '7D', '30D', 'CUSTOM'];
const TAB_TO_PARAM: Record<GatewayTabType, string> = { METERS: 'meters', FRAMES: 'frames', TRAFFIC: 'traffic', RADIO: 'radio' };
const PARAM_TO_TAB = Object.fromEntries(Object.entries(TAB_TO_PARAM).map(([k, v]) => [v, k])) as Record<string, GatewayTabType>;
const ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;

export const DEFAULT_URL_STATE: Omit<CcUrlState, 'from' | 'to'> = {
  site: 'ALL',
  window: '7D',
  gateway: null,
  tab: 'METERS',
  meter: null,
  mode: 'Gateways',
};

/**
 * Reads the page state from the query string (and the legacy path params /gateways/:id, /meters/:id,
 * which win when present). Anything missing or malformed falls back to the default, never throws.
 */
export function parseUrlState(
  search: string,
  pathParams: { gatewayId?: string; meterId?: string },
  defaultRange: { from: string; to: string }
): CcUrlState {
  const q = new URLSearchParams(search);
  const id = (v: string | null | undefined) => (v && ID_RE.test(v) ? v : null);

  const win = (q.get('window') ?? '').toUpperCase() as TimeWindow;
  let window: TimeWindow = WINDOWS.includes(win) ? win : DEFAULT_URL_STATE.window;
  let from = q.get('from') ?? defaultRange.from;
  let to = q.get('to') ?? defaultRange.to;
  if (window === 'CUSTOM' && validateCustomRange({ from, to })) {
    // A shared link with a bad custom range must not open on an error state
    from = defaultRange.from;
    to = defaultRange.to;
  }
  if (window !== 'CUSTOM') {
    from = defaultRange.from;
    to = defaultRange.to;
  }

  const site = q.get('site');
  return {
    site: site === 'ALL' || (site && /^\d{1,12}$/.test(site)) ? site : DEFAULT_URL_STATE.site,
    window,
    from,
    to,
    gateway: id(pathParams.gatewayId) ?? id(q.get('gateway')),
    tab: PARAM_TO_TAB[(q.get('tab') ?? '').toLowerCase()] ?? DEFAULT_URL_STATE.tab,
    meter: id(pathParams.meterId) ?? id(q.get('meter')),
    mode: q.get('mode') === 'meters' ? 'Meters' : 'Gateways',
  };
}

/** Serialises the state, leaving out anything that is the default so URLs stay short. */
export function buildUrlSearch(state: CcUrlState): string {
  const q = new URLSearchParams();
  if (state.site !== DEFAULT_URL_STATE.site) q.set('site', state.site);
  if (state.window !== DEFAULT_URL_STATE.window) q.set('window', state.window);
  if (state.window === 'CUSTOM') {
    q.set('from', state.from);
    q.set('to', state.to);
  }
  if (state.mode === 'Meters') q.set('mode', 'meters');
  if (state.gateway) q.set('gateway', state.gateway);
  if (state.tab !== DEFAULT_URL_STATE.tab) q.set('tab', TAB_TO_PARAM[state.tab]);
  if (state.meter) q.set('meter', state.meter);
  return q.toString();
}
