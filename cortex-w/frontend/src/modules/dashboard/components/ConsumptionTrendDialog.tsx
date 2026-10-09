import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { BarChart3, Table2 } from 'lucide-react';
import { Dialog } from './Dialog';
import { fetchNodeTrend } from '../services/dashboardDataService';
import type { TrendMode, TrendPoint } from '../models/dashboardTrend';

interface ConsumptionTrendDialogProps {
  nodeId: string;
  nodeName: string;
  onClose: () => void;
}

const DAY_OPTIONS = [7, 14, 30, 60, 90];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const kl = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 2026-10-08 -> 08 Oct 2026, 2026-10 -> Oct 2026
function formatLabel(label: string, mode: TrendMode): string {
  const [y, m, d] = label.split('-');
  const month = MONTHS[Number(m) - 1] ?? m;
  return mode === 'MONTHLY' ? `${month} ${y}` : `${d} ${month} ${y}`;
}

function toggleStyle(active: boolean) {
  return {
    padding: '6px 14px',
    border: '1px solid var(--cw-border, #E2E8F0)',
    background: active ? 'var(--cw-primary, #2563EB)' : 'transparent',
    color: active ? '#fff' : 'inherit',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: '0.85rem',
  } as const;
}

// What the chart icon of an area opens: the water used under it, day by day or month by month, as a chart or a table.
export function ConsumptionTrendDialog({ nodeId, nodeName, onClose }: ConsumptionTrendDialogProps) {
  const [mode, setMode] = useState<TrendMode>('DAILY');
  const [days, setDays] = useState<number>(30);
  const [view, setView] = useState<'CHART' | 'TABLE'>('CHART');
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchNodeTrend(nodeId, mode, days)
      .then((res) => {
        if (cancelled) return;
        setPoints(res);
        setState('ready');
      })
      .catch((err) => {
        console.warn('[ConsumptionTrendDialog] Could not load the consumption trend:', err);
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId, mode, days]);

  const total = useMemo(() => points.reduce((sum, p) => sum + p.consumption, 0), [points]);
  const chartData = useMemo(
    () => points.map((p) => ({ ...p, shown: formatLabel(p.label, mode) })),
    [points, mode]
  );

  return (
    <Dialog title={`Consumption Trend — ${nodeName}`} onClose={onClose}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <div style={{ display: 'inline-flex' }}>
          <button style={{ ...toggleStyle(mode === 'DAILY'), borderRadius: '6px 0 0 6px' }} onClick={() => setMode('DAILY')}>
            Daily
          </button>
          <button style={{ ...toggleStyle(mode === 'MONTHLY'), borderRadius: '0 6px 6px 0' }} onClick={() => setMode('MONTHLY')}>
            Monthly
          </button>
        </div>

        {mode === 'DAILY' && (
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--cw-border, #E2E8F0)' }}
          >
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </select>
        )}

        <div style={{ display: 'inline-flex' }}>
          <button style={{ ...toggleStyle(view === 'CHART'), borderRadius: '6px 0 0 6px' }} onClick={() => setView('CHART')}>
            <BarChart3 size={14} /> Chart
          </button>
          <button style={{ ...toggleStyle(view === 'TABLE'), borderRadius: '0 6px 6px 0' }} onClick={() => setView('TABLE')}>
            <Table2 size={14} /> Table
          </button>
        </div>

        {state === 'ready' && (
          <div style={{ marginLeft: 'auto', fontSize: '0.9rem', color: 'var(--cw-text-muted)' }}>
            Total: <strong style={{ color: 'inherit' }}>{kl(total)} KL</strong> · {points.length}{' '}
            {mode === 'DAILY' ? 'day(s)' : 'month(s)'} of data
          </div>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {state === 'loading' && (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
            <div className="cw-spinner" />
          </div>
        )}
        {state === 'error' && (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--cw-red)' }}>
            The consumption trend could not be loaded. Please try again.
          </div>
        )}
        {state === 'ready' && points.length === 0 && (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--cw-text-muted)' }}>
            No consumption data found for this range.
          </div>
        )}

        {state === 'ready' && points.length > 0 && view === 'CHART' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="shown" fontSize={11} tickLine={false} minTickGap={18} />
              <YAxis fontSize={11} tickLine={false} tickFormatter={(v: number) => v.toLocaleString()} />
              <Tooltip
                formatter={(value: number) => [`${kl(value)} KL`, 'Consumption']}
                labelFormatter={(label: string) => label}
              />
              <Bar dataKey="consumption" fill="#2563EB" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {state === 'ready' && points.length > 0 && view === 'TABLE' && (
          <div style={{ height: '100%', overflow: 'auto' }} className="cw-table-wrap">
            <table className="cw-table">
              <thead>
                <tr>
                  <th>{mode === 'DAILY' ? 'Date' : 'Month'}</th>
                  <th style={{ textAlign: 'right' }}>Consumption (KL)</th>
                  <th style={{ textAlign: 'right' }}>Reading (KL)</th>
                </tr>
              </thead>
              <tbody>
                {[...points].reverse().map((p) => (
                  <tr key={p.label}>
                    <td>{formatLabel(p.label, mode)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{kl(p.consumption)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{kl(p.reading)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
}
