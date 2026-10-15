import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, LineChart, MapPin } from 'lucide-react';
import clsx from 'clsx';
import type { GatewayConnectivity } from '@/services/api/gatewayStatusApi';
import {
  DASH,
  STATE_LABEL,
  fmtDateTime,
  fmtHeartbeats,
  fmtHm,
  fmtInt,
  fmtPercent,
  sortGateways,
  type SortDir,
  type SortKey,
} from '../gatewayStatusModel';
import { Pager } from './Pager';

interface GatewayStatusTableProps {
  rows: GatewayConnectivity[];
  onTimeline: (g: GatewayConnectivity) => void;
  onMap: (g: GatewayConnectivity) => void;
}

const COLUMNS: Array<{ key: SortKey; label: string; align?: 'left' }> = [
  { key: 'gatewayId', label: 'Gateway ID' },
  { key: 'status', label: 'Current Status' },
  { key: 'lastSeenAt', label: 'Last Seen At' },
  { key: 'uptime', label: 'Uptime %' },
  { key: 'onlineTime', label: 'Online Time' },
  { key: 'downtimeEvents', label: 'Downtime Events' },
  { key: 'heartbeats', label: 'Heartbeats (30 s)' },
];

const PAGE_SIZES = [10, 25, 50, 100];

/** The fleet table: sortable columns, paged, and the two actions of each gateway (its timeline and its place on the map). */
export function GatewayStatusTable({ rows, onTimeline, onMap }: GatewayStatusTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'gatewayId', dir: 'asc' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const sorted = useMemo(() => sortGateways(rows, sort.key, sort.dir), [rows, sort]);
  // A shorter list (a filter, another range) must not leave the table on a page that no longer exists.
  const lastPage = Math.max(0, Math.ceil(sorted.length / pageSize) - 1);
  useEffect(() => {
    if (page > lastPage) setPage(lastPage);
  }, [page, lastPage]);
  const visible = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <div className="cw-surface gs-table-card">
      <div className="cw-table-wrap">
        <table className="cw-table cw-table--centered gs-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button className="gs-th-btn" onClick={() => toggle(c.key)}>
                    {c.label}
                    {sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </button>
                </th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((g) => (
              <tr key={g.gatewayId}>
                <td className="gs-mono">{g.gatewayId}</td>
                <td>
                  <span className={clsx('gs-state', `gs-state--${g.status}`)}>
                    <span className="gs-dot" />
                    {STATE_LABEL[g.status]}
                  </span>
                </td>
                <td>{fmtDateTime(g.lastSeenAt)}</td>
                <td>{fmtPercent(g.uptimePercent)}</td>
                <td>{g.onlineSeconds == null ? DASH : `${fmtHm(g.onlineSeconds)} / ${fmtHm(g.observedSeconds)}`}</td>
                <td>{g.status === 'no-data' ? DASH : fmtInt(g.downtimeEvents)}</td>
                <td>{fmtHeartbeats(g)}</td>
                <td>
                  <div className="gs-actions">
                    <button className="cw-icon-btn gs-action" title="Connectivity timeline" aria-label={`Timeline of ${g.gatewayId}`} onClick={() => onTimeline(g)}>
                      <LineChart size={17} />
                    </button>
                    <button className="cw-icon-btn gs-action" title="Show on map" aria-label={`Map of ${g.gatewayId}`} onClick={() => onMap(g)}>
                      <MapPin size={17} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="gs-empty">No gateways match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager total={sorted.length} page={page} pageSize={pageSize} sizes={PAGE_SIZES} onPage={setPage} onPageSize={setPageSize} />
    </div>
  );
}
