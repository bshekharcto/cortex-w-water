import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/empty-state/EmptyState';
import { ThresholdsProvider, WindowLabelProvider } from '../utils/thresholds';
import '../styles/commandCenter.css';

// Components
import { CommandCenterToolbar } from '../components/CommandCenterToolbar';
import { NetworkKpiStrip } from '../components/NetworkKpiStrip';
import { GatewayRail } from '../components/GatewayRail';
import { SelectedGatewayHeader } from '../components/SelectedGatewayHeader';
import { GatewayMetersTable } from '../components/GatewayMetersTable';
import { FleetMetersTable } from '../components/FleetMetersTable';
import { GatewayFramesTable } from '../components/GatewayFramesTable';
import { GatewayTrafficChart } from '../components/GatewayTrafficChart';
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
  GatewayTabType,
  TimeWindow,
  MeterTelemetryItem,
  RawFrameItem,
} from '../types/commandCenter.types';

const AUTO_REFRESH_SECONDS = 45;

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

export function CommandCenterPage() {
  const [activeMode, setActiveMode] = useState<'Gateways' | 'Meters'>('Gateways');
  const [timeRange, setTimeRange] = useState<TimeWindow>('7D');
  const [customRange, setCustomRange] = useState(defaultCustomRange);
  const win = useMemo(() => toWindowParams(timeRange, customRange), [timeRange, customRange]);
  const winKey = windowKey(win);
  const customValid = timeRange !== 'CUSTOM' || (!!customRange.from && !!customRange.to && customRange.from <= customRange.to);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(null);
  const [gatewayTab, setGatewayTab] = useState<GatewayTabType>('METERS');
  const [selectedMeter, setSelectedMeter] = useState<MeterTelemetryItem | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
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
  const [selectedSiteId, setSelectedSiteId] = useState<string>('ALL');
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
  const [summaryData, setSummaryData] = useState<TelemetrySummaryResponse | null>(() => {
    return getLocalCachedSummary('d7', 'ALL');
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(!summaryData);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [metersByGatewayMap, setMetersByGatewayMap] = useState<Record<string, MeterTelemetryItem[]>>({});
  const [metersLoading, setMetersLoading] = useState(false);
  const [metersError, setMetersError] = useState<string | null>(null);

  // Only the newest request may update the page (a slow earlier window/site must not overwrite it)
  const requestSeq = useRef(0);

  // Background fetch routine (windows are resolved on the server clock; nothing date-specific is sent)
  const loadSummary = useCallback(async (forceRefresh = false) => {
    if (!customValid) return;
    const seq = ++requestSeq.current;
    setIsSyncing(true);
    try {
      const live = await fetchCommandCenterSummary(win, forceRefresh, selectedSiteId);
      if (seq !== requestSeq.current) return;
      setSummaryData(live);
      setSyncError(null);
      setSecondsAgo(0);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      console.warn('[CommandCenter] Live summary sync failed:', err);
      setSyncError(err instanceof Error ? err.message : 'Telemetry service unavailable');
    } finally {
      if (seq === requestSeq.current) setIsSyncing(false);
    }
  }, [win, selectedSiteId, customValid]);

  // Window or site changed: drop the previous selection's data (show a recent local cache if we have one)
  useEffect(() => {
    setSummaryData(getLocalCachedSummary(winKey, selectedSiteId));
    setSyncError(null);
    setSelectedMeter(null);
  }, [winKey, selectedSiteId]);

  // Sync on mount or when the window or site changes
  useEffect(() => {
    loadSummary(false);
  }, [loadSummary]);

  // Periodic background refresh (every 45s) and elapsed timer ticker
  useEffect(() => {
    const ticker = setInterval(() => {
      setSecondsAgo((prev) => prev + 1);
    }, 1000);

    // Auto refresh: only while enabled and the tab is visible (no background polling of a hidden tab)
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
      clearInterval(ticker);
      if (autoSync) clearInterval(autoSync);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadSummary, autoRefresh]);

  const handleManualRefresh = () => {
    loadSummary(true);
  };

  // Derived Gateways list
  const currentGateways = useMemo(() => {
    return summaryData?.gateways ?? [];
  }, [summaryData]);

  // Ensure an active gateway is selected once gateways are known
  // Auto-select a gateway once on first load. After that, "no selection" is a deliberate choice (the
  // All Gateways overview) and must not be overridden; only a selection that no longer exists
  // (e.g. after switching site) falls back to the first gateway.
  const autoSelected = useRef(false);
  useEffect(() => {
    if (currentGateways.length === 0) return;
    if (!autoSelected.current) {
      autoSelected.current = true;
      setSelectedGatewayId((prev) => prev ?? currentGateways[0].gatewayId);
      return;
    }
    if (selectedGatewayId && !currentGateways.some((g) => g.gatewayId === selectedGatewayId)) {
      setSelectedGatewayId(currentGateways[0].gatewayId);
    }
  }, [currentGateways, selectedGatewayId]);

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
    let cancelled = false;
    setMetersLoading(true);
    setMetersError(null);
    fetchGatewayMeters(selectedGatewayId, win)
      .then((list) => {
        if (!cancelled) setMetersByGatewayMap((prev) => ({ ...prev, [selectedGatewayId]: list }));
      })
      .catch((err) => {
        if (!cancelled) setMetersError(err instanceof Error ? err.message : 'Failed to load meters');
      })
      .finally(() => {
        if (!cancelled) setMetersLoading(false);
      });
    return () => {
      cancelled = true;
    };
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

  // Frames received by selected gateway
  const currentFrames = useMemo(() => {
    if (!selectedGatewayId) return allFrames;
    return allFrames.filter((f) => f.gatewayId === selectedGatewayId);
  }, [selectedGatewayId, allFrames]);

  // Handle selecting a meter from table or feed
  const handleSelectMeter = (meter: MeterTelemetryItem) => {
    setSelectedMeter(meter);
  };

  const handleSelectMeterById = (meterId: string) => {
    for (const gwId of Object.keys(metersByGatewayMap)) {
      const found = metersByGatewayMap[gwId].find((m) => m.meterId === meterId);
      if (found) {
        setSelectedMeter(found);
        return;
      }
    }
    searchMeters(meterId, win)
      .then((hits) => {
        const hit = hits.find((h) => h.meter.meterId === meterId);
        if (hit) setSelectedMeter(hit.meter);
      })
      .catch(() => {});
  };

  // Global search handler
  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (!q) return;
    const query = q.toLowerCase();
    // Check gateway alias or id
    const gw = currentGateways.find(
      (g) => g.alias.toLowerCase().includes(query) || g.gatewayId.toLowerCase().includes(query)
    );
    if (gw) {
      setActiveMode('Gateways');
      setSelectedGatewayId(gw.gatewayId);
      setGatewayTab('METERS');
      return;
    }
    // Meter ID / DevEUI lookup (server-side; meters aren't preloaded)
    if (q.length >= 3) {
      searchMeters(q, win)
        .then((hits) => {
          if (hits.length === 0) return;
          setActiveMode('Gateways');
          setSelectedGatewayId(hits[0].gatewayId);
          setSelectedMeter(hits[0].meter);
          setGatewayTab('METERS');
        })
        .catch(() => {});
    }
  };

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
        onSearchChange={handleSearch}
        onRefresh={handleManualRefresh}
        lastUpdatedText={`${secondsAgo}s ago`}
        isSyncing={isSyncing}
        sites={sites}
        selectedSiteId={selectedSiteId}
        onSiteChange={setSelectedSiteId}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={handleAutoRefreshChange}
        autoRefreshSeconds={AUTO_REFRESH_SECONDS}
      />

      {syncError && (
        <div className="cc-card" role="alert" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', color: '#B45309' }}>
          <AlertTriangle size={16} />
          <span>
            {summaryData
              ? `Could not refresh telemetry (${syncError}). Showing the last data received.`
              : `Could not load telemetry (${syncError}).`}
          </span>
          <button className="cw-button-secondary" onClick={handleManualRefresh} style={{ marginLeft: 'auto' }}>
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
        {/* Left Navigator: Gateway Rail with Live Status */}
        <GatewayRail
          gateways={currentGateways}
          // In Meters mode no gateway is "current", so clicking one always opens it (never toggles it off)
          selectedGatewayId={activeMode === 'Meters' ? null : selectedGatewayId}
          loading={isSyncing && !summaryData}
          onSelectGateway={(id) => {
            setActiveMode('Gateways');
            setSelectedGatewayId(id);
            if (id) {
              setGatewayTab('METERS');
            }
          }}
        />

        {/* Center: Selected Gateway Workspace OR All-Gateway Overview */}
        <main className="cc-center-workspace">
          {activeMode === 'Meters' ? (
            <FleetMetersTable
              win={win}
              siteId={selectedSiteId}
              selectedMeterId={selectedMeter?.meterId || null}
              onSelectMeter={handleSelectMeter}
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
                />
              )}

              {gatewayTab === 'FRAMES' && (
                <GatewayFramesTable
                  frames={currentFrames}
                  gatewayAlias={currentGateway.alias}
                  onSelectFrameMeter={handleSelectMeterById}
                />
              )}

              {gatewayTab === 'TRAFFIC' && (
                <GatewayTrafficChart
                  allGateways={currentGateways}
                  hourlyActivity={summaryData?.hourlyActivity}
                  hourlyByGateway={summaryData?.hourlyByGateway}
                  selectedGateway={{ gatewayId: currentGateway.gatewayId, alias: currentGateway.alias }}
                />
              )}

              {gatewayTab === 'RADIO' && (
                <GatewayRadioHealth gatewayAlias={currentGateway.alias} meters={currentMeters} />
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
            onClose={() => setSelectedMeter(null)}
          />
        )}
      </div>

      {/* Bottom: Live Network Telemetry Feed */}
      <LiveNetworkFeed
        frames={allFrames}
        onSelectMeter={handleSelectMeterById}
        meterCount={currentKpis?.uniqueMetersSeen ?? null}
      />
    </div>
    </WindowLabelProvider>
    </ThresholdsProvider>
  );
}

export default CommandCenterPage;
