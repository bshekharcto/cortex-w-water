import { ChevronDown, ChevronUp, ArrowUpDown, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { EmptyState } from '@/components/empty-state/EmptyState';
import { StatusBadge } from '@/components/status/StatusBadge';
import { formatNumber } from '@/utils/number';
import type { MeterRow } from '../models/dashboardRows';
import type { MeterSortField } from '../services/dashboardDataService';

interface NodeMeterTableProps {
  /** The page on screen: the server has already sorted, filtered and cut it. */
  meters: MeterRow[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  sort: { field: MeterSortField; dir: 'asc' | 'desc' };
  onSort: (field: MeterSortField) => void;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  onSelectMeter: (meter: MeterRow) => void;
  /** When the scheduler last updated the numbers, as a clock time at the site (HH:MM). */
  dataUpdatedAt?: string | null;
}

type SortField = MeterSortField;

// Renders the meter list for whichever real leaf node the user has drilled
// into. The breadcrumb above already shows the full ancestor chain, so this
// table doesn't repeat "Zone"/"DMA" columns — those were tied to the old
// fixed 2-level model and don't generalize to arbitrary depth anyway.
export function NodeMeterTable({
  meters,
  total,
  page,
  totalPages,
  pageSize: _pageSize,
  sort,
  onSort,
  onPageChange,
  isLoading,
  onSelectMeter,
  dataUpdatedAt,
}: NodeMeterTableProps) {
  // Sorting, search and paging are done by the server (missing values always come last, whichever way it is sorted).
  const handleSort = (field: SortField) => onSort(field);
  const pagedMeters = meters;
  const sortField = sort.field;
  const sortAsc = sort.dir === 'asc';

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.4, marginLeft: 4 }} />;
    return sortAsc ? <ChevronUp size={12} style={{ marginLeft: 4 }} /> : <ChevronDown size={12} style={{ marginLeft: 4 }} />;
  };

  const getBadgeStatus = (status: 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN'): string => {
    switch (status) {
      case 'CONNECTED':
        return 'Connected';
      case 'DISCONNECTED':
        return 'Disconnected';
      case 'NEVER_SEEN':
        return 'Never Seen';
      default:
        return 'Unknown';
    }
  };

  if (isLoading && meters.length === 0) {
    return (
      <div className="cw-surface" style={{ padding: 32, textAlign: 'center' }}>
        <div className="cw-spinner" style={{ margin: '0 auto 12px auto' }} />
        <p style={{ color: 'var(--cw-text-muted)' }}>Loading meter records...</p>
      </div>
    );
  }

  if (meters.length === 0) {
    return <EmptyState message="No meter devices matched your criteria for this area." />;
  }

  return (
    <section className="cw-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 className="cw-section-title" style={{ margin: 0 }}>Meter Records</h2>
        <span style={{ fontSize: '0.85rem', color: 'var(--cw-text-muted)' }}>
          Showing {total.toLocaleString()} {total === 1 ? 'meter' : 'meters'}
          {dataUpdatedAt && <> · Data updated {dataUpdatedAt} (refreshes every 15 minutes)</>}
        </span>
      </div>

      <div className="cw-surface cw-table-wrap" style={isLoading ? { opacity: 0.55, pointerEvents: 'none', transition: 'opacity 0.15s' } : undefined} aria-busy={isLoading}>
        <table className="cw-table cw-table--centered">
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('devEui')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Dev EUI {renderSortIcon('devEui')}</div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('meterId')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Meter ID {renderSortIcon('meterId')}</div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('consumerId')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Consumer ID {renderSortIcon('consumerId')}</div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('consumerName')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Consumer Name {renderSortIcon('consumerName')}</div>
              </th>
              <th>Address</th>
              <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('totalizerM3')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>Totalizer (m³) {renderSortIcon('totalizerM3')}</div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('latestReadingAt')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Last Data {renderSortIcon('latestReadingAt')}</div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('connectivityStatus')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Status {renderSortIcon('connectivityStatus')}</div>
              </th>
              <th style={{ width: 50, textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {pagedMeters.map((m) => (
              <tr
                key={m.meterId}
                className="cw-table-row--clickable"
                onClick={() => onSelectMeter(m)}
                title={`Open 360° telemetry history for ${m.meterId || m.devEui || 'this meter'}`}
              >
                <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--cw-primary)' }}>
                  {m.devEui || '—'}
                </td>
                <td style={{ fontWeight: 600 }}>{m.meterId || '—'}</td>
                <td style={{ fontSize: '0.85rem', color: 'var(--cw-text-muted)' }}>{m.consumerId || '—'}</td>
                <td style={{ fontWeight: 500 }}>{m.consumerName || '—'}</td>
                <td style={{ fontSize: '0.85rem', maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={m.address || '—'}>
                  {m.address || '—'}
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {m.totalizerM3 !== undefined ? formatNumber(m.totalizerM3) : '—'}
                </td>
                <td style={{ fontSize: '0.85rem', color: 'var(--cw-text-muted)' }}>
                  {m.latestReadingLocal ? m.latestReadingLocal.slice(11, 16) : m.latestReadingAt ? new Date(m.latestReadingAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                </td>
                <td>
                  <StatusBadge status={getBadgeStatus(m.connectivityStatus)} />
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    className="cw-icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectMeter(m);
                    }}
                    title="View Meter History Drawer"
                    style={{ padding: 4 }}
                  >
                    <Eye size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
          <button
            className="cw-icon-btn"
            disabled={page === 0}
            onClick={() => onPageChange(Math.max(0, page - 1))}
            style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <span style={{ fontSize: '0.85rem', color: 'var(--cw-text-muted)' }}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="cw-icon-btn"
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
            style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
