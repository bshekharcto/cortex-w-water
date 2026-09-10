import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState } from '@/components/empty-state/EmptyState';
import { formatNumber } from '@/utils/number';
import type { DmaRow } from '../models/dashboardRows';

interface DmaOverviewTableProps {
  dmas: DmaRow[];
  zoneId: string;
  isLoading?: boolean;
}

type SortField = 'dmaName' | 'totalDevices' | 'connected' | 'disconnected' | 'neverSeen' | 'yesterdayFlowM3' | 'todayFlowM3' | 'monthToDateFlowM3';

export function DmaOverviewTable({ dmas, zoneId, isLoading }: DmaOverviewTableProps) {
  const nav = useNavigate();
  const [sortField, setSortField] = useState<SortField>('dmaName');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [page, setPage] = useState<number>(0);
  const pageSize = 10;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const sortedDmas = useMemo(() => {
    const list = [...dmas];
    list.sort((a, b) => {
      let vA = a[sortField];
      let vB = b[sortField];
      if (typeof vA === 'string') {
        vA = vA.toLowerCase();
        vB = (vB as string).toLowerCase();
      }
      if (vA < vB) return sortAsc ? -1 : 1;
      if (vA > vB) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [dmas, sortField, sortAsc]);

  const totalPages = Math.ceil(sortedDmas.length / pageSize) || 1;
  const pagedDmas = useMemo(() => {
    const start = page * pageSize;
    return sortedDmas.slice(start, start + pageSize);
  }, [sortedDmas, page, pageSize]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.4, marginLeft: 4 }} />;
    return sortAsc ? <ChevronUp size={12} style={{ marginLeft: 4 }} /> : <ChevronDown size={12} style={{ marginLeft: 4 }} />;
  };

  if (isLoading) {
    return (
      <div className="cw-surface" style={{ padding: 32, textAlign: 'center' }}>
        <div className="cw-spinner" style={{ margin: '0 auto 12px auto' }} />
        <p style={{ color: 'var(--cw-text-muted)' }}>Loading DMA overview...</p>
      </div>
    );
  }

  if (dmas.length === 0) {
    return <EmptyState message="No DMA records found for this zone." />;
  }

  return (
    <section className="cw-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 className="cw-section-title" style={{ margin: 0 }}>DMA Overview</h2>
        <span style={{ fontSize: '0.85rem', color: 'var(--cw-text-muted)' }}>
          Showing {sortedDmas.length} {sortedDmas.length === 1 ? 'DMA' : 'DMAs'}
        </span>
      </div>

      <div className="cw-surface cw-table-wrap">
        <table className="cw-table">
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('dmaName')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>DMA {renderSortIcon('dmaName')}</div>
              </th>
              <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('totalDevices')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>Devices {renderSortIcon('totalDevices')}</div>
              </th>
              <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('connected')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>Connected {renderSortIcon('connected')}</div>
              </th>
              <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('disconnected')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>Disconnected {renderSortIcon('disconnected')}</div>
              </th>
              <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('neverSeen')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>Never Seen {renderSortIcon('neverSeen')}</div>
              </th>
              <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('yesterdayFlowM3')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>Yesterday Flow (m³) {renderSortIcon('yesterdayFlowM3')}</div>
              </th>
              <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('todayFlowM3')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>Today's Flow (m³) {renderSortIcon('todayFlowM3')}</div>
              </th>
              <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('monthToDateFlowM3')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>Monthly Flow (m³) {renderSortIcon('monthToDateFlowM3')}</div>
              </th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {pagedDmas.map((d) => {
              const connPct = d.totalDevices > 0 ? ((d.connected / d.totalDevices) * 100).toFixed(1) : '0';
              const discPct = d.totalDevices > 0 ? ((d.disconnected / d.totalDevices) * 100).toFixed(1) : '0';
              const neverPct = d.totalDevices > 0 ? ((d.neverSeen / d.totalDevices) * 100).toFixed(1) : '0';

              return (
                <tr
                  key={d.dmaId}
                  className="cw-table-row--clickable"
                  onClick={() => nav(`/app/dashboard/zone/${zoneId}/dma/${d.dmaId}`)}
                  title={`Drill down into ${d.dmaName}`}
                >
                  <td style={{ fontWeight: 600, color: 'var(--cw-primary)' }}>
                    {d.dmaName}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumber(d.totalDevices)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--cw-green)' }}>
                    {formatNumber(d.connected)} <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>({connPct}%)</span>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--cw-orange)' }}>
                    {formatNumber(d.disconnected)} <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>({discPct}%)</span>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--cw-red)' }}>
                    {formatNumber(d.neverSeen)} <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>({neverPct}%)</span>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumber(d.yesterdayFlowM3)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumber(d.todayFlowM3)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumber(d.monthToDateFlowM3)}
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--cw-text-muted)' }}>
                    {d.dataTimestamp ? new Date(d.dataTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live'}
                  </td>
                </tr>
              );
            })}
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
