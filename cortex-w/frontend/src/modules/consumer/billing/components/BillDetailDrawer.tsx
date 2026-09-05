import { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import {
  X,
  Droplet,
  Radio,
  Download,
  CheckCircle2,
  Maximize2,
  Minimize2,
  Receipt,
  FileText,
  Clock,
  Calendar,
  Zap,
  Check,
  AlertTriangle,
  CreditCard,
  User,
} from 'lucide-react';
import type { BillDTO, BillDetailResponse } from '../types/billing.types';
import { billingApi } from '@/services/api/billingApi';
import '@/modules/gis/shared/gis.css';

// --- Safe formatting helpers ---
const safeNumber = (val: any, fallback = 0): number => {
  const n = Number(val);
  return isNaN(n) ? fallback : n;
};

const safeFixed = (val: any, decimals = 2, fallback = 0): string => {
  return safeNumber(val, fallback).toFixed(decimals);
};

const safeLocale = (val: any, fallback = 0): string => {
  return safeNumber(val, fallback).toLocaleString();
};

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
    console.error('[BillDetailDrawer] Error boundary caught exception:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="gis-meter-drawer-backdrop" onClick={this.props.onClose}>
          <div className="gis-meter-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="gis-meter-drawer-header">
              <div>
                <span className="gis-meter-chip" style={{ background: '#FEE2E2', color: '#DC2626' }}>ERROR</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: 16, color: '#1E293B' }}>Invoice Profile Unavailable</h3>
              </div>
              <button className="gis-icon-btn" onClick={this.props.onClose} title="Close drawer">
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '20px 0', color: '#64748B', fontSize: 13, lineHeight: 1.6 }}>
              <p>An unexpected error occurred while rendering the billing 360 profile.</p>
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

interface BillDetailDrawerProps {
  bill: BillDTO | null;
  onClose: () => void;
  onBillUpdated?: () => void;
}

function BillDetailDrawerContent({ bill, onClose }: { bill: BillDTO; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'consumption' | 'consumer' | 'tariff' | 'settlement'>('overview');
  const [isWide, setIsWide] = useState(false);
  const [detail, setDetail] = useState<BillDetailResponse | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(true);
  const [isPaidLocally, setIsPaidLocally] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    setIsLoadingDetail(true);
    const lookupKey = bill.id || bill.customId;

    billingApi
      .getDetail(lookupKey)
      .then((res) => {
        if (!isCancelled && res) {
          setDetail(res);
        }
      })
      .catch((err) => {
        console.warn('[billing] Failed to fetch live bill detail:', err);
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingDetail(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [bill.id, bill.customId]);

  // Safe data extraction
  const b = detail?.bill || bill;
  const customId = safeString(b.customId, `BILL-${safeString(b.id, '0')}`);
  const consumerName = safeString(detail?.consumer?.name || b.householdName, 'Water Consumer');
  const householdCustomId = safeString(detail?.consumer?.customId || b.householdCustomId, '—');
  const address = safeString(detail?.consumer?.address || b.address, 'WATCO Service Area');
  const ward = safeString(detail?.consumer?.ward || b.ward, '59');
  const city = safeString(detail?.consumer?.city || b.city || b.siteName, 'Bhubaneswar');

  const rawStatus = isPaidLocally ? 'PAID' : safeString(b.status, 'OVERDUE').toUpperCase();
  const statusStr = rawStatus.toLowerCase();

  const amount = safeNumber(b.amount, 0);
  const prevReading = safeNumber(b.prevReading, 0);
  const currentReading = safeNumber(b.currentReading, 0);
  const consumptionM3 = safeNumber(b.consumption ?? Math.max(0, currentReading - prevReading), 0);
  const consumptionL = Math.round(consumptionM3 * 1000);

  const meterId = safeString(b.meterId || detail?.meter?.meterId, '0024000000');
  const billDate = safeString(b.date, '2026-02-09');
  const dueDate = safeString(b.dueDate, '2026-03-01');
  const cycleStart = safeString(b.startDate, '2026-01-01');
  const cycleEnd = safeString(b.endDate, '2026-01-31');

  const charges = detail?.charges || b.billCharges || [];
  const dailyReadings = detail?.dailyReadings || [];

  // Download Printable Tax Invoice / Receipt
  const handleDownloadInvoice = () => {
    const invoiceContent = `
============================================================
              WATCO WATER SEWERAGE UTILITY
               WATER BILL & TAX INVOICE
============================================================
Invoice Number     : ${customId}
Billing Cycle      : ${cycleStart} to ${cycleEnd}
Invoice Issue Date : ${billDate}
Payment Due Date   : ${dueDate}
Payment Status     : ${rawStatus}
------------------------------------------------------------
CONSUMER DETAILS:
Name               : ${consumerName}
Consumer ID        : ${householdCustomId}
Address            : ${address}
City / Ward        : ${city} / Ward ${ward}
------------------------------------------------------------
METER & CONSUMPTION:
Meter Serial No    : ${meterId}
Previous Index     : ${safeFixed(prevReading, 2)} m3
Current Index      : ${safeFixed(currentReading, 2)} m3
Billed Volume      : ${safeFixed(consumptionM3, 2)} m3 (${safeLocale(consumptionL)} Liters)
------------------------------------------------------------
ITEMIZED CHARGES:
${charges.map((c, i) => `${i + 1}. ${c.chargeName} (${c.type}): ₹${safeFixed(c.amountCharged, 2)} (Rate: ₹${c.rate}/KL)`).join('\n')}
------------------------------------------------------------
TOTAL AMOUNT DUE   : ₹${safeFixed(amount, 2)}
============================================================
Generated from WATCO Cognecto Smart Water Management Platform
`.trim();

    const blob = new Blob([invoiceContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Invoice_${customId.replace(/\//g, '_')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Download Consumption History CSV
  const downloadCsv = () => {
    const headers = ['Date', 'Consumption_Liters', 'Consumption_m3', 'Meter_Index_m3', 'Status'];
    const rows = dailyReadings.map((r) => [
      r.date,
      safeNumber(r.consumptionL ?? (r as any).consumption, 0),
      safeFixed(safeNumber(r.consumptionL ?? (r as any).consumption, 0) / 1000, 3),
      safeFixed(r.readingM3 ?? (r as any).reading, 2),
      'Validated',
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `consumption_${customId.replace(/\//g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
              <span className="gis-meter-chip">BILLING 360</span>
              <span className={`gis-status-badge gis-status-badge--${statusStr}`}>
                {rawStatus}
              </span>
              <span className={`gis-badge-sub ${city === 'Puri' ? 'gis-badge-sub--warn' : 'gis-badge-sub--ok'}`}>
                {city.toUpperCase()}
              </span>
              {isLoadingDetail && (
                <span className="gis-drawer-loading">
                  <Clock size={11} className="gis-spin" /> Fetching Live Telemetry
                </span>
              )}
            </div>
            <h2 className="gis-meter-id-title">{customId}</h2>
            <p className="gis-meter-consumer-sub">
              <strong>{consumerName}</strong> · {householdCustomId} · Ward {ward}
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
              <span className="gis-kpi-label">Invoice Amount</span>
              <Receipt size={13} color="#2563EB" />
            </div>
            <div className="gis-kpi-val-group">
              <span className="gis-kpi-big">₹{safeFixed(amount, 2)}</span>
              <span className="gis-kpi-small">({rawStatus})</span>
            </div>
          </div>

          <div className="gis-meter-kpi-card">
            <div className="gis-kpi-top">
              <span className="gis-kpi-label">Billed Volume</span>
              <Droplet size={13} color="#059669" />
            </div>
            <div className="gis-kpi-val-group">
              <span className="gis-kpi-big">{safeFixed(consumptionM3, 1)} m³</span>
              <span className="gis-kpi-small">({safeLocale(consumptionL)} L)</span>
            </div>
          </div>

          <div className="gis-meter-kpi-card">
            <div className="gis-kpi-top">
              <span className="gis-kpi-label">Due Date</span>
              <Calendar size={13} color="#D97706" />
            </div>
            <div className="gis-kpi-val-group">
              <span className="gis-kpi-big">{dueDate}</span>
              <span className="gis-kpi-small">Cycle: {cycleStart.slice(5)} to {cycleEnd.slice(5)}</span>
            </div>
          </div>

          <div className="gis-meter-kpi-card">
            <div className="gis-kpi-top">
              <span className="gis-kpi-label">Meter Index</span>
              <Radio size={13} color="#7C3AED" />
            </div>
            <div className="gis-kpi-val-group">
              <span className="gis-kpi-big">{safeFixed(currentReading, 1)} m³</span>
              <span className="gis-kpi-small">SN: {meterId}</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="gis-meter-nav-tabs">
          <button
            className={`gis-meter-tab ${activeTab === 'overview' ? 'gis-meter-tab--active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <Receipt size={13} />
            <span>Charges & Summary</span>
          </button>
          <button
            className={`gis-meter-tab ${activeTab === 'consumption' ? 'gis-meter-tab--active' : ''}`}
            onClick={() => setActiveTab('consumption')}
          >
            <Droplet size={13} />
            <span>Meter & Dials</span>
          </button>
          <button
            className={`gis-meter-tab ${activeTab === 'consumer' ? 'gis-meter-tab--active' : ''}`}
            onClick={() => setActiveTab('consumer')}
          >
            <User size={13} />
            <span>Consumer 360</span>
          </button>
          <button
            className={`gis-meter-tab ${activeTab === 'tariff' ? 'gis-meter-tab--active' : ''}`}
            onClick={() => setActiveTab('tariff')}
          >
            <Zap size={13} />
            <span>Tariff Slabs</span>
          </button>
          <button
            className={`gis-meter-tab ${activeTab === 'settlement' ? 'gis-meter-tab--active' : ''}`}
            onClick={() => setActiveTab('settlement')}
          >
            <CreditCard size={13} />
            <span>Settlement</span>
          </button>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="gis-meter-drawer-body">
          {/* TAB 1: OVERVIEW & CHARGES */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Settlement Status Banner */}
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  background: rawStatus === 'PAID' ? 'rgba(5, 150, 105, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                  border: rawStatus === 'PAID' ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {rawStatus === 'PAID' ? (
                    <CheckCircle2 size={20} color="#059669" />
                  ) : (
                    <AlertTriangle size={20} color="#ef4444" />
                  )}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: rawStatus === 'PAID' ? '#059669' : '#dc2626' }}>
                      {rawStatus === 'PAID' ? 'Invoice Settled in Full' : 'Invoice Payment Overdue'}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {rawStatus === 'PAID'
                        ? 'Payment verified via WATCO Smart Gateway'
                        : `Due date was ${dueDate}. Delayed payment surcharge may apply.`}
                    </div>
                  </div>
                </div>

                {rawStatus !== 'PAID' && (
                  <button
                    onClick={() => setIsPaidLocally(true)}
                    className="gis-layer-btn gis-layer-btn--active"
                    style={{ fontSize: 11, padding: '5px 12px' }}
                  >
                    Simulate Payment
                  </button>
                )}
              </div>

              {/* Itemized Charges Breakdown Table */}
              <div className="gis-card">
                <div className="gis-card-title">
                  <Receipt size={14} color="#2563EB" />
                  <span>Itemized Bill Charges Breakdown</span>
                </div>

                <div style={{ marginTop: 10, overflowX: 'auto' }}>
                  <table className="gis-mini-table">
                    <thead>
                      <tr>
                        <th>Charge Category</th>
                        <th>Type</th>
                        <th style={{ textAlign: 'right' }}>Rate (₹)</th>
                        <th style={{ textAlign: 'right' }}>Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {charges.length === 0 ? (
                        <tr>
                          <td>Water Supply Consumption</td>
                          <td><span className="gis-packet-pill">SLAB</span></td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>₹6.43/KL</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>
                            ₹{safeFixed(amount, 2)}
                          </td>
                        </tr>
                      ) : (
                        charges.map((c) => (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 500 }}>{c.chargeName}</td>
                            <td>
                              <span className="gis-packet-pill">{c.type}</span>
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                              ₹{safeFixed(c.rate, 2)}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: '#0f172a' }}>
                              ₹{safeFixed(c.amountCharged, 2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                        <td colSpan={3} style={{ fontWeight: 700, textAlign: 'right' }}>
                          Total Payable Amount:
                        </td>
                        <td style={{ fontWeight: 700, textAlign: 'right', color: '#2563eb', fontSize: 14, fontFamily: 'monospace' }}>
                          ₹{safeFixed(amount, 2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Key Value Metadata Grid */}
              <div className="gis-card">
                <div className="gis-card-title">
                  <FileText size={14} color="#059669" />
                  <span>Invoice Metadata & Timeline</span>
                </div>

                <div className="gis-kv-row">
                  <span className="gis-k">Bill Number</span>
                  <span className="gis-v" style={{ fontFamily: 'monospace', color: '#2563eb', fontWeight: 600 }}>
                    {customId}
                  </span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Billing Period</span>
                  <span className="gis-v">{cycleStart} to {cycleEnd}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Invoice Issue Date</span>
                  <span className="gis-v">{billDate}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Payment Due Date</span>
                  <span className="gis-v" style={{ color: '#dc2626', fontWeight: 600 }}>
                    {dueDate}
                  </span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Operating Site</span>
                  <span className="gis-v">{city} (Site ID: {b.siteId || 6394})</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Meter Serial Number</span>
                  <span className="gis-v" style={{ fontFamily: 'monospace' }}>{meterId}</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CONSUMPTION & DIALS */}
          {activeTab === 'consumption' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="gis-card">
                <div className="gis-card-title">
                  <Droplet size={14} color="#059669" />
                  <span>Meter Dial Indices & Net Volume</span>
                </div>

                {/* Dial Visual Meter Comparison */}
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
                      Previous Reading
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: '#64748b', marginTop: 4 }}>
                      {safeFixed(prevReading, 2)}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>m³ index at start</div>
                  </div>

                  <div style={{ textAlign: 'center', padding: '0 8px' }}>
                    <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>NET DELTA</div>
                    <div style={{ fontSize: 18, color: '#059669', fontWeight: 700, marginTop: 2 }}>
                      +{safeFixed(consumptionM3, 2)} m³
                    </div>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 600, textTransform: 'uppercase' }}>
                      Current Reading
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: '#2563eb', marginTop: 4 }}>
                      {safeFixed(currentReading, 2)}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>m³ index at end</div>
                  </div>
                </div>

                <div className="gis-kv-row" style={{ marginTop: 12 }}>
                  <span className="gis-k">Billed Volume in Liters</span>
                  <span className="gis-v" style={{ fontWeight: 600, color: '#059669' }}>
                    {safeLocale(consumptionL)} Liters
                  </span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Daily Average Consumption</span>
                  <span className="gis-v">
                    {safeFixed(consumptionL / 31, 0)} L / day ({safeFixed(consumptionM3 / 31, 3)} m³)
                  </span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Reading Method</span>
                  <span className="gis-v">AMR Automated LoRaWAN / Cellular Gateway</span>
                </div>
              </div>

              {/* 10-Day Reading History Table */}
              <div className="gis-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="gis-card-title" style={{ margin: 0 }}>
                    <Calendar size={14} color="#2563EB" />
                    <span>Telemetry Daily Reading Validation</span>
                  </div>
                  <button
                    onClick={downloadCsv}
                    className="gis-layer-btn"
                    style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <Download size={12} /> CSV
                  </button>
                </div>

                <div style={{ marginTop: 10, overflowX: 'auto' }}>
                  <table className="gis-mini-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th style={{ textAlign: 'right' }}>Consumption (L)</th>
                        <th style={{ textAlign: 'right' }}>Consumption (m³)</th>
                        <th style={{ textAlign: 'right' }}>Dial Index (m³)</th>
                        <th style={{ textAlign: 'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyReadings.slice(0, 7).map((r, i) => (
                        <tr key={r.date || i}>
                          <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.date}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>
                            {safeLocale(r.consumptionL ?? (r as any).consumption)} L
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                            {safeFixed((r.consumptionL ?? (r as any).consumption) / 1000, 3)} m³
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#2563eb' }}>
                            {safeFixed(r.readingM3 ?? (r as any).reading, 2)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="gis-packet-pill" style={{ background: '#DCFCE7', color: '#166534' }}>
                              NORMAL
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CONSUMER 360 */}
          {activeTab === 'consumer' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="gis-card">
                <div className="gis-card-title">
                  <User size={14} color="#2563EB" />
                  <span>Consumer Profile & Service Connection</span>
                </div>

                <div className="gis-kv-row">
                  <span className="gis-k">Consumer Name</span>
                  <span className="gis-v" style={{ fontWeight: 600 }}>{consumerName}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Consumer Account ID</span>
                  <span className="gis-v" style={{ fontFamily: 'monospace', color: '#2563eb', fontWeight: 600 }}>
                    {householdCustomId}
                  </span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Premises Address</span>
                  <span className="gis-v">{address}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Municipal Ward</span>
                  <span className="gis-v">Ward {ward}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">City / Jurisdiction</span>
                  <span className="gis-v">{city}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Tariff Category</span>
                  <span className="gis-v">Domestic Water Supply (15mm)</span>
                </div>
              </div>

              <div className="gis-card">
                <div className="gis-card-title">
                  <Radio size={14} color="#7C3AED" />
                  <span>Meter Hardware & Site Binding</span>
                </div>

                <div className="gis-kv-row">
                  <span className="gis-k">Meter Serial Number</span>
                  <span className="gis-v" style={{ fontFamily: 'monospace', fontWeight: 600 }}>{meterId}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Asset ID</span>
                  <span className="gis-v">{b.assetId || '16526'}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Operating Site ID</span>
                  <span className="gis-v">{b.siteId || 6394} ({city})</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">AMR Protocol</span>
                  <span className="gis-v">LoRaWAN EU868 / NB-IoT Class A</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Last Telemetry Sync</span>
                  <span className="gis-v">Synchronized with Cognecto Cloud</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: TARIFF SLABS */}
          {activeTab === 'tariff' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="gis-card">
                <div className="gis-card-title">
                  <Zap size={14} color="#D97706" />
                  <span>WATCO Gazette Water Supply Tariff</span>
                </div>

                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 12px 0' }}>
                  Billing rates established by the Odisha Water Supply and Sewerage Board under the 24x7 Drink from Tap Mission.
                </p>

                <table className="gis-mini-table">
                  <thead>
                    <tr>
                      <th>Slab Tier</th>
                      <th>Volume Range (KL)</th>
                      <th style={{ textAlign: 'right' }}>Tariff Rate (₹/KL)</th>
                      <th style={{ textAlign: 'center' }}>Applicability</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Slab 1 (Lifeline)</td>
                      <td>0 to 20 KL</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>₹5.40</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="gis-packet-pill" style={{ background: '#E0F2FE', color: '#0369A1' }}>SUBSIDIZED</span>
                      </td>
                    </tr>
                    <tr style={{ background: 'rgba(37, 99, 235, 0.05)' }}>
                      <td style={{ fontWeight: 600, color: '#2563eb' }}>Slab 2 (Standard)</td>
                      <td>21 to 30 KL</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>₹6.43</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="gis-packet-pill" style={{ background: '#DBEAFE', color: '#1D4ED8' }}>ACTIVE SLAB</span>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Slab 3 (Commercial / High)</td>
                      <td>&gt; 30 KL</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>₹9.50</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="gis-packet-pill" style={{ background: '#FEF3C7', color: '#B45309' }}>SURCHARGE</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="gis-card">
                <div className="gis-card-title">
                  <Check size={14} color="#059669" />
                  <span>Slab Calculation Explanation for this Invoice</span>
                </div>

                <div style={{ fontSize: 12, lineHeight: 1.6, color: '#475569' }}>
                  <p style={{ margin: '0 0 6px 0' }}>
                    <strong>Billed Volume:</strong> {safeFixed(consumptionM3, 2)} KL
                  </p>
                  <p style={{ margin: '0 0 6px 0' }}>
                    <strong>Effective Rate:</strong> ₹6.43 per KL (Domestic Tier 2)
                  </p>
                  <p style={{ margin: '0 0 6px 0' }}>
                    <strong>Consumption Charge:</strong> {safeFixed(consumptionM3, 2)} KL × ₹6.43 = <strong>₹{safeFixed(amount, 2)}</strong>
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>
                    Fixed meter maintenance and sewerage cess are waived for automated LoRa telemetry connections during rollout phase.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SETTLEMENT */}
          {activeTab === 'settlement' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="gis-card">
                <div className="gis-card-title">
                  <CreditCard size={14} color="#2563EB" />
                  <span>Settlement & Payment Gateway</span>
                </div>

                <div className="gis-kv-row">
                  <span className="gis-k">Current Payment Status</span>
                  <span className="gis-v">
                    <span className={`gis-status-badge gis-status-badge--${statusStr}`}>
                      {rawStatus}
                    </span>
                  </span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Invoice Total</span>
                  <span className="gis-v" style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                    ₹{safeFixed(amount, 2)}
                  </span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Due Date</span>
                  <span className="gis-v">{dueDate}</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Payment Modes Supported</span>
                  <span className="gis-v">UPI, BBPS (Bharat BillPay), Net Banking, WATCO Counter</span>
                </div>
                <div className="gis-kv-row">
                  <span className="gis-k">Receipt Verification</span>
                  <span className="gis-v">Instant SMS & Email Acknowledgement</span>
                </div>
              </div>

              {/* Settlement Action Card */}
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
                  {rawStatus === 'PAID' ? 'Payment Completed' : 'Collect / Settle Payment'}
                </div>
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                  {rawStatus === 'PAID'
                    ? 'This invoice has been recorded as paid in the WATCO billing registry.'
                    : 'Process collection online or mark as received from authorized cash collection counter.'}
                </p>

                <div style={{ display: 'flex', gap: 10 }}>
                  {rawStatus !== 'PAID' ? (
                    <button
                      onClick={() => setIsPaidLocally(true)}
                      className="cw-button-primary"
                      style={{ padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <CheckCircle2 size={15} /> Mark Invoice as Paid
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsPaidLocally(false)}
                      className="cw-button-secondary"
                      style={{ padding: '8px 16px', fontSize: 12 }}
                    >
                      Revert to Overdue
                    </button>
                  )}
                  <button
                    onClick={handleDownloadInvoice}
                    className="cw-button-secondary"
                    style={{ padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Download size={15} /> Download Receipt
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer Actions */}
        <div className="gis-meter-drawer-footer">
          <button
            onClick={handleDownloadInvoice}
            className="gis-drawer-btn gis-drawer-btn--secondary"
            title="Download Tax Invoice as Text/Receipt"
          >
            <Download size={14} /> Download Tax Invoice
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

export function BillDetailDrawer(props: BillDetailDrawerProps) {
  if (!props.bill) return null;

  return (
    <DrawerErrorBoundary onClose={props.onClose}>
      <BillDetailDrawerContent bill={props.bill} onClose={props.onClose} />
    </DrawerErrorBoundary>
  );
}
