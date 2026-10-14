import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  networkApi,
  type CoordinatesStatus,
  type NetGateway,
  type NetGatewaysResponse,
  type NetMeterMapResponse,
  type NetSiteOption,
  type NetUnplacedGateway,
} from '@/services/api/networkApi';
import { decodeMeterRows, type MeterPoint } from '../networkModel';
import { deriveSiteView, siteWithDescendants } from '../networkScope';
import { DEFAULT_THRESHOLDS } from '@/modules/command-center/utils/thresholds';
import { loadSnapshot, saveSnapshot } from '../networkCache';
import { isUnauthorized } from '../../shared/meterDetailModel';

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
  /** The sign-in is over (401): the page should go to the login screen. */
  sessionExpired: boolean;
  reload: () => void;
}

const message = (e: unknown, what: string) => {
  const m = (e as { operatorMessage?: string; message?: string } | null) ?? {};
  return m.operatorMessage || m.message || `Could not load ${what}.`;
};

/** What was loaded for "ALL" (every site of the user): the base that any single site is worked out from. */
interface AllBase {
  gateways: NetGatewaysResponse;
  map: NetMeterMapResponse;
  points: MeterPoint[];
}

/**
 * Gateways and the meter map for one site selection ("ALL" or a site id), kept fresh in the background.
 * A saved copy of the last visit (for this user only) is shown first so the page is never empty while loading; the
 * two requests are independent, so a failure in one does not hide the other.
 *
 * Once "ALL" has been loaded, choosing a single site asks the server for nothing: the site's meters, gateways and totals
 * are worked out from what is already here (see networkScope.ts), so the map just filters. Only a site picked before
 * "ALL" was ever loaded is fetched.
 */
export function useNetworkData(siteId: string, sites: ReadonlyArray<Pick<NetSiteOption, 'id' | 'parentId'>> = []): NetworkData {
  const [gw, setGw] = useState<{ gateways: NetGateway[]; unplaced: NetUnplacedGateway[] } | null>(null);
  const [map, setMap] = useState<NetMeterMapResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isShowingSavedCopy, setIsShowingSavedCopy] = useState(false);
  const [gatewaysError, setGatewaysError] = useState<string | null>(null);
  const [metersError, setMetersError] = useState<string | null>(null);
  const [loadedSiteId, setLoadedSiteId] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [tick, setTick] = useState(0);
  const [allBase, setAllBase] = useState<AllBase | null>(null);
  const [derivedSite, setDerivedSite] = useState<string | null>(null); // the site being worked out locally, null when fetched
  const siteRef = useRef(siteId);
  const allBaseRef = useRef<AllBase | null>(null);
  allBaseRef.current = allBase;
  const sitesRef = useRef(sites);
  sitesRef.current = sites;
  const derivedRef = useRef(false);

  const load = useCallback(async (site: string, signal: AbortSignal, first: boolean) => {
    const [g, m] = await Promise.allSettled([
      networkApi.getGateways(site, signal),
      networkApi.getMeterMap(site, signal),
    ]);
    if (signal.aborted) return;
    const current = siteRef.current === site;

    if ((g.status === 'rejected' && isUnauthorized(g.reason)) || (m.status === 'rejected' && isUnauthorized(m.reason))) setSessionExpired(true);
    if (site === 'ALL' && g.status === 'fulfilled' && m.status === 'fulfilled') {
      setAllBase({ gateways: g.value, map: m.value, points: decodeMeterRows(m.value) });
    }
    if (!current) return; // a background refresh of "ALL" while a site is worked out from it: only the base changes
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

    // "ALL" is already here: a single site needs no request, only a refresh of "ALL" when the user asked to reload
    if (siteId !== 'ALL' && allBaseRef.current && sitesRef.current.some((x) => x.id === siteId)) {
      derivedRef.current = true;
      setDerivedSite(siteId);
      setLoadedSiteId(siteId);
      setGatewaysError(null);
      setMetersError(null);
      setIsShowingSavedCopy(false);
      setIsLoading(false);
      if (tick > 0) void load('ALL', ctl.signal, false);
      return () => ctl.abort();
    }
    derivedRef.current = false;
    setDerivedSite(null);
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
      if (siteId === 'ALL') setAllBase({ gateways: snap.gateways, map: snap.map, points: decodeMeterRows(snap.map) });
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
      void load(derivedRef.current ? 'ALL' : siteRef.current, ctl.signal, false);
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const fetchedPoints = useMemo(() => (map ? decodeMeterRows(map) : []), [map]);

  // a single site worked out from "ALL" (no request)
  const view = useMemo(
    () =>
      derivedSite === siteId && allBase
        ? deriveSiteView(allBase, siteWithDescendants(sites, siteId), {
            degradedRssi: DEFAULT_THRESHOLDS.avgRssiDegradedDbm,
            degradedSnr: DEFAULT_THRESHOLDS.avgSnrDegradedDb,
          })
        : null,
    [derivedSite, siteId, allBase, sites]
  );

  return {
    gateways: view ? view.gateways : gw?.gateways ?? [],
    unplaced: view ? view.unplaced : gw?.unplaced ?? [],
    points: view ? view.points : fetchedPoints,
    summary: view ? view.summary : map?.summary ?? null,
    coordinates: view ? allBase!.map.coordinates : map?.coordinates ?? null,
    latestFrameAt: view ? allBase!.map.latestFrameAt : map?.latestFrameAt ?? null,
    gatewaysReady: view ? true : gw !== null,
    metersReady: view ? true : map !== null,
    loadedSiteId,
    isLoading,
    isShowingSavedCopy,
    gatewaysError,
    metersError,
    sessionExpired,
    reload: () => setTick((t) => t + 1),
  };
}
