import { useState, useMemo, useEffect } from 'react';
import '../styles/commandCenter.css';

// Components
import { CommandCenterToolbar } from '../components/CommandCenterToolbar';
import { NetworkKpiStrip } from '../components/NetworkKpiStrip';
import { GatewayRail } from '../components/GatewayRail';
import { SelectedGatewayHeader } from '../components/SelectedGatewayHeader';
import { GatewayMetersTable } from '../components/GatewayMetersTable';
import { GatewayFramesTable } from '../components/GatewayFramesTable';
import { GatewayTrafficChart } from '../components/GatewayTrafficChart';
import { GatewayRadioHealth } from '../components/GatewayRadioHealth';
import { AllGatewayComparison } from '../components/AllGatewayComparison';
import { MeterInspector } from '../components/MeterInspector';
import { LiveNetworkFeed } from '../components/LiveNetworkFeed';

// Seed Data & Types
import {
  BHUBANESWAR_KPIS,
  BHUBANESWAR_GATEWAYS,
  SAMPLE_METERS,
  RAW_TELEMETRY_FRAMES,
} from '../repository/commandCenterData';
import {
  GatewayTabType,
  TimeWindow,
  MeterTelemetryItem,
} from '../types/commandCenter.types';

export function CommandCenterPage() {
  const [activeMode, setActiveMode] = useState<'Gateways' | 'Meters'>('Gateways');
  const [timeRange, setTimeRange] = useState<TimeWindow>('24H');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>('506f9800000002a5');
  const [gatewayTab, setGatewayTab] = useState<GatewayTabType>('METERS');
  const [selectedMeter, setSelectedMeter] = useState<MeterTelemetryItem | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(14);

  // Auto-refresh timer simulation
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo((prev) => (prev >= 30 ? 1 : prev + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleManualRefresh = () => {
    setSecondsAgo(0);
  };

  // Currently selected gateway item
  const currentGateway = useMemo(() => {
    if (!selectedGatewayId) return null;
    return BHUBANESWAR_GATEWAYS.find((g) => g.gatewayId === selectedGatewayId) || null;
  }, [selectedGatewayId]);

  // Meters observed by selected gateway
  const currentMeters = useMemo(() => {
    if (!selectedGatewayId) return [];
    return SAMPLE_METERS[selectedGatewayId] || SAMPLE_METERS['506f9800000002a5'] || [];
  }, [selectedGatewayId]);

  // Frames received by selected gateway
  const currentFrames = useMemo(() => {
    if (!selectedGatewayId) return RAW_TELEMETRY_FRAMES;
    return RAW_TELEMETRY_FRAMES.filter((f) => f.gatewayId === selectedGatewayId);
  }, [selectedGatewayId]);

  // Handle selecting a meter from table or feed
  const handleSelectMeter = (meter: MeterTelemetryItem) => {
    setSelectedMeter(meter);
  };

  const handleSelectMeterById = (meterId: string) => {
    // Look up in sample meters
    for (const gwId of Object.keys(SAMPLE_METERS)) {
      const found = SAMPLE_METERS[gwId].find((m) => m.meterId === meterId);
      if (found) {
        setSelectedMeter(found);
        return;
      }
    }
    // Fallback: create synthesized inspector item
    const frame = RAW_TELEMETRY_FRAMES.find((f) => f.meterId === meterId);
    if (frame) {
      setSelectedMeter({
        meterId: frame.meterId,
        devEui: frame.devEui,
        lastSeenDate: '2026-09-04T18:15:11.706Z',
        frameAge: '18 sec ago',
        frames1H: 1,
        frames24H: 24,
        lastRssi: frame.rssi,
        lastSnr: frame.snr,
        fCnt: frame.fCnt,
        fPort: frame.fPort,
        frequency: frame.frequency,
        dr: frame.dr,
        adr: frame.adr,
        confirmed: frame.confirmed,
        otherGatewaysCount: 1,
        statusChips: ['live'],
        gatewaysHeard: [
          {
            gatewayId: frame.gatewayId,
            alias: frame.gatewayAlias,
            rssi: frame.rssi,
            snr: frame.snr,
            lastSeenText: '18 sec ago',
            isLatest: true,
          },
        ],
      });
    }
  };

  // Global search handler
  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (!q) return;
    const query = q.toLowerCase();
    // Check gateway alias or id
    const gw = BHUBANESWAR_GATEWAYS.find(
      (g) => g.alias.toLowerCase().includes(query) || g.gatewayId.toLowerCase().includes(query)
    );
    if (gw) {
      setSelectedGatewayId(gw.gatewayId);
      setGatewayTab('METERS');
      return;
    }
    // Check meter id or deveui
    for (const gwId of Object.keys(SAMPLE_METERS)) {
      const m = SAMPLE_METERS[gwId].find(
        (meter) =>
          meter.meterId.toLowerCase().includes(query) ||
          meter.devEui.toLowerCase().includes(query)
      );
      if (m) {
        setSelectedGatewayId(gwId);
        setSelectedMeter(m);
        setGatewayTab('METERS');
        return;
      }
    }
  };

  return (
    <div className="cc-container">
      {/* Top Command Bar */}
      <CommandCenterToolbar
        activeTab={activeMode}
        onTabChange={setActiveMode}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        searchQuery={searchQuery}
        onSearchChange={handleSearch}
        onRefresh={handleManualRefresh}
        lastUpdatedText={`${secondsAgo}s ago`}
      />

      {/* Network Health 8-KPI Strip */}
      <NetworkKpiStrip kpis={BHUBANESWAR_KPIS} />

      {/* Main Operational Workspace */}
      <div
        className={`cc-main-workspace-layout ${
          selectedMeter ? 'cc-main-workspace-layout--with-inspector' : ''
        }`}
      >
        {/* Left Navigator: Gateway Rail */}
        <GatewayRail
          gateways={BHUBANESWAR_GATEWAYS}
          selectedGatewayId={selectedGatewayId}
          onSelectGateway={(id) => {
            setSelectedGatewayId(id);
            if (id) {
              setGatewayTab('METERS');
            }
          }}
        />

        {/* Center: Selected Gateway Workspace OR All-Gateway Overview */}
        <main className="cc-center-workspace">
          {currentGateway ? (
            <>
              <SelectedGatewayHeader
                gateway={currentGateway}
                activeTab={gatewayTab}
                onTabChange={setGatewayTab}
                onClearSelection={() => setSelectedGatewayId(null)}
              />

              {gatewayTab === 'METERS' && (
                <GatewayMetersTable
                  meters={currentMeters}
                  selectedMeterId={selectedMeter?.meterId || null}
                  onSelectMeter={handleSelectMeter}
                />
              )}

              {gatewayTab === 'FRAMES' && (
                <GatewayFramesTable
                  frames={currentFrames.length > 0 ? currentFrames : RAW_TELEMETRY_FRAMES}
                  gatewayAlias={currentGateway.alias}
                  onSelectFrameMeter={handleSelectMeterById}
                />
              )}

              {gatewayTab === 'TRAFFIC' && (
                <GatewayTrafficChart
                  gatewayAlias={currentGateway.alias}
                  allGateways={BHUBANESWAR_GATEWAYS}
                />
              )}

              {gatewayTab === 'RADIO' && (
                <GatewayRadioHealth gatewayAlias={currentGateway.alias} />
              )}
            </>
          ) : (
            <AllGatewayComparison
              gateways={BHUBANESWAR_GATEWAYS}
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
        frames={RAW_TELEMETRY_FRAMES}
        onSelectMeter={handleSelectMeterById}
      />
    </div>
  );
}
export default CommandCenterPage;
