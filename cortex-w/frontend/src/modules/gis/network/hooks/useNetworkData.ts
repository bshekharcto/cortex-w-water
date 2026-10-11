import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  networkApi,
  type CoordinatesStatus,
  type NetGateway,
  type NetMeterMapResponse,
  type NetUnplacedGateway,
} from '@/services/api/networkApi';
import { decodeMeterRows, type MeterPoint } from '../networkModel';
import { loadSnapshot, saveSnapshot } from '../networkCache';

const REFRESH_MS = 5 * 60 * 1000;

export interface NetworkData {
  gateways: NetGateway[];
  unplaced: NetUnplacedGateway[];
  points: MeterPoint[];
  summary: NetMeterMapResponse['summary'] | null;
  coordinates: { status: CoordinatesStatus; fetchedAt: string | null } | null;
  /** The gateways / the meter map of the current selection have arrived (or were restored from the saved copy). */
  gatewaysReady: boolean;
  metersReady: boolean;
  /** Which selection the data on screen belongs to (null until something is loaded or restored). */
  loadedSiteId: string | null;
  /** The newest frame among the meters in view: "data as of". */
  latestFrameAt: string | null;
  /** Nothing has been loaded or restored yet. */
  isLoading: boolean;
  /** A saved copy is on screen and fresh data is on its way (or failed to arrive). */
  isShowingSavedCopy: boolean;
  gatewaysError: string | null;
  metersError: string | null;
  reload: () => void;
}

const message = (e: unknown, what: string) => {
  const m = (e as { operatorMessage?: string; message?: string } | null) ?? {};
  return m.operatorMessage || m.message || `Could not load ${what}.`;
};

/**
 * Gateways and the meter map for one site selection ("ALL" or a site id), kept fresh in the background.
 * A saved copy of the last visit (for this user only) is shown first so the page is never empty while loading; the
 * two requests are independent, so a failure in one does not hide the other.
 */
export function useNetworkData(siteId: string): NetworkData {
  const [gw, setGw] = useState<{ gateways: NetGateway[]; unplaced: NetUnplacedGateway[] } | null>(null);
  const [map, setMap] = useState<NetMeterMapResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isShowingSavedCopy, setIsShowingSavedCopy] = useState(false);
  const [gatewaysError, setGatewaysError] = useState<string | null>(null);
  const [metersError, setMetersError] = useState<string | null>(null);
  const [loadedSiteId, setLoadedSiteId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const siteRef = useRef(siteId);

  const load = useCallback(async (site: string, signal: AbortSignal, first: boolean) => {
    const [g, m] = await Promise.allSettled([
      networkApi.getGateways(site, signal),
      networkApi.getMeterMap(site, signal),
    ]);
    if (signal.aborted || siteRef.current !== site) return;

    if (g.status === 'fulfilled' || m.status === 'fulfilled') setLoadedSiteId(site);
    if (g.status === 'fulfilled') {
      setGw(g.value);
      setGatewaysError(null);
    } else setGatewaysError(message(g.reason, 'gateways'));
    if (m.status === 'fulfilled') {
      setMap(m.value);
      setMetersError(null);
    } else setMetersError(message(m.reason, 'meters'));

    if (g.status === 'fulfilled' && m.status === 'fulfilled') {
      setIsShowingSavedCopy(false);
      void saveSnapshot(site, g.value, m.value);
    }
    if (first) setIsLoading(false);
  }, []);

  // New selection: show the saved copy (if this user has one), then load fresh data.
  useEffect(() => {
    siteRef.current = siteId;
    const ctl = new AbortController();
    setIsLoading(true);
    setLoadedSiteId(null);
    setGw(null);
    setMap(null);
    setGatewaysError(null);
    setMetersError(null);
    setIsShowingSavedCopy(false);

    let restored = false;
    loadSnapshot(siteId).then((snap) => {
      if (!snap || ctl.signal.aborted) return;
      restored = true;
      setLoadedSiteId(siteId);
      setGw({ gateways: snap.gateways.gateways, unplaced: snap.gateways.unplaced });
      setMap(snap.map);
      setIsShowingSavedCopy(true);
      setIsLoading(false);
    });
    load(siteId, ctl.signal, true).finally(() => {
      // a request that was cancelled (new selection, or React re-running the effect) must not end the loading state
      // of the one that replaced it
      if (!restored && !ctl.signal.aborted && siteRef.current === siteId) setIsLoading(false);
    });
    return () => ctl.abort();
  }, [siteId, load, tick]);

  // Quiet refresh while the tab is visible. The browser revalidates with the server's ETag, so an unchanged
  // answer costs almost nothing.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const ctl = new AbortController();
      void load(siteRef.current, ctl.signal, false);
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const points = useMemo(() => (map ? decodeMeterRows(map) : []), [map]);

  return {
    gateways: gw?.gateways ?? [],
    unplaced: gw?.unplaced ?? [],
    points,
    summary: map?.summary ?? null,
    coordinates: map?.coordinates ?? null,
    latestFrameAt: map?.latestFrameAt ?? null,
    gatewaysReady: gw !== null,
    metersReady: map !== null,
    loadedSiteId,
    isLoading,
    isShowingSavedCopy,
    gatewaysError,
    metersError,
    reload: () => setTick((t) => t + 1),
  };
}
