import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  RotateCcw,
  Building2,
  Users,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  RefreshCw,
  Plus,
} from 'lucide-react';
import type { HouseholdDTO } from '../types/household.types';
import { householdApi } from '@/services/api/householdApi';
import { HouseholdDetailDrawer } from '../components/HouseholdDetailDrawer';
import { StatusBadge } from '@/components/status/StatusBadge';
import '@/modules/gis/shared/gis.css';

// City distribution constants from live WATCO Cognecto database
const CITY_STATS = {
  total: 193125,
  bhubaneswar: 153957,
  puri: 37594,
  cuttack: 1034,
};

export function HouseholdListPage() {
  const [households, setHouseholds] = useState<HouseholdDTO[]>([]);
  const [totalElements, setTotalElements] = useState<number>(CITY_STATS.total);
  const [totalPages, setTotalPages] = useState<number>(Math.ceil(CITY_STATS.total / 25));
  const [page, setPage] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number>(25);
  const [cityFilter, setCityFilter] = useState<'ALL' | 'Bhubaneswar' | 'Puri' | 'Cuttack'>('ALL');
  const [searchInput, setSearchInput] = useState<string>('');
  const [activeSearch, setActiveSearch] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedHousehold, setSelectedHousehold] = useState<HouseholdDTO | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveSearch(searchInput.trim());
      setPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Load households from API
  const loadHouseholds = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await householdApi.list({
        page,
        size: pageSize,
        search: activeSearch || undefined,
        city: cityFilter !== 'ALL' ? cityFilter : undefined,
      });

      if (res && Array.isArray(res.content)) {
        setHouseholds(res.content);
        setTotalElements(res.totalElements || 0);
        setTotalPages(res.totalPages || 1);
      }
    } catch (err) {
      console.error('[HouseholdListPage] Failed to load households:', err);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, activeSearch, cityFilter]);

  useEffect(() => {
    loadHouseholds();
  }, [loadHouseholds]);

  const handleCityChange = (newCity: 'ALL' | 'Bhubaneswar' | 'Puri' | 'Cuttack') => {
    setCityFilter(newCity);
    setPage(0);
  };

  const handleReset = () => {
    setSearchInput('');
    setActiveSearch('');
    setCityFilter('ALL');
    setPage(0);
  };

  // Helper for city tag style
  const getCityBadge = (h: HouseholdDTO) => {
    const city = h.city || (h.customId?.includes('PRI') ? 'Puri' : h.customId?.includes('CTC') ? 'Cuttack' : 'Bhubaneswar');
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 className="cw-section-title" style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            Consumer Household Directory
          </h2>
          <div style={{ fontSize: 13, color: 'var(--cw-text-secondary, #64748b)', marginTop: 4 }}>
            Direct WATCO Cognecto integration — managing 193,125 registered household water connections
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => loadHouseholds()}
            className="cw-button-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px' }}
            title="Refresh Directory"
          >
            <RefreshCw size={14} className={isLoading ? 'cw-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            className="cw-button-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px' }}
          >
            <Plus size={16} />
            <span>Add Connection</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
      }}>
        {/* Total Connections */}
        <div
          onClick={() => handleCityChange('ALL')}
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'var(--cw-surface, #ffffff)',
            border: cityFilter === 'ALL' ? '2px solid #2563eb' : '1px solid var(--cw-border, #e2e8f0)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cw-text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              All Households
            </span>
            <Users size={16} color="#2563eb" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: 'var(--cw-text-primary, #0f172a)' }}>
            {CITY_STATS.total.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: '#16a34a', marginTop: 2, fontWeight: 500 }}>
            100% active state database
          </div>
        </div>

        {/* Bhubaneswar */}
        <div
          onClick={() => handleCityChange('Bhubaneswar')}
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'var(--cw-surface, #ffffff)',
            border: cityFilter === 'Bhubaneswar' ? '2px solid #2563eb' : '1px solid var(--cw-border, #e2e8f0)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cw-text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Bhubaneswar (BMC)
            </span>
            <Building2 size={16} color="#2563eb" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: '#2563eb' }}>
            {CITY_STATS.bhubaneswar.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: 'var(--cw-text-secondary, #64748b)', marginTop: 2 }}>
            79.7% of total state network
          </div>
        </div>

        {/* Puri */}
        <div
          onClick={() => handleCityChange('Puri')}
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'var(--cw-surface, #ffffff)',
            border: cityFilter === 'Puri' ? '2px solid #d97706' : '1px solid var(--cw-border, #e2e8f0)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cw-text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Puri (PRI)
            </span>
            <MapPin size={16} color="#d97706" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: '#d97706' }}>
            {CITY_STATS.puri.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: 'var(--cw-text-secondary, #64748b)', marginTop: 2 }}>
            19.5% (Drink-from-Tap city)
          </div>
        </div>

        {/* Cuttack */}
        <div
          onClick={() => handleCityChange('Cuttack')}
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'var(--cw-surface, #ffffff)',
            border: cityFilter === 'Cuttack' ? '2px solid #059669' : '1px solid var(--cw-border, #e2e8f0)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cw-text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Cuttack (CTC)
            </span>
            <MapPin size={16} color="#059669" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: '#059669' }}>
            {CITY_STATS.cuttack.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: 'var(--cw-text-secondary, #64748b)', marginTop: 2 }}>
            0.5% (DMA rollout phase)
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 300px', maxWidth: 450 }}>
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
              placeholder="Search by Consumer ID (e.g. WS/BMC/2260881), name, or phone…"
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

        {/* Middle: City Selector Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--cw-bg-subtle, #f1f5f9)', padding: 3, borderRadius: 6 }}>
          {(['ALL', 'Bhubaneswar', 'Puri', 'Cuttack'] as const).map((city) => (
            <button
              key={city}
              onClick={() => handleCityChange(city)}
              style={{
                padding: '5px 12px',
                borderRadius: 4,
                border: 'none',
                background: cityFilter === city ? 'var(--cw-surface, #ffffff)' : 'transparent',
                color: cityFilter === city ? 'var(--cw-text-primary, #0f172a)' : 'var(--cw-text-secondary, #64748b)',
                fontSize: 12,
                fontWeight: cityFilter === city ? 600 : 500,
                cursor: 'pointer',
                boxShadow: cityFilter === city ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.15s ease',
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

          {(searchInput || cityFilter !== 'ALL') && (
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
              Querying Cognecto Live Records…
            </span>
          </div>
        )}

        <table className="cw-table">
          <thead>
            <tr>
              <th style={{ width: 180 }}>Consumer ID</th>
              <th>Consumer Name</th>
              <th style={{ width: 120 }}>City</th>
              <th>Location / Ward</th>
              <th style={{ width: 120 }}>PIN Code</th>
              <th style={{ width: 130 }}>Mobile</th>
              <th style={{ width: 110 }}>Status</th>
              <th style={{ width: 110 }}>Registered</th>
              <th style={{ width: 110, textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {households.length === 0 && !isLoading ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--cw-text-secondary, #64748b)' }}>
                  <Users size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                  <div style={{ fontWeight: 600, fontSize: 14 }}>No household records found</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Try clearing search filter or switching city</div>
                </td>
              </tr>
            ) : (
              households.map((h) => (
                <tr
                  key={h.id || h.customId}
                  className="cw-table-row--clickable"
                  onClick={() => setSelectedHousehold(h)}
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
                      {h.customId || `HID-${h.id}`}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--cw-text-primary, #0f172a)' }}>
                    {h.name || 'Unnamed Consumer'}
                  </td>
                  <td>{getCityBadge(h)}</td>
                  <td style={{ fontSize: 12, color: 'var(--cw-text-secondary, #64748b)' }}>
                    {h.location || (h.ward ? `Ward ${h.ward}` : '—')}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--cw-text-secondary, #64748b)' }}>
                    {h.pinCode || '—'}
                  </td>
                  <td style={{ fontSize: 12, fontFamily: 'monospace' }}>
                    {h.mobile ? `${h.countryCode || '+91'} ${h.mobile}` : '—'}
                  </td>
                  <td>
                    <StatusBadge status={h.status === 'Active' ? 'Normal' : 'Warning'} />
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--cw-text-secondary, #64748b)' }}>
                    {h.registrationDate ? h.registrationDate.slice(0, 10) : '—'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedHousehold(h);
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
          Showing <strong>{households.length > 0 ? page * pageSize + 1 : 0}</strong> to{' '}
          <strong>{Math.min((page + 1) * pageSize, totalElements)}</strong> of{' '}
          <strong>{totalElements.toLocaleString()}</strong> households
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

      {/* Household 360 Detail Drawer */}
      <HouseholdDetailDrawer
        household={selectedHousehold}
        onClose={() => setSelectedHousehold(null)}
      />
    </div>
  );
}
