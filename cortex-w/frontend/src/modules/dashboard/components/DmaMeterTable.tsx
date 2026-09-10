import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, ArrowUpDown, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { EmptyState } from '@/components/empty-state/EmptyState';
import { StatusBadge } from '@/components/status/StatusBadge';
import { formatNumber } from '@/utils/number';
import type { MeterRow } from '../models/dashboardRows';

interface DmaMeterTableProps {
  meters: MeterRow[];
  isLoading?: boolean;
  onSelectMeter: (meter: MeterRow) => void;
}

type SortField =
  | 'deviceId'
  | 'meterId'
  | 'meterType'
  | 'consumerId'
  | 'consumerName'
  | 'meterSize'
  | 'totalizerM3'
  | 'latestReadingAt'
  | 'connectivityStatus';

export function DmaMeterTable({ meters, isLoading, onSelectMeter }: DmaMeterTableProps) {
  const [sortField, setSortField] = useState<SortField>('deviceId');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [page, setPage] = useState<number>(0);
  const pageSize = 15;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const sortedMeters = useMemo(() => {
    const list = [...meters];
    list.sort((a, b) => {
      let vA: any = a[sortField] ?? '';
      let vB: any = b[sortField] ?? '';
      if (typeof vA === 'string') {
        vA = vA.toLowerCase();
        vB = (vB as string).toLowerCase();
      }
      if (vA < vB) return sortAsc ? -1 : 1;
      if (vA > vB) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [meters, sortField, sortAsc]);

  const totalPages = Math.ceil(sortedMeters.length / pageSize) || 1;
  const pagedMeters = useMemo(() => {
    const start = page * pageSize;
    return sortedMeters.slice(start, start + pageSize);
  }, [sortedMeters, page, pageSize]);

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

  if (isLoading) {
    return (
      <div className="cw-surface" style={{ padding: 32, textAlign: 'center' }}>
        <div className="cw-spinner" style={{ margin: '0 auto 12px auto' }} />
        <p style={{ color: 'var(--cw-text-muted)' }}>Loading meter records...</p>
      </div>
    );
  }

  if (meters.length === 0) {
    return <EmptyState message="No meter devices matched your criteria for this DMA." />;
  }

  return (
    <section className="cw-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 className="cw-section-title" style={{ margin: 0 }}>Meter Records</h2>
        <span style={{ fontSize: '0.85rem', color: 'var(--cw-text-muted)' }}>
          Showing {sortedMeters.length} {sortedMeters.length === 1 ? 'meter' : 'meters'}
        </span>
      </div>

      <div className="cw-surface cw-table-wrap">
        <table className="cw-table">
          <thead>
            <tr>
              <th>Zone</th>
              <th>DMA</th>
              <th>Sub-DMA (1km Gateway Radius)</th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('deviceId')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Device ID {renderSortIcon('deviceId')}</div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('meterId')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Meter ID {renderSortIcon('meterId')}</div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('meterType')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Type {renderSortIcon('meterType')}</div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('consumerId')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Consumer ID {renderSortIcon('consumerId')}</div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('consumerName')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Consumer Name {renderSortIcon('consumerName')}</div>
              </th>
              <th>Address</th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('meterSize')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Size {renderSortIcon('meterSize')}</div>
              </th>
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
                key={m.deviceId}
                className="cw-table-row--clickable"
                onClick={() => onSelectMeter(m)}
                title={`Open 360° telemetry history for ${m.meterId || m.deviceId}`}
              >
                <td style={{ color: 'var(--cw-text-muted)', fontSize: '0.85rem' }}>{m.zoneName}</td>
                <td style={{ color: 'var(--cw-text-muted)', fontSize: '0.85rem' }}>{m.dmaName}</td>
                <td style={{ fontSize: '0.85rem' }}>
                  {m.subDmaName ? (
                    <div>
                      <span style={{ fontWeight: 500 }}>{m.subDmaName}</span>
                      {m.distanceMeters !== undefined && (
                        <span
                          style={{
                            display: 'block',
                            fontSize: '0.75rem',
                            color: m.isWithin1km ? 'var(--cw-green, #16a34a)' : 'var(--cw-text-muted)',
                          }}
                        >
                          {m.distanceMeters}m ({m.isWithin1km ? '≤1 km radius' : '>1 km nearest'})
                        </span>
                      )}
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
                <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--cw-primary)' }}>
                  {m.deviceId}
                </td>
                <td style={{ fontWeight: 600 }}>{m.meterId || '—'}</td>
                <td style={{ fontSize: '0.85rem' }}>{m.meterType || 'Domestic'}</td>
                <td style={{ fontSize: '0.85rem', color: 'var(--cw-text-muted)' }}>{m.consumerId || '—'}</td>
                <td style={{ fontWeight: 500 }}>{m.consumerName || '—'}</td>
                <td style={{ fontSize: '0.85rem', maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={m.address || '—'}>
                  {m.address || '—'}
                </td>
                <td style={{ fontSize: '0.85rem' }}>{m.meterSize || '15mm'}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {m.totalizerM3 !== undefined ? formatNumber(m.totalizerM3) : '—'}
                </td>
                <td style={{ fontSize: '0.85rem', color: 'var(--cw-text-muted)' }}>
                  {m.latestReadingAt ? new Date(m.latestReadingAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
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
            onClick={() => setPage((p) => Math.max(0, p - 1))}
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
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
