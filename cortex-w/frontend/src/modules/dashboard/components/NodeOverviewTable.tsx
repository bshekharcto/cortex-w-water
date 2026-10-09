import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronRight as DrillIcon, LineChart, MapPinned } from 'lucide-react';
import { EmptyState } from '@/components/empty-state/EmptyState';
import { formatNumber } from '@/utils/number';
import type { NodeRow } from '../models/dashboardRows';
import { ConsumptionTrendDialog } from './ConsumptionTrendDialog';
import { BoundaryMapDialog } from './BoundaryMapDialog';

interface NodeOverviewTableProps {
  nodes: NodeRow[];
  isLoading?: boolean;
  onSelectNode: (node: NodeRow) => void;
}

type SortField = 'name' | 'totalDevices' | 'connected' | 'disconnected' | 'neverSeen' | 'yesterdayFlowM3' | 'todayFlowM3' | 'monthToDateFlowM3';

// Generic overview table for any level of the real site hierarchy — the
// same component renders the root list, a zone's children, a DMA's
// children, or whatever a future deeper level looks like, since a NodeRow
// carries no level-specific fields.
export function NodeOverviewTable({ nodes, isLoading, onSelectNode }: NodeOverviewTableProps) {
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [page, setPage] = useState<number>(0);
  const pageSize = 10;
  // the area whose consumption chart / boundary map is open
  const [trendNode, setTrendNode] = useState<NodeRow | null>(null);
  const [mapNode, setMapNode] = useState<NodeRow | null>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const sortedNodes = useMemo(() => {
    const list = [...nodes];
    // "Not in a sub-area" (id own-<site>) is not a real area: it always stays at the end, whatever the sort
    const isOwn = (n: { id: string }) => n.id.startsWith('own-');
    list.sort((a, b) => {
      if (isOwn(a) !== isOwn(b)) return isOwn(a) ? 1 : -1;
      let vA: any = sortField === 'name' ? a.name : a[sortField];
      let vB: any = sortField === 'name' ? b.name : b[sortField];
      if (typeof vA === 'string') {
        vA = vA.toLowerCase();
        vB = (vB as string).toLowerCase();
      }
      if (vA < vB) return sortAsc ? -1 : 1;
      if (vA > vB) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [nodes, sortField, sortAsc]);

  const totalPages = Math.ceil(sortedNodes.length / pageSize) || 1;
  const pagedNodes = useMemo(() => {
    const start = page * pageSize;
    return sortedNodes.slice(start, start + pageSize);
  }, [sortedNodes, page, pageSize]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.4, marginLeft: 4 }} />;
    return sortAsc ? <ChevronUp size={12} style={{ marginLeft: 4 }} /> : <ChevronDown size={12} style={{ marginLeft: 4 }} />;
  };

  if (isLoading) {
    return (
      <div className="cw-surface" style={{ padding: 32, textAlign: 'center' }}>
        <div className="cw-spinner" style={{ margin: '0 auto 12px auto' }} />
        <p style={{ color: 'var(--cw-text-muted)' }}>Loading area overview...</p>
      </div>
    );
  }

  if (nodes.length === 0) {
    return <EmptyState message="No records found for this area." />;
  }

  return (
    <section className="cw-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 className="cw-section-title" style={{ margin: 0 }}>Area Overview</h2>
        <span style={{ fontSize: '0.85rem', color: 'var(--cw-text-muted)' }}>
          Showing {sortedNodes.length} {sortedNodes.length === 1 ? 'area' : 'areas'}
        </span>
      </div>

      <div className="cw-surface cw-table-wrap">
        <table className="cw-table">
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>
                <div style={{ display: 'flex', alignItems: 'center' }}>Area {renderSortIcon('name')}</div>
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
              <th style={{ textAlign: 'center' }}>Actions</th>
              <th style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {pagedNodes.map((n) => {
              const connPct = n.totalDevices > 0 ? ((n.connected / n.totalDevices) * 100).toFixed(1) : '0';
              const discPct = n.totalDevices > 0 ? ((n.disconnected / n.totalDevices) * 100).toFixed(1) : '0';
              const neverPct = n.totalDevices > 0 ? ((n.neverSeen / n.totalDevices) * 100).toFixed(1) : '0';

              return (
                <tr
                  key={n.id}
                  className="cw-table-row--clickable"
                  onClick={() => onSelectNode(n)}
                  title={n.hasChildren ? `Drill down into ${n.name}` : `View meters in ${n.name}`}
                >
                  <td style={{ fontWeight: 600, color: 'var(--cw-primary)' }}>
                    {n.name}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumber(n.totalDevices)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--cw-green)' }}>
                    {formatNumber(n.connected)} <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>({connPct}%)</span>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--cw-orange)' }}>
                    {formatNumber(n.disconnected)} <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>({discPct}%)</span>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--cw-red)' }}>
                    {formatNumber(n.neverSeen)} <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>({neverPct}%)</span>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumber(n.yesterdayFlowM3)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumber(n.todayFlowM3)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumber(n.monthToDateFlowM3)}
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--cw-text-muted)' }}>
                    {n.dataLocalTime ? n.dataLocalTime.slice(11, 16) : n.dataTimestamp ? new Date(n.dataTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                   <div style={{ display: 'inline-flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                    <button
                      className="cw-icon-btn"
                      title="View consumption trend"
                      aria-label={`Consumption trend of ${n.name}`}
                      style={{ color: 'var(--cw-primary)', display: 'inline-flex' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTrendNode(n);
                      }}
                    >
                      <LineChart size={16} />
                    </button>
                    {/* the map shows zone / DMA boundaries: not for a top-level area, nor for "Not in a sub-area" */}
                    {n.parentId != null && !n.id.startsWith('own-') && (
                      <button
                        className="cw-icon-btn"
                        title="View boundary on map"
                        aria-label={`Boundary of ${n.name} on the map`}
                        style={{ color: 'var(--cw-primary)', display: 'inline-flex' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMapNode(n);
                        }}
                      >
                        <MapPinned size={16} />
                      </button>
                    )}
                   </div>
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--cw-text-muted)' }}>
                    <DrillIcon size={14} />
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

      {trendNode && (
        <ConsumptionTrendDialog nodeId={trendNode.id} nodeName={trendNode.name} onClose={() => setTrendNode(null)} />
      )}
      {mapNode && <BoundaryMapDialog nodeId={mapNode.id} nodeName={mapNode.name} onClose={() => setMapNode(null)} />}
    </section>
  );
}
