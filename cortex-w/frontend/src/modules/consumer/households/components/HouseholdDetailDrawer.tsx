import { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { X, Droplet, Radio, User, Maximize2, Minimize2, RefreshCw, FileText, Calendar, Activity, Zap } from 'lucide-react';
import type { HouseholdDTO } from '../types/household.types';
import { formatStamp } from '@/modules/gis/shared/meterDetailModel';
import { summarizeDays } from '@/modules/gis/shared/meterDetailModel';
import { useHouseholdParts } from '../hooks/useHouseholdParts';
import { OverviewTab } from './tabs/OverviewTab';
import { ReadingsTab } from './tabs/ReadingsTab';
import { HardwareTab } from './tabs/HardwareTab';
import { BillingTab } from './tabs/BillingTab';
import '@/modules/gis/shared/gis.css';

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
    console.error('[HouseholdDetailDrawer] Error boundary caught exception:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="gis-meter-drawer-backdrop" onClick={this.props.onClose}>
          <div className="gis-meter-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="gis-meter-drawer-header">
              <div>
                <span className="gis-meter-chip" style={{ background: '#FEE2E2', color: '#DC2626' }}>ERROR</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: 16, color: '#1E293B' }}>Household Profile Unavailable</h3>
              </div>
              <button className="gis-icon-btn" onClick={this.props.onClose} title="Close drawer">
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '20px 0', color: '#64748B', fontSize: 13, lineHeight: 1.6 }}>
              <p>An unexpected error occurred while rendering the household profile.</p>
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

interface HouseholdDetailDrawerProps {
  household: HouseholdDTO | null;
  onClose: () => void;
}

type TabKey = 'overview' | 'readings' | 'hardware' | 'billing';

function HouseholdDetailDrawerContent({ household, onClose }: { household: HouseholdDTO; onClose: () => void }) {
  const lookupKey = household.customId || household.id;
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [isWide, setIsWide] = useState(false);
  const { core, coreState, coreError, reloadCore, parts, states, ensure, load } = useHouseholdParts(lookupKey);

  // the slower parts are asked for the first time their tab is opened (the hardware tab needs two)
  useEffect(() => {
    if (activeTab === 'billing') ensure('bills');
    if (activeTab === 'hardware') {
      ensure('hardware');
      ensure('documents');
    }
  }, [activeTab, ensure]);

  // Escape closes the drawer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const consumer = core?.consumer ?? null;
  const loadingCore = coreState === 'loading';
  const readings = core?.readings ?? [];
  const sum = summarizeDays(readings);
  const primary = core?.meters.find((m) => m.meterId === core.primaryMeterId) ?? null;
  const yesterdayL = core?.yesterdayM3 == null ? null : Math.round(core.yesterdayM3 * 1000);
  const monthM3 = core?.monthToDateM3 ?? null;
  const status = (consumer?.status ?? household.status ?? '').toLowerCase();
  // the badge colours exist for active / weak / silent: active is green, inactive grey-red, anything else amber
  const statusKey = status === 'active' ? 'active' : status === 'inactive' ? 'silent' : 'weak';
  const customId = consumer?.customId ?? household.customId ?? '—';
  const headline = [consumer?.name ?? household.name ?? (loadingCore ? 'Loading consumer…' : 'Unnamed consumer'), consumer?.ward ?? household.ward ? `Ward ${consumer?.ward ?? household.ward}` : '', consumer?.siteName ?? household.siteName ?? '']
    .filter(Boolean)
    .join(' · ');
  const tabLoading = (activeTab === 'billing' && (states.bills === 'idle' || states.bills === 'loading')) || (activeTab === 'hardware' && (states.hardware === 'loading' || states.documents === 'loading'));

  const TabBtn = ({ k, icon, label, count }: { k: TabKey; icon: ReactNode; label: string; count?: number }) => (
    <button className={`gis-meter-tab ${activeTab === k ? 'gis-meter-tab--active' : ''}`} onClick={() => setActiveTab(k)}>
      {icon}
      <span>{label}</span>
      {count ? <span className="gis-tab-count-badge">{count}</span> : null}
    </button>
  );

  return (
    <div className="gis-meter-drawer-backdrop" onClick={onClose}>
      <div className={`gis-meter-drawer ${isWide ? 'gis-meter-drawer--wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="gis-meter-drawer-header">
          <div className="gis-meter-header-info">
            <div className="gis-meter-header-topline">
              <span className="gis-meter-chip">HOUSEHOLD 360</span>
              {status && <span className={`gis-status-badge gis-status-badge--${statusKey}`}>{status.toUpperCase()}</span>}
              {(loadingCore || tabLoading) && (
                <span className="gis-drawer-loading">
                  <RefreshCw size={11} className="gis-spin" /> Loading details…
                </span>
              )}
            </div>
            <h2 className="gis-meter-id-title">{customId}</h2>
            <p className="gis-meter-consumer-sub">{headline}</p>
            {coreState === 'error' && (
              <p style={{ margin: '4px 0 0 0', fontSize: 11, color: '#B45309' }}>
                {coreError} <button className="gis-layer-btn" onClick={reloadCore}>Retry</button>
              </p>
            )}
          </div>
          <div className="gis-meter-header-actions">
            <button className="gis-icon-btn" title={isWide ? 'Compact drawer' : 'Expand drawer width'} onClick={() => setIsWide(!isWide)}>
              {isWide ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button className="gis-icon-btn" title="Close drawer" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="gis-meter-kpi-grid">
          <div className="gis-meter-kpi-card">
            <div className="gis-kpi-top"><span className="gis-kpi-label">Yesterday's Usage</span><Droplet size={13} color="#2563EB" /></div>
            <div className="gis-kpi-val-group">
              <span className="gis-kpi-big">{yesterdayL == null ? '—' : `${yesterdayL} L`}</span>
              <span className="gis-kpi-small">{core?.yesterdayM3 == null ? '' : `(${core.yesterdayM3} m³)`}</span>
            </div>
            <div className="gis-kpi-footer">
              {loadingCore ? <span className="gis-trend-zero">Loading…</span> : yesterdayL == null ? <span className="gis-trend-zero">No figure for yesterday</span> : yesterdayL === 0 ? <span className="gis-trend-zero">No flow recorded</span> : sum.avgL > 0 ? (
                <span className={yesterdayL > sum.avgL ? 'gis-trend-up' : 'gis-trend-down'}>
                  {yesterdayL > sum.avgL ? '+' : '-'}{Math.round((Math.abs(yesterdayL - sum.avgL) / sum.avgL) * 100)}% vs {sum.days}-day avg
                </span>
              ) : <span className="gis-trend-zero">No baseline yet</span>}
            </div>
          </div>
          <div className="gis-meter-kpi-card">
            <div className="gis-kpi-top"><span className="gis-kpi-label">Month to Date</span><Calendar size={13} color="#059669" /></div>
            <div className="gis-kpi-val-group">
              <span className="gis-kpi-big">{monthM3 != null ? `${monthM3} m³` : '—'}</span>
              <span className="gis-kpi-small">{monthM3 != null ? `(${Math.round(monthM3 * 1000).toLocaleString()} L)` : ''}</span>
            </div>
            <div className="gis-kpi-footer"><span className="gis-trend-zero">{loadingCore ? 'Loading…' : monthM3 == null ? 'No figure yet' : 'Since the 1st of the month'}</span></div>
          </div>
          <div className="gis-meter-kpi-card">
            <div className="gis-kpi-top"><span className="gis-kpi-label">Cumulative Index</span><Activity size={13} color="#4F46E5" /></div>
            <div className="gis-kpi-val-group">
              <span className="gis-kpi-big">{primary?.readingM3 != null ? primary.readingM3.toFixed(3) : '—'}</span>
              <span className="gis-kpi-small">{primary?.readingM3 != null ? 'm³ total' : ''}</span>
            </div>
            <div className="gis-kpi-footer"><span className="gis-meta-seen">Last: {formatStamp(primary?.lastSeen)}</span></div>
          </div>
          <div className="gis-meter-kpi-card">
            <div className="gis-kpi-top"><span className="gis-kpi-label">Meters Linked</span><Zap size={13} color="#4F46E5" /></div>
            <div className="gis-kpi-val-group">
              <span className="gis-kpi-big">{core ? core.meters.length : '—'}</span>
            </div>
            <div className="gis-kpi-footer"><span className="gis-meta-seen">{loadingCore ? 'Loading…' : primary ? `Primary ${primary.meterId}` : 'No meter linked'}</span></div>
          </div>
        </div>

        <div className="gis-meter-nav-tabs">
          <TabBtn k="overview" icon={<User size={13} />} label="Profile & Info" />
          <TabBtn k="readings" icon={<Droplet size={13} />} label="Readings" />
          <TabBtn k="hardware" icon={<Radio size={13} />} label="Meter Hardware" count={states.documents === 'done' ? parts.documents?.photos.length : undefined} />
          <TabBtn k="billing" icon={<FileText size={13} />} label="Billing & Tariff" />
        </div>

        {activeTab === 'overview' && <OverviewTab consumer={consumer} loading={loadingCore} />}
        {activeTab === 'readings' && <ReadingsTab readings={readings} loading={loadingCore} hasMeter={!!primary} fileStem={String(customId).replace(/\//g, '_')} />}
        {activeTab === 'hardware' && (
          <HardwareTab core={core} hardware={parts.hardware} documents={parts.documents} hardwareState={states.hardware} documentsState={states.documents} onRetry={load} />
        )}
        {activeTab === 'billing' && <BillingTab bills={parts.bills} state={states.bills} onRetry={() => load('bills')} />}
      </div>
    </div>
  );
}

export function HouseholdDetailDrawer({ household, onClose }: HouseholdDetailDrawerProps) {
  if (!household) return null;
  return (
    <DrawerErrorBoundary onClose={onClose}>
      {/* keyed by household: opening another one starts with clean state */}
      <HouseholdDetailDrawerContent key={String(household.id ?? household.customId)} household={household} onClose={onClose} />
    </DrawerErrorBoundary>
  );
}
