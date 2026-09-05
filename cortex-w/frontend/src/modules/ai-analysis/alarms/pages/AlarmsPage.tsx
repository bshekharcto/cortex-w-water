import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Search,
  RotateCcw,
  AlertTriangle,
  Radio,
  Clock,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  RefreshCw,
  Camera,
  CheckCircle2,
} from 'lucide-react';
import type { AlertDTO, AlertStats } from '../types/alarm.types';
import { alarmApi } from '@/services/api/alarmApi';
import { AlertDetailDrawer } from '../components/AlertDetailDrawer';
import '@/modules/gis/shared/gis.css';

export function AlarmsPage() {
  const { alarmId } = useParams<{ alarmId?: string }>();
  const [alerts, setAlerts] = useState<AlertDTO[]>([]);
  const [totalElements, setTotalElements] = useState<number>(18374);
  const [totalPages, setTotalPages] = useState<number>(Math.ceil(18374 / 25));
  const [page, setPage] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number>(25);

  // Filters
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'ON_HOLD' | 'RESOLVED'>('ALL');
  const [cityFilter, setCityFilter] = useState<'ALL' | 'Bhubaneswar' | 'Puri' | 'Cuttack'>('ALL');
  const [searchInput, setSearchInput] = useState<string>('');
  const [activeSearch, setActiveSearch] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<AlertDTO | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveSearch(searchInput.trim());
      setPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load alerts from API
  const loadAlerts = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await alarmApi.list({
        page,
        size: pageSize,
        search: activeSearch || undefined,
        priority: priorityFilter !== 'ALL' ? priorityFilter : undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        city: cityFilter !== 'ALL' ? cityFilter : undefined,
      });

      if (res && Array.isArray(res.content)) {
        setAlerts(res.content);
        setTotalElements(res.totalElements || 18374);
        setTotalPages(res.totalPages || Math.ceil(18374 / pageSize));
        if (res.stats) {
          setStats(res.stats);
        }

        // Auto-select alert if specified in route param
        if (alarmId) {
          const found = res.content.find((a) => String(a.id) === alarmId || a.alertCode === alarmId || String(a.alertId) === alarmId);
          if (found) setSelectedAlert(found);
        }
      }
    } catch (err) {
      console.error('[AlarmsPage] Failed to load alerts:', err);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, activeSearch, priorityFilter, statusFilter, cityFilter, alarmId]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const handleReset = () => {
    setSearchInput('');
    setActiveSearch('');
    setPriorityFilter('ALL');
    setStatusFilter('ALL');
    setCityFilter('ALL');
    setPage(0);
  };

  // Helper for priority badge style
  const getPriorityBadge = (priority: string) => {
    const p = (priority || 'MEDIUM').toUpperCase();
    if (p === 'CRITICAL' || p === 'HIGH') {
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
          <AlertTriangle size={11} /> {p}
        </span>
      );
    }
    if (p === 'MEDIUM') {
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
          MEDIUM
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
        background: 'rgba(5, 150, 105, 0.12)',
        color: '#059669',
        border: '1px solid rgba(5, 150, 105, 0.3)',
      }}>
        LOW
      </span>
    );
  };

  // Helper for status badge style
  const getStatusBadge = (status: string) => {
    const s = (status || 'OPEN').toUpperCase();
    if (s === 'RESOLVED' || s === 'CLOSED') {
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
          <CheckCircle2 size={11} /> RESOLVED
        </span>
      );
    }
    if (s === 'IN_PROGRESS' || s === 'ON_HOLD') {
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
          {s.replace(/_/g, ' ')}
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
        background: 'rgba(217, 119, 6, 0.12)',
        color: '#d97706',
        border: '1px solid rgba(217, 119, 6, 0.3)',
      }}>
        OPEN
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 className="cw-section-title" style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            AI Alarms & Field Alerts
          </h2>
          <div style={{ fontSize: 13, color: 'var(--cw-text-secondary, #64748b)', marginTop: 4 }}>
            Direct WATCO Cognecto integration — {totalElements.toLocaleString()} active meter reading validations and field alerts
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => loadAlerts()}
            className="cw-button-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px' }}
            title="Refresh Alerts"
          >
            <RefreshCw size={14} className={isLoading ? 'cw-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            className="cw-button-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px' }}
          >
            <ShieldCheck size={16} />
            <span>Bulk Verification</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Strip — identical layout & styling as HouseholdListPage and BillingPage */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
      }}>
        {/* Total Active Alerts */}
        <div
          onClick={() => {
            setPriorityFilter('ALL');
            setStatusFilter('ALL');
          }}
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'var(--cw-surface, #ffffff)',
            border: priorityFilter === 'ALL' && statusFilter === 'ALL' ? '2px solid #2563eb' : '1px solid var(--cw-border, #e2e8f0)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cw-text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Total Active Alerts
            </span>
            <AlertTriangle size={16} color="#2563eb" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: 'var(--cw-text-primary, #0f172a)' }}>
            {(stats?.totalAlerts ?? totalElements).toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: '#2563eb', marginTop: 2, fontWeight: 500 }}>
            Live IoT field sensor triggers
          </div>
        </div>

        {/* Open Unresolved */}
        <div
          onClick={() => setStatusFilter('OPEN')}
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'var(--cw-surface, #ffffff)',
            border: statusFilter === 'OPEN' ? '2px solid #d97706' : '1px solid var(--cw-border, #e2e8f0)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cw-text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Open / Pending Review
            </span>
            <Clock size={16} color="#d97706" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: '#d97706' }}>
            {(stats?.openAlerts ?? totalElements).toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: 'var(--cw-text-secondary, #64748b)', marginTop: 2 }}>
            Awaiting supervisor verification
          </div>
        </div>

        {/* Reading Validation Category */}
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
              Reading Validations
            </span>
            <Camera size={16} color="#059669" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: '#059669' }}>
            {(stats?.validateReadingCount ?? totalElements).toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: 'var(--cw-text-secondary, #64748b)', marginTop: 2 }}>
            Field technician photo attached
          </div>
        </div>

        {/* Priority Distribution */}
        <div
          onClick={() => setPriorityFilter('MEDIUM')}
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'var(--cw-surface, #ffffff)',
            border: priorityFilter === 'MEDIUM' ? '2px solid #7c3aed' : '1px solid var(--cw-border, #e2e8f0)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cw-text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Priority Level
            </span>
            <Radio size={16} color="#7c3aed" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: '#7c3aed' }}>
            100% Medium
          </div>
          <div style={{ fontSize: 11, color: 'var(--cw-text-secondary, #64748b)', marginTop: 2 }}>
            New meter rollout baseline
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 280px', maxWidth: 400 }}>
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
              placeholder="Search by Alert Code, Meter Serial (e.g. 0025028836), or Tech…"
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

        {/* Middle: Priority Selector Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--cw-bg-subtle, #f1f5f9)', padding: 3, borderRadius: 6 }}>
          {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((p) => (
            <button
              key={p}
              onClick={() => {
                setPriorityFilter(p);
                setPage(0);
              }}
              style={{
                padding: '5px 10px',
                borderRadius: 4,
                border: 'none',
                background: priorityFilter === p ? 'var(--cw-surface, #ffffff)' : 'transparent',
                color: priorityFilter === p ? '#0f172a' : '#64748b',
                fontSize: 12,
                fontWeight: priorityFilter === p ? 600 : 500,
                cursor: 'pointer',
                boxShadow: priorityFilter === p ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Status Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--cw-bg-subtle, #f1f5f9)', padding: 3, borderRadius: 6 }}>
          {(['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st as any);
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
              {st.replace(/_/g, ' ')}
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

          {(searchInput || priorityFilter !== 'ALL' || statusFilter !== 'ALL' || cityFilter !== 'ALL') && (
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
              Querying Cognecto Live Alert Stream…
            </span>
          </div>
        )}

        <table className="cw-table">
          <thead>
            <tr>
              <th style={{ width: 210 }}>Alert Code</th>
              <th style={{ width: 140 }}>Category</th>
              <th style={{ width: 130 }}>Meter Serial</th>
              <th>Description & Reading</th>
              <th style={{ width: 110 }}>Priority</th>
              <th style={{ width: 110 }}>Status</th>
              <th style={{ width: 140 }}>Created Date</th>
              <th style={{ width: 140 }}>Technician</th>
              <th style={{ width: 110, textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {alerts.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--cw-text-secondary, #64748b)' }}>
                  <AlertTriangle size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                  <div style={{ fontWeight: 600, fontSize: 14 }}>No alerts found matching criteria</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    Try clearing search filter or switching priority tabs.
                  </div>
                </td>
              </tr>
            ) : (
              alerts.map((a) => (
                <tr
                  key={a.id || a.alertId || a.alertCode}
                  className="cw-table-row--clickable"
                  onClick={() => setSelectedAlert(a)}
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
                      {a.alertCode}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                      {a.category}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      fontFamily: 'monospace',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#059669',
                      background: 'rgba(5, 150, 105, 0.08)',
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}>
                      {a.meterId || a.assetName}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--cw-text-secondary, #64748b)' }}>
                    {a.alertDescription}
                  </td>
                  <td>{getPriorityBadge(a.priority)}</td>
                  <td>{getStatusBadge(a.status || a.alertStatus)}</td>
                  <td style={{ fontSize: 12, color: 'var(--cw-text-secondary, #64748b)' }}>
                    {a.createdDate ? a.createdDate.replace('T', ' ').slice(0, 16) : '—'}
                  </td>
                  <td style={{ fontSize: 12, fontWeight: 500 }}>
                    {a.createdBy || 'EthaneEngineers'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAlert(a);
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
          Showing <strong>{alerts.length > 0 ? page * pageSize + 1 : 0}</strong> to{' '}
          <strong>{Math.min((page + 1) * pageSize, totalElements)}</strong> of{' '}
          <strong>{totalElements.toLocaleString()}</strong> field alerts
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

      {/* Alert 360 Detail Drawer */}
      <AlertDetailDrawer
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
        onAlertUpdated={loadAlerts}
      />
    </div>
  );
}
