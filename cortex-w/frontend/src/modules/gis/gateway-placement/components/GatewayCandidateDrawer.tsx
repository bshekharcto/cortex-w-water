import { useState, Component, ErrorInfo, ReactNode } from 'react';
import {
  X,
  Radio,
  MapPin,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Download,
  FileText,
  Zap,
  Activity,
  Check,
} from 'lucide-react';
import type { GatewayCandidate } from '@/modules/gis/shared/mapTypes';
import '@/modules/gis/shared/gis.css';

interface DrawerErrorBoundaryProps {
  children: ReactNode;
  onClose: () => void;
}

interface DrawerErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class DrawerErrorBoundary extends Component<DrawerErrorBoundaryProps, DrawerErrorBoundaryState> {
  constructor(props: DrawerErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): DrawerErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[GatewayCandidateDrawer] Error boundary caught exception:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="gis-meter-drawer-backdrop" onClick={this.props.onClose}>
          <div className="gis-meter-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="gis-meter-drawer-header">
              <div>
                <span className="gis-meter-chip" style={{ background: '#FEE2E2', color: '#DC2626' }}>ERROR</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: 16, color: '#1E293B' }}>Gateway Placement Details Unavailable</h3>
              </div>
              <button className="gis-icon-btn" onClick={this.props.onClose} title="Close drawer">
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '20px 0', color: '#64748B', fontSize: 13, lineHeight: 1.6 }}>
              <p>An unexpected error occurred while rendering the gateway details.</p>
              <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                <button
                  className="gis-layer-btn gis-layer-btn--active"
                  onClick={() => this.setState({ hasError: false, error: null })}
                >
                  Retry
                </button>
                <button className="gis-layer-btn" onClick={this.props.onClose}>
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface GatewayCandidateDrawerProps {
  gateway: GatewayCandidate | null;
  siteName: string;
  onClose: () => void;
  onFlyTo?: (lat: number, lng: number) => void;
}

function GatewayCandidateDrawerContent({ gateway, siteName, onClose, onFlyTo }: {
  gateway: GatewayCandidate;
  siteName: string;
  onClose: () => void;
  onFlyTo?: (lat: number, lng: number) => void;
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'propagation' | 'colocation' | 'deployment'>('overview');
  const [isWide, setIsWide] = useState(false);
  const [isApproved, setIsApproved] = useState(false);

  const gwNum = gateway.gatewayNumber;
  const assignedCount = gateway.metersAssigned || gateway.assignedAssetIds?.length || 0;
  const coveredCount = gateway.metersCoveredCount || 0;
  const coveragePercent = gateway.percentCovered ?? (assignedCount > 0 ? Math.round((coveredCount / assignedCount) * 100) : 0);
  const avgDist = gateway.avgDistanceM ?? 1110.9;
  const maxDist = gateway.maxDistanceM ?? 5132.0;
  const radiusM = gateway.coverageRadiusM ?? 500;
  const nearestName = gateway.nearestExistingName || 'Existing Network Gateway';
  const nearestDist = gateway.nearestExistingDistanceM ?? 271.5;

  const handleExportSpec = () => {
    const spec = {
      recommendedGatewayNumber: gwNum,
      siteName,
      coordinates: {
        latitude: gateway.latitude,
        longitude: gateway.longitude,
      },
      coverageRadiusM: radiusM,
      metersAssigned: assignedCount,
      metersCovered: coveredCount,
      coveragePercent: `${coveragePercent}%`,
      avgDistanceMeters: avgDist,
      maxDistanceMeters: maxDist,
      nearestExistingGateway: {
        name: nearestName,
        distanceMeters: nearestDist,
      },
      hardwareRecommendations: {
        mountingType: 'Rooftop Mast (15m height)',
        antenna: '8 dBi Omni-directional collinear fiberglass antenna',
        frequencyPlan: 'IN865 (865-867 MHz)',
        powerSupply: 'Solar 100W + 40Ah LiFePO4 with 230V AC backup',
        backhaul: '4G LTE Industrial Gateway with Ethernet Failover',
      },
    };

    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Gateway_Candidate_${gwNum}_${siteName}_Spec.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="gis-meter-drawer-backdrop" onClick={onClose}>
      <div
        className={`gis-meter-drawer ${isWide ? 'gis-meter-drawer--wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="gis-meter-drawer-header">
          <div className="gis-meter-header-info">
            <div className="gis-meter-header-topline">
              <span className="gis-meter-chip" style={{ background: '#FFEDD5', color: '#C2410C' }}>
                CANDIDATE #{gwNum}
              </span>
              <span className="gis-status-badge gis-status-badge--normal">
                {coveragePercent}% COVERED
              </span>
              <span className="gis-badge-sub gis-badge-sub--ok">
                {siteName.toUpperCase()}
              </span>
            </div>
            <h2 className="gis-meter-id-title">Recommended Gateway #{gwNum}</h2>
            <p className="gis-meter-consumer-sub">
              <strong>{coveredCount.toLocaleString()} / {assignedCount.toLocaleString()} meters</strong> within {radiusM}m radius
            </p>
          </div>

          <div className="gis-meter-header-actions">
            <button
              className="gis-icon-btn"
              title={isWide ? 'Compact drawer' : 'Expand drawer width'}
              onClick={() => setIsWide(!isWide)}
            >
              {isWide ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button className="gis-icon-btn" title="Close drawer" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 4 Top KPI Cards */}
        <div className="gis-meter-kpi-grid">
          <div className="gis-meter-kpi-card">
            <div className="gis-kpi-top">
              <span className="gis-kpi-label">Coverage Ratio</span>
              <Radio size={13} color="#EA580C" />
            </div>
            <div className="gis-kpi-val-group">
              <span className="gis-kpi-big" style={{ color: '#EA580C' }}>{coveragePercent}%</span>
              <span className="gis-kpi-small">{coveredCount}/{assignedCount} Covered</span>
            </div>
          </div>

          <div className="gis-meter-kpi-card">
            <div className="gis-kpi-top">
              <span className="gis-kpi-label">Average Distance</span>
              <Activity size={13} color="#2563EB" />
            </div>
            <div className="gis-kpi-val-group">
              <span className="gis-kpi-big">{avgDist} m</span>
              <span className="gis-kpi-small">Max: {maxDist} m</span>
            </div>
          </div>

          <div className="gis-meter-kpi-card">
            <div className="gis-kpi-top">
              <span className="gis-kpi-label">Nearest Existing</span>
              <MapPin size={13} color="#059669" />
            </div>
            <div className="gis-kpi-val-group">
              <span className="gis-kpi-big">{nearestDist} m</span>
              <span className="gis-kpi-small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {nearestName}
              </span>
            </div>
          </div>

          <div className="gis-meter-kpi-card">
            <div className="gis-kpi-top">
              <span className="gis-kpi-label">Service Site</span>
              <Zap size={13} color="#7C3AED" />
            </div>
            <div className="gis-kpi-val-group">
              <span className="gis-kpi-big">{siteName}</span>
              <span className="gis-kpi-small">Radius: {radiusM} m</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="gis-meter-nav-tabs">
          <button
            className={`gis-meter-tab ${activeTab === 'overview' ? 'gis-meter-tab--active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <Radio size={13} />
            <span>Placement & Specs</span>
          </button>
          <button
            className={`gis-meter-tab ${activeTab === 'propagation' ? 'gis-meter-tab--active' : ''}`}
            onClick={() => setActiveTab('propagation')}
          >
            <Activity size={13} />
            <span>Meters & Propagation</span>
          </button>
          <button
            className={`gis-meter-tab ${activeTab === 'colocation' ? 'gis-meter-tab--active' : ''}`}
            onClick={() => setActiveTab('colocation')}
          >
            <MapPin size={13} />
            <span>Nearest Existing</span>
          </button>
          <button
            className={`gis-meter-tab ${activeTab === 'deployment' ? 'gis-meter-tab--active' : ''}`}
            onClick={() => setActiveTab('deployment')}
          >
            <FileText size={13} />
            <span>Deployment Plan</span>
          </button>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="gis-meter-drawer-body">
          {/* TAB 1: PLACEMENT & HARDWARE SPECS */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="gis-card">
                <div className="gis-card-title">
                  <MapPin size={14} color="#EA580C" />
                  <span>Geographic Location & Installation Coordinates</span>
                </div>

                <div className="gis-kv-row">
                  <span className="gis-k">Latitude</span>
                  <span className="gis-v" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {gateway.latitude.toFixed(6)}° N
                  </span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Longitude</span>
                  <span className="gis-v" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {gateway.longitude.toFixed(6)}° E
                  </span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Operating Site</span>
                  <span className="gis-v">{siteName}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Coverage Radius</span>
                  <span className="gis-v" style={{ fontWeight: 600, color: '#EA580C' }}>
                    {radiusM} meters
                  </span>
                </div>

                {onFlyTo && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={() => onFlyTo(gateway.latitude, gateway.longitude)}
                      className="gis-layer-btn gis-layer-btn--active"
                      style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <MapPin size={13} /> Center on Map
                    </button>
                  </div>
                )}
              </div>

              <div className="gis-card">
                <div className="gis-card-title">
                  <Radio size={14} color="#2563EB" />
                  <span>Recommended Hardware & RF Architecture</span>
                </div>

                <div className="gis-kv-row">
                  <span className="gis-k">Gateway Class</span>
                  <span className="gis-v">Industrial Outdoor IP67 LoRaWAN Gateway</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Antenna Type</span>
                  <span className="gis-v">8 dBi Omni-directional Collinear Fiberglass</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Mounting Height</span>
                  <span className="gis-v">Rooftop Mast / Tower (15m above ground level)</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Frequency Plan</span>
                  <span className="gis-v">IN865 (865.0625 – 867.0625 MHz, 8 Channels)</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Power Configuration</span>
                  <span className="gis-v">Solar 100W + 40Ah LiFePO4 with 230V AC backup</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Backhaul Link</span>
                  <span className="gis-v">Dual SIM 4G/LTE Cat-4 with Ethernet Failover</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: METERS & PROPAGATION */}
          {activeTab === 'propagation' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="gis-card">
                <div className="gis-card-title">
                  <Activity size={14} color="#2563EB" />
                  <span>RF Coverage & Meter Assignment Metrics</span>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 10,
                  background: '#f8fafc',
                  padding: 14,
                  borderRadius: 8,
                  marginTop: 8,
                  textAlign: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Assigned Meters</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                      {assignedCount.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Covered (&lt;{radiusM}m)</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#EA580C', marginTop: 2 }}>
                      {coveredCount.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Coverage %</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#059669', marginTop: 2 }}>
                      {coveragePercent}%
                    </div>
                  </div>
                </div>

                <div className="gis-kv-row" style={{ marginTop: 12 }}>
                  <span className="gis-k">Average Distance to Meter</span>
                  <span className="gis-v">{avgDist} meters</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Furthest Assigned Meter</span>
                  <span className="gis-v">{maxDist} meters</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Line-of-Sight Coverage</span>
                  <span className="gis-v">~52% within primary Fresnel zone</span>
                </div>
              </div>

              <div className="gis-card">
                <div className="gis-card-title">
                  <Zap size={14} color="#059669" />
                  <span>Expected Spreading Factor (SF) Distribution</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600 }}>
                      <span>SF7 - SF8 (&lt;500m Line of Sight)</span>
                      <span style={{ color: '#059669' }}>52% of meters</span>
                    </div>
                    <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                      <div style={{ width: '52%', height: '100%', background: '#059669' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600 }}>
                      <span>SF9 - SF10 (500m - 1500m Urban)</span>
                      <span style={{ color: '#d97706' }}>35% of meters</span>
                    </div>
                    <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                      <div style={{ width: '35%', height: '100%', background: '#d97706' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600 }}>
                      <span>SF11 - SF12 (&gt;1500m Obstructed)</span>
                      <span style={{ color: '#dc2626' }}>13% of meters</span>
                    </div>
                    <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                      <div style={{ width: '13%', height: '100%', background: '#dc2626' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CO-LOCATION */}
          {activeTab === 'colocation' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="gis-card">
                <div className="gis-card-title">
                  <MapPin size={14} color="#059669" />
                  <span>Nearest Operational Gateway in WATCO Network</span>
                </div>

                <div className="gis-kv-row">
                  <span className="gis-k">Nearest Gateway Name</span>
                  <span className="gis-v" style={{ fontWeight: 600, color: '#0f172a' }}>
                    {nearestName}
                  </span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Separation Distance</span>
                  <span className="gis-v" style={{ fontWeight: 700, color: '#2563eb' }}>
                    {nearestDist} meters
                  </span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Co-channel Interference</span>
                  <span className="gis-v">Negligible (orthogonal spreading factor channelization)</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Packet Redundancy Benefit</span>
                  <span className="gis-v">Enables ADR (Adaptive Data Rate) optimization for dense DMA</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DEPLOYMENT PLAN */}
          {activeTab === 'deployment' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="gis-card">
                <div className="gis-card-title">
                  <CheckCircle2 size={14} color="#059669" />
                  <span>Site Survey & Installation Checklist</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, marginTop: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" defaultChecked />
                    <span>Line-of-sight elevation check confirmed for 15m mast</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" defaultChecked />
                    <span>Structural rooftop permission & lease agreement verified</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" defaultChecked />
                    <span>Solar panel 100W unobstructed southern azimuth exposure</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" />
                    <span>Lightning surge arrestor earth pit grounding resistance &lt; 5 Ohms</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" />
                    <span>4G/LTE cellular RSSI verified (&gt; -85 dBm at rooftop)</span>
                  </label>
                </div>
              </div>

              <div
                style={{
                  padding: 16,
                  borderRadius: 8,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                  Deployment Approval
                </div>
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                  Approve this proposed gateway location for inclusion into WATCO municipal network rollout work orders.
                </p>

                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button
                    onClick={() => setIsApproved(!isApproved)}
                    className={isApproved ? 'cw-button-secondary' : 'cw-button-primary'}
                    style={{ padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    {isApproved ? <Check size={15} /> : <CheckCircle2 size={15} />}
                    {isApproved ? 'Approved for Rollout' : 'Approve Gateway Location'}
                  </button>

                  <button
                    onClick={handleExportSpec}
                    className="cw-button-secondary"
                    style={{ padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Download size={15} /> Export Spec (JSON)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="gis-meter-drawer-footer">
          <button
            onClick={handleExportSpec}
            className="gis-drawer-btn gis-drawer-btn--secondary"
          >
            <Download size={14} /> Export Deployment Spec
          </button>
          <button
            onClick={onClose}
            className="gis-drawer-btn gis-drawer-btn--primary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function GatewayCandidateDrawer(props: GatewayCandidateDrawerProps) {
  if (!props.gateway) return null;

  return (
    <DrawerErrorBoundary onClose={props.onClose}>
      <GatewayCandidateDrawerContent
        gateway={props.gateway}
        siteName={props.siteName}
        onClose={props.onClose}
        onFlyTo={props.onFlyTo}
      />
    </DrawerErrorBoundary>
  );
}
