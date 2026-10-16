import { useState, useEffect, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Droplet,
  AlertTriangle,
  Radio,
  User,
  ExternalLink,
  Download,
  CheckCircle2,
  Calendar,
  Maximize2,
  Minimize2,
  Activity,
  Zap,
  Image as ImageIcon,
  Phone,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { GisMeter, MeterAlert } from './gisData';
import { mapApi, LiveMeterDetailResponse, MeterDayRow } from '@/services/api/mapApi';
import { consumerHeadline, csvCell, formatMHz, formatStamp, statusBadge, summarizeDays } from './meterDetailModel';

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
    console.error('[MeterHistoryDrawer] Unhandled error in drawer:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="gis-meter-drawer">
          <div className="gis-meter-drawer-header">
            <div>
              <span className="gis-meter-chip" style={{ background: '#FEE2E2', color: '#DC2626' }}>ERROR</span>
              <h3 style={{ margin: '4px 0 0 0', fontSize: 16, color: '#1E293B' }}>Meter 360 Unavailable</h3>
            </div>
            <button className="gis-icon-btn" onClick={this.props.onClose} title="Close drawer">
              <X size={18} />
            </button>
          </div>
          <div style={{ padding: '20px 0', color: '#64748B', fontSize: 13, lineHeight: 1.6 }}>
            <p>Could not render telemetry details for this meter endpoint.</p>
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
      );
    }
    return this.props.children;
  }
}

/** The gateway closest to the meter on the map, and how far away it is. */
export interface NearestGateway {
  gatewayId: string;
  distanceLabel: string;
}

interface MeterHistoryDrawerProps {
  meter: GisMeter | null;
  onClose: () => void;
  nearestGateway?: NearestGateway | null;
}

function MeterHistoryDrawerInner({ meter, onClose, nearestGateway }: { meter: GisMeter; onClose: () => void; nearestGateway?: NearestGateway | null }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'readings' | 'alerts' | 'telemetry' | 'consumer'>('readings');
  const [isWide, setIsWide] = useState<boolean>(false);
  const [hoveredDay, setHoveredDay] = useState<MeterDayRow | null>(null);

  // Live Cognecto API binding state
  const [liveDetail, setLiveDetail] = useState<LiveMeterDetailResponse | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(true);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; name: string; category: string } | null>(null);

  // Two steps: the database part (readings, signal, radio) arrives first and fills the drawer; the beta API parts
  // (contact, photos, bill, replacement) follow and are merged in.
  useEffect(() => {
    let isCancelled = false;
    setIsLoadingDetail(true);
    setDetailError(null);
    setLiveDetail(null);

    const assetId = meter.assetId || (meter as any).id;
    if (!assetId) {
      setIsLoadingDetail(false);
      return;
    }

    mapApi
      .getMeterDetail(assetId, meter.meterId, { core: true })
      .then((res) => {
        if (!isCancelled && res) setLiveDetail((cur) => cur ?? res);
      })
      .catch((err) => {
        if (!isCancelled) setDetailError((err as { operatorMessage?: string })?.operatorMessage || 'Could not load the details of this meter.');
      });
    mapApi
      .getMeterDetail(assetId, meter.meterId)
      .then((res) => {
        if (!isCancelled && res) {
          setLiveDetail(res);
          setDetailError(null);
        }
      })
      .catch((err) => {
        console.warn('[gis] Failed to fetch meter detail:', err);
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingDetail(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [meter.assetId, meter.meterId]);

  // What is shown: the server's answer first, then what the page that opened the drawer already knew. Anything
  // nobody knows stays null and is shown as a dash, never a stand-in value.
  const consumerName = liveDetail?.consumer?.name || meter.householdName || null;
  const consumerId = liveDetail?.consumer?.customId || meter.householdId || null;
  const consumerMobile = liveDetail?.consumer?.mobile || null;
  const consumerAddress = liveDetail?.consumer?.location || meter.locality || null;
  const consumerWard = liveDetail?.consumer?.ward || null;
  const currentReadingM3 = liveDetail?.latestReading ?? meter.currentReadingM3 ?? null;
  const lastSeenDate = liveDetail?.lastSeen || liveDetail?.readingDate || meter.lastSeen || null;
  const fmtDateTime = formatStamp;

  const yesterdayL: number | null = liveDetail
    ? liveDetail.consumption == null
      ? null
      : Math.round(liveDetail.consumption * 1000)
    : meter.yesterdayConsumptionL ?? null;
  const yesterdayM3 = yesterdayL == null ? null : Number((yesterdayL / 1000).toFixed(3));
  const monthM3 = liveDetail?.monthToDateM3 ?? meter.monthConsumptionM3 ?? null;
  // The latest bill is the real one from the beta API; nothing is estimated from an assumed rate.
  const realLatestBill = liveDetail?.latestBill;
  const estimatedBill = realLatestBill?.totalAmount ?? realLatestBill?.amount ?? null;

  const readingsList: MeterDayRow[] = useMemo(() => liveDetail?.dailyReadings ?? [], [liveDetail]);
  // The only alerts shown are ones the opener supplies from a real source; none are made up from the status.
  const alertsList: MeterAlert[] = useMemo(() => (Array.isArray(meter.alerts) ? meter.alerts : []), [meter]);

  const sum = summarizeDays(readingsList);
  const activeAlerts = alertsList.filter((a) => a.status === 'Active');

  const downloadCsv = () => {
    const headers = ['Date', 'Consumption_Liters', 'Consumption_m3', 'Meter_Index_m3'];
    const rows = readingsList.map((r) => [r.date, r.consumptionL, r.consumptionM3, r.readingM3]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `meter_${meter.meterId}_daily_history.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const badge = statusBadge(meter.status);
  const unavailableNote = liveDetail?.unavailable?.length ? `Could not load: ${liveDetail.unavailable.join(', ')}.` : null;

  return (
    <div className={`gis-meter-drawer ${isWide ? 'gis-meter-drawer--wide' : ''}`}>
      {/* Top Header */}
      <div className="gis-meter-drawer-header">
        <div className="gis-meter-header-info">
          <div className="gis-meter-header-topline">
            <span className="gis-meter-chip">METER 360</span>
            <span className={`gis-status-badge gis-status-badge--${badge.cssKey}`}>{badge.label}</span>
            {isLoadingDetail && (
              <span className="gis-drawer-loading">
                <RefreshCw size={11} className="gis-spin" /> Loading details…
              </span>
            )}
          </div>
          <h2 className="gis-meter-id-title">Meter {meter.meterId}</h2>
          {nearestGateway && (
            <p className="gis-meter-nearest-gw" title="Straight-line distance to the closest gateway on the map">
              <span>Nearest gateway</span> <b>{nearestGateway.gatewayId}</b>
              <span className="gis-nearest-dist">{nearestGateway.distanceLabel}</span>
            </p>
          )}
          <p className="gis-meter-consumer-sub">
            {consumerHeadline({ name: consumerName, ward: consumerWard, id: consumerId, loading: isLoadingDetail })}
          </p>
          {(detailError || unavailableNote) && (
            <p style={{ margin: '4px 0 0 0', fontSize: 11, color: '#B45309' }}>{detailError || unavailableNote}</p>
          )}
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
            <span className="gis-kpi-label">Yesterday's Usage</span>
            <Droplet size={13} color="#2563EB" />
          </div>
          <div className="gis-kpi-val-group">
            <span className="gis-kpi-big">{yesterdayL == null ? '—' : `${yesterdayL} L`}</span>
            <span className="gis-kpi-small">{yesterdayM3 == null ? '' : `(${yesterdayM3} m³)`}</span>
          </div>
          <div className="gis-kpi-footer">
            {/* Compared with the average of the days shown below, and only when there is one. */}
            {yesterdayL == null ? (
              <span className="gis-trend-zero">No figure for yesterday</span>
            ) : yesterdayL === 0 ? (
              <span className="gis-trend-zero">No flow recorded</span>
            ) : sum.avgL > 0 && yesterdayL > sum.avgL ? (
              <span className="gis-trend-up">
                +{Math.round(((yesterdayL - sum.avgL) / sum.avgL) * 100)}% vs {sum.days}-day avg
              </span>
            ) : sum.avgL > 0 ? (
              <span className="gis-trend-down">
                -{Math.round(((sum.avgL - yesterdayL) / sum.avgL) * 100)}% vs {sum.days}-day avg
              </span>
            ) : (
              <span className="gis-trend-zero">No baseline yet</span>
            )}
          </div>
        </div>

        <div className="gis-meter-kpi-card">
          <div className="gis-kpi-top">
            <span className="gis-kpi-label">Month to Date</span>
            <Calendar size={13} color="#059669" />
          </div>
          <div className="gis-kpi-val-group">
            <span className="gis-kpi-big">{monthM3 != null ? monthM3 : '—'} {monthM3 != null ? 'm³' : ''}</span>
            <span className="gis-kpi-small">{monthM3 != null ? `(${Math.round(monthM3 * 1000).toLocaleString()} L)` : ''}</span>
          </div>
          <div className="gis-kpi-footer">
            <span className="gis-est-bill">{estimatedBill != null ? `Est. ₹${Number(estimatedBill).toFixed(0)}` : 'No billing data'}</span>
          </div>
        </div>

        <div className="gis-meter-kpi-card">
          <div className="gis-kpi-top">
            <span className="gis-kpi-label">Cumulative Index</span>
            <Activity size={13} color="#4F46E5" />
          </div>
          <div className="gis-kpi-val-group">
            <span className="gis-kpi-big">
              {typeof currentReadingM3 === 'number' ? currentReadingM3.toFixed(3) : '—'}
            </span>
            <span className="gis-kpi-small">{typeof currentReadingM3 === 'number' ? 'm³ total' : ''}</span>
          </div>
          <div className="gis-kpi-footer">
            <span className="gis-meta-seen">Last: {fmtDateTime(lastSeenDate)}</span>
          </div>
        </div>

        <div className="gis-meter-kpi-card">
          <div className="gis-kpi-top">
            <span className="gis-kpi-label">Instant Flow Rate</span>
            <Zap size={13} color="#4F46E5" />
          </div>
          <div className="gis-kpi-val-group">
            {/* No upstream or local source reports an instantaneous flow rate
                for this hardware — say so rather than showing a fake "0 Static". */}
            <span className="gis-kpi-big">—</span>
            <span className="gis-kpi-small">Not available</span>
          </div>
        </div>
      </div>

      {/* Segmented Sub Tabs */}
      <div className="gis-meter-nav-tabs">
        <button
          className={`gis-meter-tab ${activeTab === 'readings' ? 'gis-meter-tab--active' : ''}`}
          onClick={() => setActiveTab('readings')}
        >
          <Droplet size={13} />
          <span>10-Day Readings</span>
        </button>
        <button
          className={`gis-meter-tab ${activeTab === 'alerts' ? 'gis-meter-tab--active' : ''}`}
          onClick={() => setActiveTab('alerts')}
        >
          <AlertTriangle size={13} />
          <span>Alerts & History</span>
          {activeAlerts.length > 0 && (
            <span className="gis-tab-count-badge">{activeAlerts.length}</span>
          )}
        </button>
        <button
          className={`gis-meter-tab ${activeTab === 'telemetry' ? 'gis-meter-tab--active' : ''}`}
          onClick={() => setActiveTab('telemetry')}
        >
          <Radio size={13} />
          <span>RF & Hardware</span>
        </button>
        <button
          className={`gis-meter-tab ${activeTab === 'consumer' ? 'gis-meter-tab--active' : ''}`}
          onClick={() => setActiveTab('consumer')}
        >
          <User size={13} />
          <span>Consumer Profile</span>
          {liveDetail?.photos && liveDetail.photos.length > 0 && (
            <span className="gis-tab-count-badge" style={{ background: '#2563EB' }}>
              {liveDetail.photos.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content 1: Readings & Consumption */}
      {activeTab === 'readings' && (
        <div className="gis-meter-tab-body">
          {/* 10-Day Bar Histogram */}
          <div className="gis-chart-box">
            <div className="gis-chart-header">
              <span className="gis-chart-title">Last {sum.days || 10} Days Daily Consumption (Liters)</span>
              <span className="gis-chart-avg">{sum.days ? `Daily Avg: ${sum.avgL} L` : ''}</span>
            </div>

            <div className="gis-bar-chart-container">
              {readingsList.length === 0 && (
                <div style={{ margin: 'auto', color: '#94A3B8', fontSize: 12 }}>
                  {isLoadingDetail ? 'Loading readings…' : 'No daily readings recorded for this meter yet.'}
                </div>
              )}
              {readingsList.map((day, idx) => {
                const heightPercent = Math.max(Math.round(((day.consumptionL || 0) / (sum.maxL || 1)) * 100), 6);
                const isHovered = hoveredDay?.date === day.date;
                const isPeak = sum.maxL != null && sum.maxL > 0 && day.consumptionL === sum.maxL;
                const dayNumber = (day.shortDate.split(' ')[1] || day.shortDate).replace(/\D/g, '') || String(idx + 1);

                return (
                  <div
                    key={idx}
                    className="gis-bar-col"
                    onMouseEnter={() => setHoveredDay(day)}
                    onMouseLeave={() => setHoveredDay(null)}
                  >
                    <div className="gis-bar-track">
                      <div
                        className={`gis-bar-fill ${
                          isPeak
                            ? 'gis-bar-fill--peak'
                            : day.consumptionL === 0
                            ? 'gis-bar-fill--zero'
                            : ''
                        } ${isHovered ? 'gis-bar-fill--hover' : ''}`}
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                    <span className="gis-bar-label">{dayNumber.padStart(2, '0')}</span>
                  </div>
                );
              })}
            </div>

            <div className="gis-chart-tooltip-bar">
              {hoveredDay
                ? `${hoveredDay.date}: ${hoveredDay.consumptionL} L (${hoveredDay.consumptionM3} m³) • Meter index ${hoveredDay.readingM3.toFixed(3)} m³`
                : 'Hover over any bar to inspect daily use and the meter index'}
            </div>
          </div>

          {/* 10-Day Summary Strip */}
          <div className="gis-readings-stats-strip">
            <div className="gis-strip-item">
              <span className="gis-strip-k">{sum.days}-Day Total</span>
              <span className="gis-strip-v">{sum.totalL.toLocaleString()} L</span>
            </div>
            <div className="gis-strip-item">
              <span className="gis-strip-k">Min Day</span>
              <span className="gis-strip-v">{sum.minL == null ? '—' : `${sum.minL} L`}</span>
            </div>
            <div className="gis-strip-item">
              <span className="gis-strip-k">Peak Day</span>
              <span className="gis-strip-v">{sum.maxL == null ? '—' : `${sum.maxL} L`}</span>
            </div>
            <div className="gis-strip-item">
              <span className="gis-strip-k">Days with a reading</span>
              <span className="gis-strip-v">{sum.days}</span>
            </div>
          </div>

          {/* Detailed 10-Day Reading Table */}
          <div className="gis-drawer-table-wrap">
            <div className="gis-table-action-row">
              <span className="gis-table-title">Daily Meter Logs ({sum.days} Days)</span>
              <button className="gis-csv-btn" onClick={downloadCsv}>
                <Download size={12} /> Export CSV
              </button>
            </div>

            <table className="gis-mini-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Daily (L)</th>
                  <th style={{ textAlign: 'right' }}>Index (m³)</th>
                </tr>
              </thead>
              <tbody>
                {readingsList.map((reading, i) => (
                  <tr key={i}>
                    <td>
                      <strong>{reading.shortDate}</strong>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{reading.consumptionL} L</td>
                    <td style={{ textAlign: 'right', color: '#475569' }}>
                      {Number(reading.readingM3).toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content 2: Alerts & Health History */}
      {activeTab === 'alerts' && (
        <div className="gis-meter-tab-body">
          {/* Handover & Replacement Audit Card from Cognecto */}
          {liveDetail?.replacement && (
            <div className="gis-card" style={{ borderLeft: '3px solid #10B981', background: '#F0FDF4' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <ShieldCheck size={16} color="#059669" />
                <strong style={{ fontSize: 13, color: '#065F46' }}>Verified Meter Replacement Record</strong>
                {liveDetail.replacement.status && (
                  <span className="gis-packet-pill gis-packet-pill--good" style={{ marginLeft: 'auto' }}>
                    {liveDetail.replacement.status}
                  </span>
                )}
              </div>
              <div className="gis-kv-row">
                <span className="gis-k">Replaced Old Meter</span>
                <span className="gis-v">
                  {liveDetail.replacement.oldMeterNumber} (Final Index: {liveDetail.replacement.oldMeterReading} m³)
                </span>
              </div>
              <div className="gis-kv-row">
                <span className="gis-k">Installed Smart Meter</span>
                <span className="gis-v">{liveDetail.replacement.newMeterNumber}</span>
              </div>
              <div className="gis-kv-row">
                <span className="gis-k">Handover Date</span>
                <span className="gis-v">{liveDetail.replacement.date ? liveDetail.replacement.date.split('T')[0] : '—'}</span>
              </div>
            </div>
          )}

          <div className="gis-alerts-header-strip">
            <span>
              <strong>{alertsList.length} Total Alerts</strong> ({activeAlerts.length} Active,{' '}
              {alertsList.length - activeAlerts.length} Cleared)
            </span>
          </div>

          {alertsList.length === 0 ? (
            <div className="gis-empty-alerts">
              <CheckCircle2 size={32} color="#10B981" />
              <strong>No alerts are linked to this meter here</strong>
              <p>Network and leakage alerts are listed on the Alarms page.</p>
            </div>
          ) : (
            <div className="gis-alerts-list">
              {alertsList.map((alert: MeterAlert) => (
                <div key={alert.id} className={`gis-alert-card gis-alert-card--${alert.severity}`}>
                  <div className="gis-alert-card-top">
                    <span className={`gis-severity-pill gis-severity-pill--${alert.severity}`}>
                      {(alert.severity || 'low').toUpperCase()}
                    </span>
                    <span className="gis-alert-category">{alert.category}</span>
                    <span
                      className={`gis-alert-status-pill ${
                        alert.status === 'Active'
                          ? 'gis-alert-status-pill--active'
                          : 'gis-alert-status-pill--resolved'
                      }`}
                    >
                      {alert.status}
                    </span>
                  </div>
                  <h4 className="gis-alert-title">{alert.title}</h4>
                  <p className="gis-alert-desc">{alert.description}</p>
                  <div className="gis-alert-footer">
                    <span className="gis-alert-time">{alert.timestamp}</span>
                    <span className="gis-alert-id">Ref: {alert.id}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Content 3: Telemetry & LoRa */}
      {activeTab === 'telemetry' && (
        <div className="gis-meter-tab-body">
          <div className="gis-card">
            <span className="gis-card-title">LoRaWAN RF Communication</span>
            <div className="gis-kv-row">
              <span className="gis-k">Connected Gateway</span>
              <span className="gis-v">
                {meter.gatewayId ? `${meter.gatewayAlias || meter.gatewayId}${meter.gatewayAlias && meter.gatewayAlias !== meter.gatewayId ? ` (${String(meter.gatewayId).slice(-6)})` : ''}` : '—'}
              </span>
            </div>
            <div className="gis-kv-row">
              <span className="gis-k">Distance to Gateway</span>
              <span className="gis-v">{meter.distanceMeters != null ? `${meter.distanceMeters} meters` : '—'}</span>
            </div>
            <div className="gis-kv-row">
              <span className="gis-k">RSSI Signal Power</span>
              <span
                className="gis-v"
                style={{
                  color: meter.rssi == null ? undefined : meter.rssi > -90 ? '#059669' : meter.rssi > -95 ? '#D97706' : '#DC2626',
                }}
              >
                {meter.rssi != null ? `${meter.rssi} dBm` : '—'}
              </span>
            </div>
            <div className="gis-kv-row">
              <span className="gis-k">Signal-to-Noise Ratio (SNR)</span>
              <span className="gis-v" style={{ color: meter.snr == null ? undefined : meter.snr > -10 ? '#059669' : '#D97706' }}>
                {meter.snr != null ? `${meter.snr} dB` : '—'}
              </span>
            </div>
            <div className="gis-kv-row">
              <span className="gis-k">Device EUI</span>
              <span className="gis-v" style={{ fontFamily: 'monospace' }}>
                {liveDetail?.devEui || meter.devEui || '—'}
              </span>
            </div>
            <div className="gis-kv-row">
              <span className="gis-k">Frequency · Data rate</span>
              <span className="gis-v">
                {liveDetail?.lastFrame
                  ? `${formatMHz(liveDetail.lastFrame.frequencyHz)} · ${liveDetail.lastFrame.dataRate == null ? '—' : `DR${liveDetail.lastFrame.dataRate}`}`
                  : '—'}
              </span>
            </div>
          </div>

          <div className="gis-card">
            <span className="gis-card-title">Hardware & Metrology</span>
            <div className="gis-kv-row">
              <span className="gis-k">Last Decoded Telemetry</span>
              <span className="gis-v">{fmtDateTime(lastSeenDate)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 4: Consumer & Installation Proof */}
      {activeTab === 'consumer' && (
        <div className="gis-meter-tab-body">
          <div className="gis-card">
            <span className="gis-card-title">Consumer Account & Household</span>
            <div className="gis-kv-row">
              <span className="gis-k">Consumer Name</span>
              <span className="gis-v" style={{ color: '#2563EB', fontWeight: 700 }}>
                {consumerName || '—'}
              </span>
            </div>
            <div className="gis-kv-row">
              <span className="gis-k">Consumer ID</span>
              <span className="gis-v" style={{ fontFamily: 'monospace' }}>
                {consumerId || '—'}
              </span>
            </div>
            <div className="gis-kv-row">
              <span className="gis-k">Contact Mobile</span>
              <span className="gis-v" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Phone size={12} color="#64748B" /> {consumerMobile || '—'}
              </span>
            </div>
            <div className="gis-kv-row">
              <span className="gis-k">Address / Street</span>
              <span className="gis-v" style={{ textAlign: 'right', maxWidth: 220 }}>
                {consumerAddress || '—'}
              </span>
            </div>
            <div className="gis-kv-row">
              <span className="gis-k">Ward</span>
              <span className="gis-v">{consumerWard || '—'}</span>
            </div>
            <div className="gis-kv-row">
              <span className="gis-k">Account Status</span>
              <span className="gis-v" style={{ fontWeight: 600 }}>
                {liveDetail?.consumer?.status || '—'}
              </span>
            </div>
          </div>

          {/* S3 Installation Proof Photos */}
          <div className="gis-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="gis-card-title">Installation Proof & Documents</span>
              {liveDetail?.photos && (
                <span style={{ fontSize: 11, color: '#64748B' }}>
                  {liveDetail.photos.length} Photos on AWS S3
                </span>
              )}
            </div>

            {liveDetail?.photos && liveDetail.photos.length > 0 ? (
              <div className="gis-photo-grid">
                {liveDetail.photos.map((photo, pIdx) => (
                  <div
                    key={pIdx}
                    className="gis-photo-card"
                    onClick={() =>
                      setPreviewPhoto({
                        url: photo.url,
                        name: photo.name,
                        category: photo.category,
                      })
                    }
                  >
                    <img
                      src={photo.url}
                      alt={photo.name}
                      className="gis-photo-thumb"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div className="gis-photo-info">
                      <span className="gis-photo-category">
                        {photo.category.replace(/_/g, ' ')}
                      </span>
                      {photo.uploadDate && (
                        <span className="gis-photo-date">
                          {photo.uploadDate.split('T')[0]}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '16px 8px', textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>
                <ImageIcon size={24} style={{ margin: '0 auto 6px auto', display: 'block', opacity: 0.5 }} />
                <span>No proof photos uploaded for this meter.</span>
              </div>
            )}
          </div>

          <div className="gis-card">
            <span className="gis-card-title">Deployment Site</span>
            <div className="gis-kv-row">
              <span className="gis-k">Site</span>
              <span className="gis-v">{liveDetail?.consumer?.siteName || '—'}</span>
            </div>
            <div className="gis-kv-row">
              <span className="gis-k">Geographic Coordinates</span>
              <span className="gis-v">
                {meter.lat != null && meter.lng != null ? `${meter.lat.toFixed(4)}° N, ${meter.lng.toFixed(4)}° E` : '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal for Photo Inspection */}
      {previewPhoto && (
        <div className="gis-modal-backdrop" onClick={() => setPreviewPhoto(null)}>
          <div className="gis-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="gis-modal-close-btn" onClick={() => setPreviewPhoto(null)}>
              <X size={18} />
            </button>
            <img src={previewPhoto.url} alt={previewPhoto.name} className="gis-modal-image" />
            <div className="gis-modal-caption">
              <span>
                <strong>{previewPhoto.category.replace(/_/g, ' ')}</strong> · {previewPhoto.name}
              </span>
              <a
                href={previewPhoto.url}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#60A5FA', textDecoration: 'underline', fontSize: 11 }}
              >
                Open Original
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Action Buttons */}
      <div className="gis-meter-drawer-footer">
        <button
          className="gis-drawer-btn gis-drawer-btn--primary"
          disabled={!(meter.householdShortId || meter.householdId)}
          title={meter.householdShortId || meter.householdId ? undefined : 'No household is linked to this meter'}
          onClick={() => navigate(`/app/consumer/households/${meter.householdShortId || meter.householdId}`)}
        >
          <User size={14} /> View Household 360 & Billing
        </button>
        <button
          className="gis-drawer-btn gis-drawer-btn--secondary"
          onClick={() => navigate(`/app/command-center/meters/${meter.meterId}`)}
        >
          <ExternalLink size={14} /> Packet Availability in Command Center
        </button>
      </div>
    </div>
  );
}

export function MeterHistoryDrawer({ meter, onClose, nearestGateway }: MeterHistoryDrawerProps) {
  if (!meter) return null;
  return (
    <DrawerErrorBoundary onClose={onClose}>
      <MeterHistoryDrawerInner meter={meter} onClose={onClose} nearestGateway={nearestGateway} />
    </DrawerErrorBoundary>
  );
}

