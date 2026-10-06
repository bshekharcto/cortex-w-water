import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/empty-state/EmptyState';
import { ThresholdsProvider, WindowLabelProvider } from '../utils/thresholds';
import { describeError, isAbortError } from '../utils/errors';
import { validateCustomRange } from '../utils/customRange';
import { parseUrlState, buildUrlSearch } from '../utils/urlState';
import '../styles/commandCenter.css';

// Components
import { CommandCenterToolbar } from '../components/CommandCenterToolbar';
import { NetworkKpiStrip } from '../components/NetworkKpiStrip';
import { GatewayRail } from '../components/GatewayRail';
import { SelectedGatewayHeader } from '../components/SelectedGatewayHeader';
import { GatewayMetersTable } from '../components/GatewayMetersTable';
import { FleetMetersTable } from '../components/FleetMetersTable';
import { GatewayFramesPanel } from '../components/GatewayFramesPanel';
import { MeterFramesView } from '../components/MeterFramesView';
import { FrameDetailDrawer } from '../components/FrameDetailDrawer';
import { GatewayTrafficView } from '../components/GatewayTrafficView';
import { GatewayRadioHealth } from '../components/GatewayRadioHealth';
import { AllGatewayComparison } from '../components/AllGatewayComparison';
import { MeterInspector } from '../components/MeterInspector';
import { LiveNetworkFeed } from '../components/LiveNetworkFeed';

// Live API & Types
import {
  fetchCommandCenterSummary,
  fetchSites,
  fetchGatewayMeters,
  searchMeters,
  windowKey,
  WindowParams,
  getLocalCachedSummary,
  TelemetrySummaryResponse,
} from '@/services/api/commandCenterApi';
import {
  TimeWindow,
  MeterTelemetryItem,
  RawFrameItem,
  GatewayTabType,
} from '../types/commandCenter.types';

const AUTO_REFRESH_SECONDS = 45;
const REFRESH_POLL_MS = 4000;
const REFRESH_MAX_POLLS = 25; // ~100s; the background pull normally finishes in under a minute
const SEARCH_DEBOUNCE_MS = 350;
const OUT_OF_WINDOW_LOOKBACK: WindowParams = { days: 90 };

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const defaultCustomRange = () => ({
  from: isoDay(new Date(Date.now() - 6 * 86400000)),
  to: isoDay(new Date()),
});

function toWindowParams(range: TimeWindow, custom: { from: string; to: string }): WindowParams {
  switch (range) {
    case '1H': return { hours: 1 };
    case '6H': return { hours: 6 };
    case '24H': return { hours: 24 };
    case '30D': return { days: 30 };
    case 'CUSTOM': return { from: custom.from, to: custom.to };
    default: return { days: 7 };
  }
}

type SearchHint = { kind: 'idle' | 'searching' | 'info' | 'none' | 'error'; text?: string };

export function CommandCenterPage() {
  const location = useLocation();
  const routeParams = useParams();
  const navigate = useNavigate();

  // Restore what the operator was looking at from the URL (query string and /gateways/:id, /meters/:id)
  const initialRef = useRef<ReturnType<typeof parseUrlState> | null>(null);
  if (initialRef.current === null) {
    initialRef.current = parseUrlState(
      location.search,
      { gatewayId: routeParams.gatewayId, meterId: routeParams.meterId },
      defaultCustomRange()
    );
  }
  const init = initialRef.current;
  const pendingUrlMeter = useRef<string | null>(init.meter);

  const [activeMode, setActiveMode] = useState<'Gateways' | 'Meters'>(init.mode);
  const [timeRange, setTimeRange] = useState<TimeWindow>(init.window);
  const [customRange, setCustomRange] = useState({ from: init.from, to: init.to });

  // A custom range that can't be used is explained in the toolbar and never sent to the server:
  // the page keeps showing the last valid window until the dates are fixed.
  const rangeError = timeRange === 'CUSTOM' ? validateCustomRange(customRange) : null;
  const rawWin = useMemo(() => toWindowParams(timeRange, customRange), [timeRange, customRange]);
  const lastValidWin = useRef<WindowParams>(rawWin);
  if (!rangeError) lastValidWin.current = rawWin;
  const win = lastValidWin.current;
  const winKey = windowKey(win);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchHint, setSearchHint] = useState<SearchHint>({ kind: 'idle' });
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(init.gateway);
  const [gatewayTab, setGatewayTab] = useState<GatewayTabType>(init.tab);
  const [selectedMeter, setSelectedMeter] = useState<MeterTelemetryItem | null>(null);
  // True when the open meter was found by a 90-day look-back because it wasn't heard in the selected window
  const [meterOutsideWindow, setMeterOutsideWindow] = useState(false);
  // Meter whose full frame history is open in the centre workspace ("View all frames")
  const [framesViewMeter, setFramesViewMeter] = useState<MeterTelemetryItem | null>(null);
  // Frame whose full details are open in the side drawer
  const [inspectedFrame, setInspectedFrame] = useState<RawFrameItem | null>(null);
  // On narrow screens the gateway rail is a slide-over drawer
  const [railDrawerOpen, setRailDrawerOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(() => {
    try {
      return localStorage.getItem('cortex_w_cc_auto_refresh') !== 'off';
    } catch {
      return true;
    }
  });
  const handleAutoRefreshChange = (on: boolean) => {
    setAutoRefresh(on);
    try {
      localStorage.setItem('cortex_w_cc_auto_refresh', on ? 'on' : 'off');
    } catch {
      // storage unavailable; the toggle still works for this session
    }
  };

  // Dynamic Site Selector State
  const [selectedSiteId, setSelectedSiteId] = useState<string>(init.site);
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([
    { id: 'ALL', name: 'All Sites (Fleet)' },
  ]);

  // Load available sites from backend; refresh periodically and on tab focus so new sites appear
  useEffect(() => {
    const loadSites = () =>
      fetchSites()
        .then((res) => {
          if (res && res.length > 0) setSites(res);
        })
        .catch(() => {});
    loadSites();
    const id = setInterval(loadSites, 60000);
    window.addEventListener('focus', loadSites);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', loadSites);
    };
  }, []);

  // Live Summary State with 0ms Stale-While-Revalidate from LocalStorage Cache
  const [summaryData, setSummaryData] = useState<TelemetrySummaryResponse | null>(() =>
    getLocalCachedSummary(windowKey(toWindowParams(init.window, { from: init.from, to: init.to })), init.site)
  );
  const [isSyncing, setIsSyncing] = useState<boolean>(!summaryData);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [metersByGatewayMap, setMetersByGatewayMap] = useState<Record<string, MeterTelemetryItem[]>>({});
  const [metersLoading, setMetersLoading] = useState(false);
  const [metersError, setMetersError] = useState<string | null>(null);

  // Only the newest request may update the page (a slow earlier window/site must not overwrite it)
  const requestSeq = useRef(0);
  const summaryAbort = useRef<AbortController | null>(null);
  useEffect(() => () => summaryAbort.current?.abort(), []);
  const wasRefreshing = useRef(false);
  const pollCount = useRef(0);

  // Background fetch routine (windows are resolved on the server clock; nothing date-specific is sent)
  const loadSummary = useCallback(
    async (forceRefresh = false) => {
      const seq = ++requestSeq.current;
      summaryAbort.current?.abort(); // the request this one replaces is cancelled, not left running
      const ctrl = new AbortController();
      summaryAbort.current = ctrl;
      setIsSyncing(true);
      try {
        const live = await fetchCommandCenterSummary(win, forceRefresh, selectedSiteId, ctrl.signal);
        if (seq !== requestSeq.current) return;
        setSummaryData(live);
        setSyncError(null);
        // A manual Refresh just finished its background pull: per-gateway meter lists are now out of date
        if (wasRefreshing.current && !live.refreshing) setMetersByGatewayMap({});
        wasRefreshing.current = !!live.refreshing;
      } catch (err) {
        if (isAbortError(err) || seq !== requestSeq.current) return;
        console.warn('[CommandCenter] Live summary sync failed:', err);
        setSyncError(describeError(err, 'Telemetry service unavailable'));
      } finally {
        if (seq === requestSeq.current) setIsSyncing(false);
      }
    },
    [win, selectedSiteId]
  );

  // Window or site changed: drop the previous selection's data (show a recent local cache if we have one)
  const firstScope = useRef(true);
  useEffect(() => {
    setSummaryData(getLocalCachedSummary(winKey, selectedSiteId));
    setSyncError(null);
    if (firstScope.current) {
      firstScope.current = false; // keep a meter/gateway restored from the URL
      return;
    }
    setSelectedMeter(null);
    setMeterOutsideWindow(false);
    setFramesViewMeter(null);
    setInspectedFrame(null);
  }, [winKey, selectedSiteId]);

  // Sync on mount or when the window or site changes
  useEffect(() => {
    loadSummary(false);
  }, [loadSummary]);

  // Auto refresh: only while enabled and the tab is visible (no background polling of a hidden tab)
  useEffect(() => {
    const autoSync = autoRefresh
      ? setInterval(() => {
          if (!document.hidden) loadSummary(false);
        }, AUTO_REFRESH_SECONDS * 1000)
      : null;

    const onVisible = () => {
      if (autoRefresh && !document.hidden) loadSummary(false);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (autoSync) clearInterval(autoSync);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadSummary, autoRefresh]);

  // Manual Refresh answers instantly; while the server is still pulling fresh packets, keep checking
  useEffect(() => {
    if (!summaryData?.refreshing || pollCount.current >= REFRESH_MAX_POLLS) return;
    const t = setTimeout(() => {
      pollCount.current += 1;
      loadSummary(false);
    }, REFRESH_POLL_MS);
    return () => clearTimeout(t);
  }, [summaryData, loadSummary]);

  const handleManualRefresh = () => {
    pollCount.current = 0;
    loadSummary(true);
  };

  // Derived Gateways list
  const currentGateways = useMemo(() => {
    return summaryData?.gateways ?? [];
  }, [summaryData]);

  // Auto-select a gateway once on first load. After that, "no selection" is a deliberate choice (the
  // All Gateways overview) and must not be overridden; only a selection that no longer exists
  // (e.g. after switching site) falls back to the first gateway.
  const autoSelected = useRef(false);
  useEffect(() => {
    if (currentGateways.length === 0) return;
    const exists = (id: string | null) => !!id && currentGateways.some((g) => g.gatewayId === id);
    if (!autoSelected.current) {
      autoSelected.current = true;
      // honour a gateway from the URL if it is part of this view, otherwise start on the first one
      setSelectedGatewayId((prev) => (exists(prev) ? prev : currentGateways[0].gatewayId));
      return;
    }
    if (selectedGatewayId && !exists(selectedGatewayId)) {
      setSelectedGatewayId(currentGateways[0].gatewayId);
    }
  }, [currentGateways, selectedGatewayId]);

  const gatewayStatus = useMemo(
    () => Object.fromEntries(currentGateways.map((g) => [g.gatewayId, g.status])),
    [currentGateways]
  );

  // Derived KPIs
  const currentKpis = useMemo(() => {
    return summaryData?.kpis ?? null;
  }, [summaryData]);

  // Meters are loaded per gateway on selection (the summary no longer embeds ~10k meters)
  useEffect(() => {
    setMetersByGatewayMap({});
  }, [winKey, selectedSiteId]);

  useEffect(() => {
    if (!selectedGatewayId || metersByGatewayMap[selectedGatewayId]) return;
    const ctrl = new AbortController();
    setMetersLoading(true);
    setMetersError(null);
    fetchGatewayMeters(selectedGatewayId, win, ctrl.signal)
      .then((list) => setMetersByGatewayMap((prev) => ({ ...prev, [selectedGatewayId]: list })))
      .catch((err) => {
        if (isAbortError(err)) return;
        setMetersError(describeError(err, 'Failed to load meters'));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setMetersLoading(false);
      });
    return () => ctrl.abort();
  }, [selectedGatewayId, win, metersByGatewayMap]);

  // Derived Raw Frames for live feed and tables
  const allFrames = useMemo<RawFrameItem[]>(() => {
    return summaryData?.recentFrames ?? [];
  }, [summaryData]);

  // Currently selected gateway item
  const currentGateway = useMemo(() => {
    if (!selectedGatewayId) return null;
    return currentGateways.find((g) => g.gatewayId === selectedGatewayId) || null;
  }, [selectedGatewayId, currentGateways]);

  // Meters observed by selected gateway
  const currentMeters = useMemo(() => {
    if (!selectedGatewayId) return [];
    return metersByGatewayMap[selectedGatewayId] ?? [];
  }, [selectedGatewayId, metersByGatewayMap]);

  // Handle selecting a meter from table or feed
  const handleSelectMeter = (meter: MeterTelemetryItem) => {
    setMeterOutsideWindow(false);
    setSelectedMeter(meter);
  };

  const handleSelectMeterById = (meterId: string) => {
    for (const gwId of Object.keys(metersByGatewayMap)) {
      const found = metersByGatewayMap[gwId].find((m) => m.meterId === meterId);
      if (found) {
        handleSelectMeter(found);
        return;
      }
    }
    searchMeters(meterId, win)
      .then((hits) => {
        const hit = hits.find((h) => h.meter.meterId === meterId);
        if (hit) handleSelectMeter(hit.meter);
      })
      .catch(() => {});
  };

  // A meter id carried in the URL: open it once the page has loaded
  useEffect(() => {
    const id = pendingUrlMeter.current;
    if (!id || !summaryData) return;
    pendingUrlMeter.current = null;
    handleSelectMeterById(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryData]);

  // Keep the URL in step with the page (replace, so Back isn't flooded with every click)
  useEffect(() => {
    const search = buildUrlSearch({
      site: selectedSiteId,
      window: timeRange,
      from: customRange.from,
      to: customRange.to,
      gateway: selectedGatewayId,
      tab: gatewayTab,
      meter: selectedMeter?.meterId ?? pendingUrlMeter.current,
      mode: activeMode,
    });
    const target = '/app/command-center' + (search ? `?${search}` : '');
    if (target !== window.location.pathname + window.location.search) navigate(target, { replace: true });
  }, [selectedSiteId, timeRange, customRange, selectedGatewayId, gatewayTab, selectedMeter, activeMode, navigate]);

  // Global search: debounced, gateway first, then meter / DevEUI (server-side), with a 90-day look-back
  // for meters that weren't heard in the selected window. Reads the latest page state through refs so a
  // background refresh never re-runs the search and steals the selection.
  const searchCtx = useRef({ gateways: currentGateways, win });
  searchCtx.current = { gateways: currentGateways, win };
  const searchSeq = useRef(0);
  useEffect(() => {
    const q = searchQuery.trim();
    const seq = ++searchSeq.current;
    const ctrl = new AbortController();
    if (!q) {
      setSearchHint({ kind: 'idle' });
      return;
    }
    const lower = q.toLowerCase();
    const timer = setTimeout(async () => {
      const { gateways, win: searchWin } = searchCtx.current;
      const gw = gateways.find((g) => g.alias.toLowerCase().includes(lower) || g.gatewayId.toLowerCase().includes(lower));
      if (gw) {
        setSearchHint({ kind: 'idle' });
        setActiveMode('Gateways');
        setSelectedGatewayId(gw.gatewayId);
        setGatewayTab('METERS');
        return;
      }
      if (q.length < 3) {
        setSearchHint({ kind: 'info', text: 'No gateway matches. Type at least 3 characters to search meters.' });
        return;
      }
      setSearchHint({ kind: 'searching', text: 'Searching meters…' });
      try {
        let hits = await searchMeters(q, searchWin, ctrl.signal);
        if (seq !== searchSeq.current) return;
        if (hits.length > 0) {
          setSearchHint({ kind: 'idle' });
          setActiveMode('Gateways');
          setSelectedGatewayId(hits[0].gatewayId);
          setMeterOutsideWindow(false);
          setSelectedMeter(hits[0].meter);
          setGatewayTab('METERS');
          return;
        }
        hits = await searchMeters(q, OUT_OF_WINDOW_LOOKBACK, ctrl.signal);
        if (seq !== searchSeq.current) return;
        if (hits.length > 0) {
          setSearchHint({ kind: 'info', text: `Found outside the selected window (looked back 90 days).` });
          setMeterOutsideWindow(true);
          setSelectedMeter(hits[0].meter);
          return;
        }
        setSearchHint({ kind: 'none', text: `No gateway, meter or DevEUI matches “${q}”.` });
      } catch (err) {
        if (isAbortError(err)) return;
        if (seq === searchSeq.current) setSearchHint({ kind: 'error', text: describeError(err, 'Search failed') });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort(); // typing on cancels the previous lookup
    };
  }, [searchQuery]);

  // Escape peels back one layer at a time: frame details, then the rail drawer, then the full-frames view, then the inspector
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (inspectedFrame) setInspectedFrame(null);
      else if (railDrawerOpen) setRailDrawerOpen(false);
      else if (framesViewMeter) setFramesViewMeter(null);
      else if (selectedMeter) {
        setSelectedMeter(null);
        setMeterOutsideWindow(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [inspectedFrame, railDrawerOpen, framesViewMeter, selectedMeter]);

  const windowLabel = timeRange === 'CUSTOM' ? 'custom range' : timeRange;

  return (
    <ThresholdsProvider value={summaryData?.thresholds ?? null}>
    <WindowLabelProvider value={windowLabel}>
    <div className="cc-container">
      {/* Top Command Bar with Live Stream Sync Status */}
      <CommandCenterToolbar
        activeTab={activeMode}
        onTabChange={setActiveMode}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchHint={searchHint.kind === 'idle' ? null : searchHint}
        rangeError={rangeError}
        onRefresh={handleManualRefresh}
        lastUpdatedAt={summaryData?.generatedAt ?? null}
        isSyncing={isSyncing || !!summaryData?.refreshing}
        sites={sites}
        selectedSiteId={selectedSiteId}
        onSiteChange={setSelectedSiteId}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={handleAutoRefreshChange}
        autoRefreshSeconds={AUTO_REFRESH_SECONDS}
        onToggleRail={() => setRailDrawerOpen((o) => !o)}
      />

      {syncError && (
        <div className="cc-card cc-banner" role="alert">
          <AlertTriangle size={16} />
          <span>
            {summaryData
              ? `Could not refresh telemetry (${syncError}). Showing the last data received.`
              : `Could not load telemetry (${syncError}).`}
          </span>
          <button className="cw-button-secondary" onClick={handleManualRefresh}>
            Retry
          </button>
        </div>
      )}

      {/* Network Health 8-KPI Strip with Skeleton Loaders */}
      <NetworkKpiStrip
        kpis={currentKpis}
        loading={isSyncing && !summaryData}
      />

      {/* Main Operational Workspace */}
      <div
        className={`cc-main-workspace-layout ${
          selectedMeter ? 'cc-main-workspace-layout--with-inspector' : ''
        }`}
      >
        {/* Dimmed backdrops behind the slide-over drawers (only visible on narrow screens) */}
        <div className={`cc-drawer-backdrop ${railDrawerOpen ? 'cc-drawer-backdrop--open' : ''}`} onClick={() => setRailDrawerOpen(false)} aria-hidden="true" />
        {selectedMeter && (
          <div
            className="cc-drawer-backdrop cc-drawer-backdrop--inspector"
            onClick={() => {
              setSelectedMeter(null);
              setMeterOutsideWindow(false);
            }}
            aria-hidden="true"
          />
        )}

        {/* Left Navigator: Gateway Rail with Live Status */}
        <GatewayRail
          gateways={currentGateways}
          // In Meters mode no gateway is "current", so clicking one always opens it (never toggles it off)
          selectedGatewayId={activeMode === 'Meters' ? null : selectedGatewayId}
          loading={isSyncing && !summaryData}
          drawerOpen={railDrawerOpen}
          onCloseDrawer={() => setRailDrawerOpen(false)}
          onSelectGateway={(id) => {
            setRailDrawerOpen(false);
            setActiveMode('Gateways');
            setSelectedGatewayId(id);
            if (id) {
              setGatewayTab('METERS');
            }
          }}
        />

        {/* Center: Selected Gateway Workspace OR All-Gateway Overview */}
        <main className="cc-center-workspace">
          {framesViewMeter ? (
            <MeterFramesView meter={framesViewMeter} win={win} onBack={() => setFramesViewMeter(null)} onInspectFrame={setInspectedFrame} />
          ) : activeMode === 'Meters' ? (
            <FleetMetersTable
              win={win}
              siteId={selectedSiteId}
              selectedMeterId={selectedMeter?.meterId || null}
              onSelectMeter={handleSelectMeter}
              expectedTotal={currentKpis?.uniqueMetersSeen ?? null}
            />
          ) : currentGateway ? (
            <>
              <SelectedGatewayHeader
                gateway={currentGateway}
                activeTab={gatewayTab}
                onTabChange={setGatewayTab}
                onClearSelection={() => setSelectedGatewayId(null)}
              />

              {gatewayTab === 'METERS' && (
                <GatewayMetersTable
                  loading={metersLoading && !metersByGatewayMap[currentGateway.gatewayId]}
                  error={metersError}
                  meters={currentMeters}
                  selectedMeterId={selectedMeter?.meterId || null}
                  onSelectMeter={handleSelectMeter}
                  expectedMeters={currentGateway.uniqueMeters}
                />
              )}

              {gatewayTab === 'FRAMES' && (
                <GatewayFramesPanel
                  gatewayId={currentGateway.gatewayId}
                  gatewayAlias={currentGateway.alias}
                  win={win}
                  refreshToken={summaryData?.generatedAt}
                  onSelectFrameMeter={handleSelectMeterById}
                  onInspectFrame={setInspectedFrame}
                  paused={!!inspectedFrame}
                />
              )}

              {gatewayTab === 'TRAFFIC' && (
                <GatewayTrafficView
                  win={win}
                  siteId={selectedSiteId}
                  gateway={{ gatewayId: currentGateway.gatewayId, alias: currentGateway.alias }}
                  allGateways={currentGateways}
                  refreshToken={summaryData?.generatedAt}
                />
              )}

              {gatewayTab === 'RADIO' && (
                <GatewayRadioHealth
                  win={win}
                  siteId={selectedSiteId}
                  gateway={{ gatewayId: currentGateway.gatewayId, alias: currentGateway.alias }}
                  refreshToken={summaryData?.generatedAt}
                  onSelectMeter={handleSelectMeterById}
                />
              )}
            </>
          ) : currentGateways.length === 0 ? (
            <EmptyState
              message={
                isSyncing
                  ? 'Loading gateways…'
                  : 'No gateway traffic has been observed for this site and time window.'
              }
            />
          ) : (
            <AllGatewayComparison
              gateways={currentGateways}
              onSelectGateway={(id) => {
                setSelectedGatewayId(id);
                setGatewayTab('METERS');
              }}
            />
          )}
        </main>

        {/* Right Inspector: Latest Meter Info (Telemetry Packet Inspector) */}
        {selectedMeter && (
          <MeterInspector
            meter={selectedMeter}
            win={win}
            outsideWindow={meterOutsideWindow}
            onViewAllFrames={() => setFramesViewMeter(selectedMeter)}
            onClose={() => {
              setSelectedMeter(null);
              setMeterOutsideWindow(false);
            }}
          />
        )}
      </div>

      {/* Bottom: Live Network Telemetry Feed */}
      <LiveNetworkFeed
        frames={allFrames}
        onSelectMeter={handleSelectMeterById}
        meterCount={currentKpis?.uniqueMetersSeen ?? null}
        gatewayStatus={gatewayStatus}
        win={win}
        siteId={selectedSiteId}
        onInspectFrame={setInspectedFrame}
      />

      {inspectedFrame && (
        <FrameDetailDrawer frame={inspectedFrame} onClose={() => setInspectedFrame(null)} onOpenMeter={handleSelectMeterById} />
      )}
    </div>
    </WindowLabelProvider>
    </ThresholdsProvider>
  );
}

export default CommandCenterPage;
