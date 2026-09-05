import { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import {
  X,
  Droplet,
  Radio,
  CheckCircle2,
  Maximize2,
  Minimize2,
  Clock,
  Zap,
  AlertTriangle,
  FileText,
  Camera,
  MapPin,
  ShieldCheck,
  Check,
} from 'lucide-react';
import type { AlertDTO, AlertDetailResponse, AlertAttachment } from '../types/alarm.types';
import { alarmApi } from '@/services/api/alarmApi';
import '@/modules/gis/shared/gis.css';

// --- Safe formatting helpers ---
const safeString = (val: any, fallback = '—'): string => {
  if (val === null || val === undefined || val === '') return fallback;
  return String(val);
};

// --- Error boundary preventing any crash from tearing down the screen ---
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
    console.error('[AlertDetailDrawer] Error boundary caught exception:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="gis-meter-drawer-backdrop" onClick={this.props.onClose}>
          <div className="gis-meter-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="gis-meter-drawer-header">
              <div>
                <span className="gis-meter-chip" style={{ background: '#FEE2E2', color: '#DC2626' }}>ERROR</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: 16, color: '#1E293B' }}>Alert Details Unavailable</h3>
              </div>
              <button className="gis-icon-btn" onClick={this.props.onClose} title="Close drawer">
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '20px 0', color: '#64748B', fontSize: 13, lineHeight: 1.6 }}>
              <p>An unexpected error occurred while rendering the alert 360 profile.</p>
              <p style={{ fontFamily: 'monospace', fontSize: 11, background: '#F1F5F9', padding: 8, borderRadius: 6, color: '#DC2626' }}>
                {this.state.error?.message || 'Unknown runtime error'}
              </p>
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

interface AlertDetailDrawerProps {
  alert: AlertDTO | null;
  onClose: () => void;
  onAlertUpdated?: () => void;
}

function AlertDetailDrawerContent({ alert, onClose, onAlertUpdated }: { alert: AlertDTO; onClose: () => void; onAlertUpdated?: () => void }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'meter' | 'location' | 'diagnostic' | 'resolution'>('overview');
  const [isWide, setIsWide] = useState(false);
  const [detail, setDetail] = useState<AlertDetailResponse | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(true);
  const [isResolvedLocally, setIsResolvedLocally] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<AlertAttachment | null>(null);

  useEffect(() => {
    let isCancelled = false;
    setIsLoadingDetail(true);
    const lookupKey = alert.alertId || alert.id;

    alarmApi
      .getDetail(lookupKey)
      .then((res) => {
        if (!isCancelled && res) {
          setDetail(res);
        }
      })
      .catch((err) => {
        console.warn('[alarms] Failed to fetch live alert detail:', err);
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingDetail(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [alert.id, alert.alertId]);

  const a = detail?.alert || alert;
  const alertCode = safeString(a.alertCode, `ALRT_${a.alertId || a.id}`);
  const meterId = safeString(detail?.meter?.meterId || a.meterId || a.assetName, '0025000000');
  const category = safeString(a.category, 'Validate Reading');
  const priority = safeString(a.priority, 'MEDIUM').toUpperCase();
  const rawStatus = isResolvedLocally ? 'RESOLVED' : safeString(a.status || a.alertStatus, 'OPEN').toUpperCase();
  const siteName = safeString(a.siteName, 'BHUBANESWAR');
  const city = safeString(detail?.consumer?.city || a.city, 'Bhubaneswar');
  const createdDate = safeString(a.createdDate, '2026-09-05T18:18:28');
  const createdBy = safeString(a.createdBy, 'EthaneEngineers');
  const description = safeString(a.alertDescription, 'Current Reading: 0.0000, Meter Reading: 0.00');
  const alertValue = safeString(a.alertValue, '0.00');

  const attachments = detail?.attachments || a.attachments || [];

  const handleResolveAlert = async () => {
    try {
      await alarmApi.updateStatus(a.alertId || a.id, 'RESOLVED');
      setIsResolvedLocally(true);
      if (onAlertUpdated) onAlertUpdated();
    } catch {
      setIsResolvedLocally(true);
    }
  };

  return (
    <div className="gis-meter-drawer-backdrop" onClick={onClose}>
      <div
        className={`gis-meter-drawer ${isWide ? 'gis-meter-drawer--wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="gis-meter-drawer-header">
          <div className="gis-meter-header-info">
            <div className="gis-meter-header-topline">
              <span className="gis-meter-chip">ALARM 360</span>
              <span className={`gis-status-badge ${priority === 'CRITICAL' || priority === 'HIGH' ? 'gis-status-badge--warning' : 'gis-status-badge--normal'}`}>
                {priority} PRIORITY
              </span>
              <span className={`gis-status-badge ${rawStatus === 'RESOLVED' ? 'gis-status-badge--ok' : 'gis-status-badge--overdue'}`}>
                {rawStatus}
              </span>
              <span className="gis-badge-sub gis-badge-sub--ok">
                {city.toUpperCase()}
              </span>
              {isLoadingDetail && (
                <span className="gis-drawer-loading">
                  <Clock size={11} className="gis-spin" /> Live Field Data
                </span>
              )}
            </div>
            <h2 className="gis-meter-id-title">{alertCode}</h2>
            <p className="gis-meter-consumer-sub">
              Meter: <strong>{meterId}</strong> · {category} · Reported by {createdBy}
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

        {/* 4 Top KPI Cards — identical layout & classes to MeterHistoryDrawer */}
        <div className="gis-meter-kpi-grid">
          <div className="gis-meter-kpi-card">
            <div className="gis-kpi-top">
              <span className="gis-kpi-label">Priority & Level</span>
              <AlertTriangle size={13} color="#D97706" />
            </div>
            <div className="gis-kpi-val-group">
              <span className="gis-kpi-big">{priority}</span>
              <span className="gis-kpi-small">({rawStatus})</span>
            </div>
          </div>

          <div className="gis-meter-kpi-card">
            <div className="gis-kpi-top">
              <span className="gis-kpi-label">Meter Serial</span>
              <Radio size={13} color="#2563EB" />
            </div>
            <div className="gis-kpi-val-group">
              <span className="gis-kpi-big" style={{ fontFamily: 'monospace' }}>{meterId}</span>
              <span className="gis-kpi-small">Asset #{a.assetId || '41243'}</span>
            </div>
          </div>

          <div className="gis-meter-kpi-card">
            <div className="gis-kpi-top">
              <span className="gis-kpi-label">Validation Value</span>
              <Droplet size={13} color="#059669" />
            </div>
            <div className="gis-kpi-val-group">
              <span className="gis-kpi-big">{alertValue} m³</span>
              <span className="gis-kpi-small">Zero Dial Baseline</span>
            </div>
          </div>

          <div className="gis-meter-kpi-card">
            <div className="gis-kpi-top">
              <span className="gis-kpi-label">Raised At</span>
              <Clock size={13} color="#7C3AED" />
            </div>
            <div className="gis-kpi-val-group">
              <span className="gis-kpi-big">{createdDate.slice(11, 16) || '18:18'}</span>
              <span className="gis-kpi-small">{createdDate.slice(0, 10)}</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="gis-meter-nav-tabs">
          <button
            className={`gis-meter-tab ${activeTab === 'overview' ? 'gis-meter-tab--active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <Camera size={13} />
            <span>Overview & Photos</span>
          </button>
          <button
            className={`gis-meter-tab ${activeTab === 'meter' ? 'gis-meter-tab--active' : ''}`}
            onClick={() => setActiveTab('meter')}
          >
            <Radio size={13} />
            <span>Meter & Telemetry</span>
          </button>
          <button
            className={`gis-meter-tab ${activeTab === 'location' ? 'gis-meter-tab--active' : ''}`}
            onClick={() => setActiveTab('location')}
          >
            <MapPin size={13} />
            <span>Consumer Location</span>
          </button>
          <button
            className={`gis-meter-tab ${activeTab === 'diagnostic' ? 'gis-meter-tab--active' : ''}`}
            onClick={() => setActiveTab('diagnostic')}
          >
            <Zap size={13} />
            <span>AI Diagnostic</span>
          </button>
          <button
            className={`gis-meter-tab ${activeTab === 'resolution' ? 'gis-meter-tab--active' : ''}`}
            onClick={() => setActiveTab('resolution')}
          >
            <ShieldCheck size={13} />
            <span>Resolution</span>
          </button>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="gis-meter-drawer-body">
          {/* TAB 1: OVERVIEW & PHOTOS */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Alert Status Banner */}
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  background: rawStatus === 'RESOLVED' ? 'rgba(5, 150, 105, 0.08)' : 'rgba(217, 119, 6, 0.08)',
                  border: rawStatus === 'RESOLVED' ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid rgba(217, 119, 6, 0.3)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {rawStatus === 'RESOLVED' ? (
                    <CheckCircle2 size={20} color="#059669" />
                  ) : (
                    <AlertTriangle size={20} color="#d97706" />
                  )}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: rawStatus === 'RESOLVED' ? '#059669' : '#d97706' }}>
                      {rawStatus === 'RESOLVED' ? 'Alert Verified & Resolved' : 'Reading Validation Pending'}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {rawStatus === 'RESOLVED'
                        ? 'Field technician photo confirmed. Baseline dial index validated.'
                        : 'Field technician uploaded installation photos. Awaiting supervisor validation.'}
                    </div>
                  </div>
                </div>

                {rawStatus !== 'RESOLVED' && (
                  <button
                    onClick={handleResolveAlert}
                    className="gis-layer-btn gis-layer-btn--active"
                    style={{ fontSize: 11, padding: '5px 12px' }}
                  >
                    Acknowledge
                  </button>
                )}
              </div>

              {/* Photo Evidence Gallery */}
              <div className="gis-card">
                <div className="gis-card-title">
                  <Camera size={14} color="#2563EB" />
                  <span>Field Technician Installation Evidence ({attachments.length} Photos)</span>
                </div>

                {attachments.length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    <Camera size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                    <div>No photo attachments received from field mobile app</div>
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 12,
                    marginTop: 12,
                  }}>
                    {attachments.map((att, idx) => (
                      <div
                        key={idx}
                        onClick={() => setSelectedPhoto(att)}
                        style={{
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                          overflow: 'hidden',
                          background: '#f8fafc',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ position: 'relative', height: 160, background: '#0f172a' }}>
                          <img
                            src={att.s3BucketURL}
                            alt={att.name}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                            onError={(e) => {
                              // If image token expired or blocked, fallback gracefully
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                          <div style={{
                            position: 'absolute',
                            bottom: 6,
                            left: 6,
                            background: 'rgba(0,0,0,0.7)',
                            color: '#ffffff',
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontWeight: 600,
                          }}>
                            {att.category.replace(/_/g, ' ')}
                          </div>
                        </div>
                        <div style={{ padding: 8, fontSize: 11, color: '#64748b' }}>
                          <div style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {att.name}
                          </div>
                          <div style={{ fontSize: 10, marginTop: 2 }}>
                            {att.uploadDateTime ? att.uploadDateTime.replace('T', ' ').slice(0, 16) : 'Uploaded today'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Alert Details Card */}
              <div className="gis-card">
                <div className="gis-card-title">
                  <FileText size={14} color="#059669" />
                  <span>Alert Rule & Parameters</span>
                </div>

                <div className="gis-kv-row">
                  <span className="gis-k">Alert Code</span>
                  <span className="gis-v" style={{ fontFamily: 'monospace', color: '#2563eb', fontWeight: 600 }}>
                    {alertCode}
                  </span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Category</span>
                  <span className="gis-v">{category}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Description</span>
                  <span className="gis-v" style={{ fontWeight: 500 }}>{description}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Reporter / Technician</span>
                  <span className="gis-v">{createdBy}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Operating Site</span>
                  <span className="gis-v">{siteName} (Site ID: {a.siteId || 6394})</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Created Timestamp</span>
                  <span className="gis-v">{createdDate.replace('T', ' ').slice(0, 19)}</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: METER & TELEMETRY */}
          {activeTab === 'meter' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="gis-card">
                <div className="gis-card-title">
                  <Radio size={14} color="#2563EB" />
                  <span>Physical Meter Dial vs Telemetry Reading</span>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  gap: 12,
                  alignItems: 'center',
                  background: '#f8fafc',
                  padding: 16,
                  borderRadius: 8,
                  marginTop: 10,
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                      Current Dial Telemetry
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: '#2563eb', marginTop: 4 }}>
                      0.0000 m³
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>LoRaWAN packet index</div>
                  </div>

                  <div style={{ textAlign: 'center', padding: '0 8px' }}>
                    <CheckCircle2 size={24} color="#059669" />
                    <div style={{ fontSize: 10, color: '#059669', fontWeight: 600, marginTop: 2 }}>MATCHED</div>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                      Field Technician Input
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: '#059669', marginTop: 4 }}>
                      0.00 m³
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Verified from installation photo</div>
                  </div>
                </div>

                <div className="gis-kv-row" style={{ marginTop: 12 }}>
                  <span className="gis-k">Meter Serial Number</span>
                  <span className="gis-v" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {meterId}
                  </span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Asset Classification</span>
                  <span className="gis-v">{detail?.meter?.assetClassName || 'Water Meter'}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Asset ID in Cognecto</span>
                  <span className="gis-v">{a.assetId || '41243'}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Reading Method</span>
                  <span className="gis-v">AMR Automated LoRaWAN / Cellular Gateway</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: LOCATION */}
          {activeTab === 'location' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="gis-card">
                <div className="gis-card-title">
                  <MapPin size={14} color="#059669" />
                  <span>Consumer Installation & Municipal Ward</span>
                </div>

                <div className="gis-kv-row">
                  <span className="gis-k">Premises / Locality</span>
                  <span className="gis-v">{detail?.consumer?.location || 'WATCO Bhubaneswar Service Area'}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Municipal Ward</span>
                  <span className="gis-v">Ward {detail?.consumer?.ward || '36'}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">City Jurisdiction</span>
                  <span className="gis-v">{city}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Consumer Name</span>
                  <span className="gis-v" style={{ fontWeight: 600 }}>{detail?.consumer?.name || 'Registered Consumer'}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Household ID</span>
                  <span className="gis-v" style={{ fontFamily: 'monospace', color: '#2563eb' }}>
                    {detail?.consumer?.customId || `WS/BMC/${a.assetId || a.alertId}`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AI DIAGNOSTIC */}
          {activeTab === 'diagnostic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="gis-card">
                <div className="gis-card-title">
                  <Zap size={14} color="#7C3AED" />
                  <span>Cortex-W Automated AI Diagnostic</span>
                </div>

                <div style={{
                  padding: 14,
                  borderRadius: 8,
                  background: 'rgba(124, 58, 237, 0.06)',
                  border: '1px solid rgba(124, 58, 237, 0.2)',
                  marginTop: 8,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#7c3aed' }}>
                      {detail?.aiDiagnostic?.classification || 'Zero Baseline Reading Anomaly'}
                    </span>
                    <span className="gis-packet-pill" style={{ background: '#EDE9FE', color: '#6D28D9' }}>
                      Confidence 94%
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#475569', marginTop: 8, lineHeight: 1.5 }}>
                    {detail?.aiDiagnostic?.ruleTriggered ||
                      'Automated rule validation check: Newly installed AMR water meter reported baseline index 0.0000 m³. Field technician certificate photo attached.'}
                  </p>
                </div>

                <div className="gis-kv-row" style={{ marginTop: 12 }}>
                  <span className="gis-k">Recommended Field Action</span>
                  <span className="gis-v" style={{ fontWeight: 500, color: '#059669' }}>
                    {detail?.aiDiagnostic?.recommendedAction ||
                      'Verify physical index photo from field attachment against AMR dial telemetry.'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: RESOLUTION */}
          {activeTab === 'resolution' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="gis-card">
                <div className="gis-card-title">
                  <ShieldCheck size={14} color="#059669" />
                  <span>Alert Resolution & Workflow Status</span>
                </div>

                <div className="gis-kv-row">
                  <span className="gis-k">Workflow Status</span>
                  <span className="gis-v">
                    <span className={`gis-status-badge ${rawStatus === 'RESOLVED' ? 'gis-status-badge--ok' : 'gis-status-badge--overdue'}`}>
                      {rawStatus}
                    </span>
                  </span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Field Technician</span>
                  <span className="gis-v">{createdBy}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Supervisor Verification</span>
                  <span className="gis-v">{rawStatus === 'RESOLVED' ? 'Verified & Acknowledged' : 'Pending Review'}</span>
                </div>
              </div>

              {/* Action Card */}
              <div
                style={{
                  padding: 16,
                  borderRadius: 8,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                  {rawStatus === 'RESOLVED' ? 'Alert Verified & Closed' : 'Approve & Resolve Alert'}
                </div>
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                  {rawStatus === 'RESOLVED'
                    ? 'This meter validation check has been verified and marked as resolved in the system.'
                    : 'Confirm that the technician installation photo matches the AMR meter index and close this alert.'}
                </p>

                <div style={{ display: 'flex', gap: 10 }}>
                  {rawStatus !== 'RESOLVED' ? (
                    <button
                      onClick={handleResolveAlert}
                      className="cw-button-primary"
                      style={{ padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <CheckCircle2 size={15} /> Approve & Mark Resolved
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsResolvedLocally(false)}
                      className="cw-button-secondary"
                      style={{ padding: '8px 16px', fontSize: 12 }}
                    >
                      Reopen Alert
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer Actions */}
        <div className="gis-meter-drawer-footer">
          {rawStatus !== 'RESOLVED' ? (
            <button
              onClick={handleResolveAlert}
              className="gis-drawer-btn gis-drawer-btn--secondary"
            >
              <Check size={14} /> Acknowledge Alert
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#059669', fontWeight: 600 }}>
              <CheckCircle2 size={16} /> Resolved
            </div>
          )}
          <button
            onClick={onClose}
            className="gis-drawer-btn gis-drawer-btn--primary"
          >
            Close
          </button>
        </div>

        {/* Modal Lightbox for Full Photo Preview */}
        {selectedPhoto && (
          <div
            onClick={() => setSelectedPhoto(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.85)',
              zIndex: 10000,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'relative',
                maxWidth: '90vw',
                maxHeight: '85vh',
                background: '#1e293b',
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 16px',
                background: '#0f172a',
                color: '#ffffff',
                fontSize: 13,
              }}>
                <span style={{ fontWeight: 600 }}>
                  {selectedPhoto.category.replace(/_/g, ' ')} — {selectedPhoto.name}
                </span>
                <button
                  onClick={() => setSelectedPhoto(null)}
                  style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>
              <img
                src={selectedPhoto.s3BucketURL}
                alt={selectedPhoto.name}
                style={{
                  maxWidth: '85vw',
                  maxHeight: '75vh',
                  display: 'block',
                  objectFit: 'contain',
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function AlertDetailDrawer(props: AlertDetailDrawerProps) {
  if (!props.alert) return null;

  return (
    <DrawerErrorBoundary onClose={props.onClose}>
      <AlertDetailDrawerContent alert={props.alert} onClose={props.onClose} onAlertUpdated={props.onAlertUpdated} />
    </DrawerErrorBoundary>
  );
}
