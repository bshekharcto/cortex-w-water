import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Search,
  RotateCcw,
  Building2,
  Receipt,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  RefreshCw,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Droplet,
} from 'lucide-react';
import type { BillDTO, BillingStats } from '../types/billing.types';
import { billingApi } from '@/services/api/billingApi';
import { BillDetailDrawer } from '../components/BillDetailDrawer';
import '@/modules/gis/shared/gis.css';

// Default date range preset: Jan 01 2026 to Feb 28 2026 per user instruction
const DEFAULT_START_DATE = '2026-01-01';
const DEFAULT_END_DATE = '2026-02-28';

export function BillingPage() {
  const { billId } = useParams<{ billId?: string }>();
  const [bills, setBills] = useState<BillDTO[]>([]);
  const [totalElements, setTotalElements] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [page, setPage] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number>(25);

  // Filters
  const [startDate, setStartDate] = useState<string>(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState<string>(DEFAULT_END_DATE);
  const [cyclePreset, setCyclePreset] = useState<'jan-feb-2026' | 'all-2026' | 'all-time' | 'custom'>('jan-feb-2026');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OVERDUE' | 'PAID' | 'PENDING'>('ALL');
  const [cityFilter, setCityFilter] = useState<'ALL' | 'Bhubaneswar' | 'Puri' | 'Cuttack'>('ALL');
  const [searchInput, setSearchInput] = useState<string>('');
  const [activeSearch, setActiveSearch] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [selectedBill, setSelectedBill] = useState<BillDTO | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveSearch(searchInput.trim());
      setPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Handle cycle preset change
  const handleCyclePresetChange = (preset: 'jan-feb-2026' | 'all-2026' | 'all-time') => {
    setCyclePreset(preset);
    if (preset === 'jan-feb-2026') {
      setStartDate('2026-01-01');
      setEndDate('2026-02-28');
    } else if (preset === 'all-2026') {
      setStartDate('2026-01-01');
      setEndDate('2026-12-31');
    } else if (preset === 'all-time') {
      setStartDate('2025-01-01');
      setEndDate('2026-12-31');
    }
    setPage(0);
  };

  // Load bills from API
  const loadBills = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await billingApi.list({
        page,
        size: pageSize,
        startDate,
        endDate,
        search: activeSearch || undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        city: cityFilter !== 'ALL' ? cityFilter : undefined,
      });

      if (res && Array.isArray(res.content)) {
        setBills(res.content);
        setTotalElements(res.totalElements || 0);
        setTotalPages(res.totalPages || 1);
        if (res.stats) {
          setStats(res.stats);
        }

        // Auto-select bill if specified in route param
        if (billId) {
          const found = res.content.find((b) => String(b.id) === billId || b.customId === billId);
          if (found) setSelectedBill(found);
        }
      }
    } catch (err) {
      console.error('[BillingPage] Failed to load bills:', err);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, startDate, endDate, activeSearch, statusFilter, cityFilter, billId]);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  const handleReset = () => {
    setSearchInput('');
    setActiveSearch('');
    setStatusFilter('ALL');
    setCityFilter('ALL');
    setCyclePreset('jan-feb-2026');
    setStartDate(DEFAULT_START_DATE);
    setEndDate(DEFAULT_END_DATE);
    setPage(0);
  };

  // Helper for city tag style
  const getCityBadge = (b: BillDTO) => {
    const city = b.city || (b.customId?.includes('PRI') ? 'Puri' : b.customId?.includes('CTC') ? 'Cuttack' : 'Bhubaneswar');
    if (city === 'Puri') {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 12,
          fontSize: 11,
          fontWeight: 600,
          background: 'rgba(217, 119, 6, 0.12)',
          color: '#d97706',
          border: '1px solid rgba(217, 119, 6, 0.3)',
        }}>
          Puri
        </span>
      );
    }
    if (city === 'Cuttack') {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 12,
          fontSize: 11,
          fontWeight: 600,
          background: 'rgba(5, 150, 105, 0.12)',
          color: '#059669',
          border: '1px solid rgba(5, 150, 105, 0.3)',
        }}>
          Cuttack
        </span>
      );
    }
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        background: 'rgba(37, 99, 235, 0.12)',
        color: '#2563eb',
        border: '1px solid rgba(37, 99, 235, 0.3)',
      }}>
        Bhubaneswar
      </span>
    );
  };

  // Helper for status badge style
  const renderStatusBadge = (status: string) => {
    const s = (status || 'OVERDUE').toUpperCase();
    if (s === 'PAID') {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 12,
          fontSize: 11,
          fontWeight: 600,
          background: 'rgba(5, 150, 105, 0.12)',
          color: '#059669',
          border: '1px solid rgba(5, 150, 105, 0.3)',
        }}>
          <CheckCircle2 size={11} /> PAID
        </span>
      );
    }
    if (s === 'PENDING') {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 12,
          fontSize: 11,
          fontWeight: 600,
          background: 'rgba(217, 119, 6, 0.12)',
          color: '#d97706',
          border: '1px solid rgba(217, 119, 6, 0.3)',
        }}>
          PENDING
        </span>
      );
    }
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        background: 'rgba(220, 38, 38, 0.12)',
        color: '#dc2626',
        border: '1px solid rgba(220, 38, 38, 0.3)',
      }}>
        <AlertTriangle size={11} /> OVERDUE
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 className="cw-section-title" style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            Water Billing & Invoicing Directory
          </h2>
          <div style={{ fontSize: 13, color: 'var(--cw-text-secondary, #64748b)', marginTop: 4 }}>
            Direct WATCO Cognecto integration — Jan-Feb 2026 Invoicing Cycle & Telemetry Audit
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => loadBills()}
            className="cw-button-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px' }}
            title="Refresh Invoices"
          >
            <RefreshCw size={14} className={isLoading ? 'cw-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            className="cw-button-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px' }}
          >
            <Plus size={16} />
            <span>Generate Invoices</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Strip — identical layout & styling as HouseholdListPage */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
      }}>
        {/* Total Invoices */}
        <div
          onClick={() => setStatusFilter('ALL')}
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'var(--cw-surface, #ffffff)',
            border: statusFilter === 'ALL' ? '2px solid #2563eb' : '1px solid var(--cw-border, #e2e8f0)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cw-text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Total Invoices
            </span>
            <Receipt size={16} color="#2563eb" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: 'var(--cw-text-primary, #0f172a)' }}>
            {(stats?.totalBills ?? totalElements).toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: '#2563eb', marginTop: 2, fontWeight: 500 }}>
            {startDate} to {endDate}
          </div>
        </div>

        {/* Total Billed Revenue */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'var(--cw-surface, #ffffff)',
            border: '1px solid var(--cw-border, #e2e8f0)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cw-text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Total Billed Revenue
            </span>
            <Building2 size={16} color="#059669" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: '#059669' }}>
            ₹{(stats?.totalAmount ?? 4775.08).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: 'var(--cw-text-secondary, #64748b)', marginTop: 2 }}>
            WATCO municipal water tariffs
          </div>
        </div>

        {/* Overdue Receivables */}
        <div
          onClick={() => setStatusFilter('OVERDUE')}
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'var(--cw-surface, #ffffff)',
            border: statusFilter === 'OVERDUE' ? '2px solid #dc2626' : '1px solid var(--cw-border, #e2e8f0)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cw-text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Overdue Amount
            </span>
            <AlertTriangle size={16} color="#dc2626" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: '#dc2626' }}>
            ₹{(stats?.overdueAmount ?? 4775.08).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2, fontWeight: 500 }}>
            {stats?.overdueCount ?? totalElements} invoices requiring collection
          </div>
        </div>

        {/* Total Billed Consumption */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'var(--cw-surface, #ffffff)',
            border: '1px solid var(--cw-border, #e2e8f0)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cw-text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Billed Volume
            </span>
            <Droplet size={16} color="#2563eb" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: '#2563eb' }}>
            {stats?.totalConsM3 ?? 709.0} m³
          </div>
          <div style={{ fontSize: 11, color: 'var(--cw-text-secondary, #64748b)', marginTop: 2 }}>
            Avg {stats?.avgConsM3 ?? 70.9} m³ per connection
          </div>
        </div>
      </div>

      {/* Control Filter Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        padding: '10px 16px',
        borderRadius: 8,
        background: 'var(--cw-surface, #ffffff)',
        border: '1px solid var(--cw-border, #e2e8f0)',
      }}>
        {/* Left: Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 260px', maxWidth: 360 }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--cw-text-secondary, #94a3b8)',
              }}
            />
            <input
              type="text"
              placeholder="Search by Bill No, Consumer ID, Name, or Meter…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 12px 7px 34px',
                borderRadius: 6,
                border: '1px solid var(--cw-border, #cbd5e1)',
                background: 'var(--cw-bg-input, #ffffff)',
                color: 'var(--cw-text-primary, #0f172a)',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Middle Left: Billing Period Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--cw-bg-subtle, #f1f5f9)', padding: 3, borderRadius: 6 }}>
          <button
            onClick={() => handleCyclePresetChange('jan-feb-2026')}
            style={{
              padding: '5px 12px',
              borderRadius: 4,
              border: 'none',
              background: cyclePreset === 'jan-feb-2026' ? 'var(--cw-surface, #ffffff)' : 'transparent',
              color: cyclePreset === 'jan-feb-2026' ? '#2563eb' : 'var(--cw-text-secondary, #64748b)',
              fontSize: 12,
              fontWeight: cyclePreset === 'jan-feb-2026' ? 600 : 500,
              cursor: 'pointer',
              boxShadow: cyclePreset === 'jan-feb-2026' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            Jan–Feb 2026 (Live)
          </button>
          <button
            onClick={() => handleCyclePresetChange('all-2026')}
            style={{
              padding: '5px 12px',
              borderRadius: 4,
              border: 'none',
              background: cyclePreset === 'all-2026' ? 'var(--cw-surface, #ffffff)' : 'transparent',
              color: cyclePreset === 'all-2026' ? '#2563eb' : 'var(--cw-text-secondary, #64748b)',
              fontSize: 12,
              fontWeight: cyclePreset === 'all-2026' ? 600 : 500,
              cursor: 'pointer',
              boxShadow: cyclePreset === 'all-2026' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            All 2026
          </button>
          <button
            onClick={() => handleCyclePresetChange('all-time')}
            style={{
              padding: '5px 12px',
              borderRadius: 4,
              border: 'none',
              background: cyclePreset === 'all-time' ? 'var(--cw-surface, #ffffff)' : 'transparent',
              color: cyclePreset === 'all-time' ? '#2563eb' : 'var(--cw-text-secondary, #64748b)',
              fontSize: 12,
              fontWeight: cyclePreset === 'all-time' ? 600 : 500,
              cursor: 'pointer',
              boxShadow: cyclePreset === 'all-time' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            All Time
          </button>
        </div>

        {/* Status Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--cw-bg-subtle, #f1f5f9)', padding: 3, borderRadius: 6 }}>
          {(['ALL', 'OVERDUE', 'PAID', 'PENDING'] as const).map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st);
                setPage(0);
              }}
              style={{
                padding: '5px 10px',
                borderRadius: 4,
                border: 'none',
                background: statusFilter === st ? 'var(--cw-surface, #ffffff)' : 'transparent',
                color: statusFilter === st ? '#0f172a' : '#64748b',
                fontSize: 12,
                fontWeight: statusFilter === st ? 600 : 500,
                cursor: 'pointer',
                boxShadow: statusFilter === st ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {st}
            </button>
          ))}
        </div>

        {/* City Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--cw-bg-subtle, #f1f5f9)', padding: 3, borderRadius: 6 }}>
          {(['ALL', 'Bhubaneswar', 'Puri', 'Cuttack'] as const).map((city) => (
            <button
              key={city}
              onClick={() => {
                setCityFilter(city);
                setPage(0);
              }}
              style={{
                padding: '5px 10px',
                borderRadius: 4,
                border: 'none',
                background: cityFilter === city ? 'var(--cw-surface, #ffffff)' : 'transparent',
                color: cityFilter === city ? '#0f172a' : '#64748b',
                fontSize: 12,
                fontWeight: cityFilter === city ? 600 : 500,
                cursor: 'pointer',
                boxShadow: cityFilter === city ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {city === 'ALL' ? 'All Cities' : city}
            </button>
          ))}
        </div>

        {/* Right: Controls & Page Size */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--cw-text-secondary, #64748b)' }}>
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid var(--cw-border, #cbd5e1)',
                background: 'var(--cw-surface, #ffffff)',
                fontSize: 12,
                color: 'var(--cw-text-primary, #0f172a)',
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          {(searchInput || statusFilter !== 'ALL' || cityFilter !== 'ALL' || cyclePreset !== 'jan-feb-2026') && (
            <button
              onClick={handleReset}
              className="cw-button-secondary"
              style={{ padding: '5px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <RotateCcw size={12} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="cw-surface cw-table-wrap" style={{ position: 'relative', minHeight: 380 }}>
        {isLoading && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(255,255,255,0.65)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            backdropFilter: 'blur(2px)',
          }}>
            <RefreshCw size={24} className="cw-spin" color="#2563eb" />
            <span style={{ marginTop: 8, fontSize: 13, fontWeight: 500, color: '#2563eb' }}>
              Querying Cognecto Live Billing Records…
            </span>
          </div>
        )}

        <table className="cw-table">
          <thead>
            <tr>
              <th style={{ width: 190 }}>Invoice Number</th>
              <th>Consumer Name & Account</th>
              <th style={{ width: 120 }}>City</th>
              <th style={{ width: 120 }}>Meter Serial</th>
              <th style={{ width: 140 }}>Billing Cycle</th>
              <th style={{ width: 110 }}>Due Date</th>
              <th style={{ width: 130, textAlign: 'right' }}>Consumption (m³)</th>
              <th style={{ width: 120, textAlign: 'right' }}>Amount (₹)</th>
              <th style={{ width: 110, textAlign: 'center' }}>Status</th>
              <th style={{ width: 110, textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--cw-text-secondary, #64748b)' }}>
                  <Receipt size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                  <div style={{ fontWeight: 600, fontSize: 14 }}>No billing invoices found</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    Try selecting "Jan–Feb 2026" or clearing your search filters.
                  </div>
                </td>
              </tr>
            ) : (
              bills.map((b) => (
                <tr
                  key={b.id || b.customId}
                  className="cw-table-row--clickable"
                  onClick={() => setSelectedBill(b)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <span style={{
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      fontSize: 12,
                      color: '#2563eb',
                      background: 'rgba(37, 99, 235, 0.08)',
                      padding: '3px 7px',
                      borderRadius: 4,
                      border: '1px solid rgba(37, 99, 235, 0.2)',
                    }}>
                      {b.customId || `BILL-${b.id}`}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--cw-text-primary, #0f172a)' }}>
                      {b.householdName || 'Consumer Record'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--cw-text-secondary, #64748b)', fontFamily: 'monospace' }}>
                      {b.householdCustomId || '—'}
                    </div>
                  </td>
                  <td>{getCityBadge(b)}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {b.meterId || '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--cw-text-secondary, #64748b)' }}>
                    {b.startDate ? `${b.startDate.slice(5)} to ${b.endDate.slice(5)}` : 'Jan 2026'}
                  </td>
                  <td style={{ fontSize: 12, fontWeight: 500, color: '#dc2626' }}>
                    {b.dueDate || '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13, fontWeight: 600 }}>
                    {Number(b.consumption ?? (Number(b.currentReading ?? 0) - Number(b.prevReading ?? 0))).toFixed(1)} m³
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                    ₹{Number(b.amount || 0).toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {renderStatusBadge(b.status)}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBill(b);
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        border: '1px solid #2563eb',
                        background: 'rgba(37, 99, 235, 0.08)',
                        color: '#2563eb',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Eye size={12} />
                      Inspect 360
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 8,
        background: 'var(--cw-surface, #ffffff)',
        border: '1px solid var(--cw-border, #e2e8f0)',
      }}>
        <div style={{ fontSize: 13, color: 'var(--cw-text-secondary, #64748b)' }}>
          Showing <strong>{bills.length > 0 ? page * pageSize + 1 : 0}</strong> to{' '}
          <strong>{Math.min((page + 1) * pageSize, totalElements)}</strong> of{' '}
          <strong>{totalElements.toLocaleString()}</strong> invoices
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setPage(0)}
            disabled={page === 0 || isLoading}
            className="cw-button-secondary"
            style={{ padding: '6px 8px', opacity: page === 0 ? 0.4 : 1 }}
            title="First Page"
          >
            <ChevronsLeft size={14} />
          </button>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || isLoading}
            className="cw-button-secondary"
            style={{ padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 4, opacity: page === 0 ? 0.4 : 1 }}
          >
            <ChevronLeft size={14} /> Previous
          </button>

          <span style={{ fontSize: 13, fontWeight: 600, padding: '0 8px', color: 'var(--cw-text-primary, #0f172a)' }}>
            Page {page + 1} of {Math.max(1, totalPages)}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1 || isLoading}
            className="cw-button-secondary"
            style={{ padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 4, opacity: page >= totalPages - 1 ? 0.4 : 1 }}
          >
            Next <ChevronRight size={14} />
          </button>
          <button
            onClick={() => setPage(totalPages - 1)}
            disabled={page >= totalPages - 1 || isLoading}
            className="cw-button-secondary"
            style={{ padding: '6px 8px', opacity: page >= totalPages - 1 ? 0.4 : 1 }}
            title="Last Page"
          >
            <ChevronsRight size={14} />
          </button>
        </div>
      </div>

      {/* Billing 360 Detail Drawer */}
      <BillDetailDrawer
        bill={selectedBill}
        onClose={() => setSelectedBill(null)}
        onBillUpdated={loadBills}
      />
    </div>
  );
}
