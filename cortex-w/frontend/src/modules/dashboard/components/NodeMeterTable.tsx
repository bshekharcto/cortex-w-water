import { ChevronDown, ChevronUp, ArrowUpDown, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { EmptyState } from '@/components/empty-state/EmptyState';
import { StatusBadge } from '@/components/status/StatusBadge';
import { formatNumber } from '@/utils/number';
import type { MeterRow } from '../models/dashboardRows';
import type { MeterSortField } from '../models/dashboardView';
import { formatDateTimeCell } from '../services/formatTimestamp';

interface NodeMeterTableProps {
  /** ONE page of meters, already searched / filtered / sorted by the server. */
  meters: MeterRow[];
  /** Meters matching the current search and status filter, across all pages. */
  total: number;
  page: number; // 0-based
  pageSize: number;
  sortField: MeterSortField;
  sortAsc: boolean;
  isLoading?: boolean;
  /** A new page / sort / search is loading; the current rows stay visible, dimmed. */
  isFetching?: boolean;
  onSort: (field: MeterSortField) => void;
  onPageChange: (page: number) => void;
  onSelectMeter: (meter: MeterRow) => void;
}

// Renders one server-side page of the meter list for whichever real leaf node
// the user has drilled into. The breadcrumb above already shows the full
// ancestor chain, so this table doesn't repeat "Zone"/"DMA" columns — those
// were tied to the old fixed 2-level model and don't generalize to arbitrary
// depth anyway. Sorting and paging happen on the server because a leaf (or
// "Others") can hold ~15,000 meters.
export function NodeMeterTable({
  meters,
  total,
  page,
  pageSize,
  sortField,
  sortAsc,
  isLoading,
  isFetching,
  onSort,
  onPageChange,
  onSelectMeter,
}: NodeMeterTableProps) {
  const totalPages = Math.ceil(total / pageSize) || 1;
  const currentPage = Math.min(page, totalPages - 1);

  const renderSortIcon = (field: MeterSortField) => {
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

  if (isLoading) {
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
        </span>
      </div>

      <div className="cw-surface cw-table-wrap" style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 120ms' }} aria-busy={isFetching}>
        <table className="cw-table">
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => onSort('devEui')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Dev EUI {renderSortIcon('devEui')}</div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => onSort('meterId')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Meter ID {renderSortIcon('meterId')}</div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => onSort('consumerId')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Consumer ID {renderSortIcon('consumerId')}</div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => onSort('consumerName')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Consumer Name {renderSortIcon('consumerName')}</div>
              </th>
              <th>Address</th>
              <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => onSort('totalizerM3')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>Totalizer (m³) {renderSortIcon('totalizerM3')}</div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => onSort('latestReadingAt')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Last Data {renderSortIcon('latestReadingAt')}</div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => onSort('connectivityStatus')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Status {renderSortIcon('connectivityStatus')}</div>
              </th>
              <th style={{ width: 50, textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {meters.map((m) => (
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
                  {m.totalizerM3 != null ? formatNumber(m.totalizerM3) : '—'}
                </td>
                <td style={{ fontSize: '0.85rem', color: 'var(--cw-text-muted)' }}>
                  {formatDateTimeCell(m.latestReadingAt)}
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
            disabled={currentPage === 0}
            onClick={() => onPageChange(Math.max(0, currentPage - 1))}
            style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <span style={{ fontSize: '0.85rem', color: 'var(--cw-text-muted)' }}>
            Page {currentPage + 1} of {totalPages}
          </span>
          <button
            className="cw-icon-btn"
            disabled={currentPage >= totalPages - 1}
            onClick={() => onPageChange(Math.min(totalPages - 1, currentPage + 1))}
            style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
