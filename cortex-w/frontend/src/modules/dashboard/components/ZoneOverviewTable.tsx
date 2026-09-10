import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState } from '@/components/empty-state/EmptyState';
import { formatNumber } from '@/utils/number';
import type { ZoneRow } from '../models/dashboardRows';

interface ZoneOverviewTableProps {
  zones: ZoneRow[];
  isLoading?: boolean;
}

type SortField = 'zoneName' | 'totalDevices' | 'connected' | 'disconnected' | 'neverSeen' | 'yesterdayFlowM3' | 'todayFlowM3' | 'monthToDateFlowM3';

export function ZoneOverviewTable({ zones, isLoading }: ZoneOverviewTableProps) {
  const nav = useNavigate();
  const [sortField, setSortField] = useState<SortField>('zoneName');
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

  const sortedZones = useMemo(() => {
    const list = [...zones];
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
  }, [zones, sortField, sortAsc]);

  const totalPages = Math.ceil(sortedZones.length / pageSize) || 1;
  const pagedZones = useMemo(() => {
    const start = page * pageSize;
    return sortedZones.slice(start, start + pageSize);
  }, [sortedZones, page, pageSize]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.4, marginLeft: 4 }} />;
    return sortAsc ? <ChevronUp size={12} style={{ marginLeft: 4 }} /> : <ChevronDown size={12} style={{ marginLeft: 4 }} />;
  };

  if (isLoading) {
    return (
      <div className="cw-surface" style={{ padding: 32, textAlign: 'center' }}>
        <div className="cw-spinner" style={{ margin: '0 auto 12px auto' }} />
        <p style={{ color: 'var(--cw-text-muted)' }}>Loading zone overview...</p>
      </div>
    );
  }

  if (zones.length === 0) {
    return <EmptyState message="No zone records match the current filter." />;
  }

  return (
    <section className="cw-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 className="cw-section-title" style={{ margin: 0 }}>Zone Overview</h2>
        <span style={{ fontSize: '0.85rem', color: 'var(--cw-text-muted)' }}>
          Showing {sortedZones.length} {sortedZones.length === 1 ? 'zone' : 'zones'}
        </span>
      </div>

      <div className="cw-surface cw-table-wrap">
        <table className="cw-table">
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('zoneName')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Zone {renderSortIcon('zoneName')}</div>
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
            {pagedZones.map((z) => {
              const connPct = z.totalDevices > 0 ? ((z.connected / z.totalDevices) * 100).toFixed(1) : '0';
              const discPct = z.totalDevices > 0 ? ((z.disconnected / z.totalDevices) * 100).toFixed(1) : '0';
              const neverPct = z.totalDevices > 0 ? ((z.neverSeen / z.totalDevices) * 100).toFixed(1) : '0';

              return (
                <tr
                  key={z.zoneId}
                  className="cw-table-row--clickable"
                  onClick={() => nav(`/app/dashboard/zone/${z.zoneId}`)}
                  title={`Drill down into ${z.zoneName}`}
                >
                  <td style={{ fontWeight: 600, color: 'var(--cw-primary)' }}>
                    {z.zoneName}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumber(z.totalDevices)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--cw-green)' }}>
                    {formatNumber(z.connected)} <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>({connPct}%)</span>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--cw-orange)' }}>
                    {formatNumber(z.disconnected)} <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>({discPct}%)</span>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--cw-red)' }}>
                    {formatNumber(z.neverSeen)} <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>({neverPct}%)</span>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumber(z.yesterdayFlowM3)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumber(z.todayFlowM3)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumber(z.monthToDateFlowM3)}
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--cw-text-muted)' }}>
                    {z.dataTimestamp ? new Date(z.dataTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live'}
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
