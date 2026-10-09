import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchTraffic, windowKey, type WindowParams } from '@/services/api/commandCenterApi';
import type { GatewayItem, TrafficMetric, TrafficSeries } from '../types/commandCenter.types';
import { describeError, isAbortError } from '../utils/errors';
import { useThresholds, useWindowLabel } from '../utils/thresholds';
import { bucketSizeLabel, formatBucketTick, formatBucketTooltip, percentChange } from '../utils/trafficLabels';
import { EmptyState } from '@/components/empty-state/EmptyState';

interface Props {
  win: WindowParams;
  siteId: string;
  gateway: { gatewayId: string; alias: string };
  /** Used for the "top gateways" card. */
  allGateways: GatewayItem[];
  /** Changes whenever the page refreshes, so the chart follows it without a flash. */
  refreshToken?: string;
}

const COLORS = { bar: '#3B82F6', prev: '#94A3B8', grid: '#1E293B', axis: '#64748B' };

/**
 * Traffic tab: frames or distinct meters over time for the selected gateway (or everything in view), with the
 * previous equal period as a dashed line. Frame flow only: nothing here is water consumption.
 */
export function GatewayTrafficView({ win, siteId, gateway, allGateways, refreshToken }: Props) {
  const th = useThresholds();
  const windowLabel = useWindowLabel();
  const [scope, setScope] = useState<'GATEWAY' | 'ALL'>('GATEWAY');
  const [metric, setMetric] = useState<TrafficMetric>('frames');
  const [data, setData] = useState<TrafficSeries | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const scopeKey = `${scope === 'GATEWAY' ? gateway.gatewayId : 'ALL'}|${siteId}|${windowKey(win)}`;
  const lastScope = useRef('');

  useEffect(() => {
    const ctrl = new AbortController();
    if (lastScope.current !== scopeKey) {
      lastScope.current = scopeKey;
      setData(null); // a different scope/window starts clean; a plain refresh keeps the chart on screen
    }
    setLoading(true);
    setError(null);
    fetchTraffic(win, { siteId, gatewayId: scope === 'GATEWAY' ? gateway.gatewayId : undefined }, ctrl.signal)
      .then(setData)
      .catch((e) => {
        if (!isAbortError(e)) setError(describeError(e, 'Failed to load traffic'));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [scopeKey, refreshToken, win, siteId, scope, gateway.gatewayId]);

  const points = useMemo(
    () =>
      (data?.current ?? []).map((p, i) => ({
        t: p.t,
        value: p[metric],
        prev: data!.previous[i]?.[metric] ?? 0,
      })),
    [data, metric]
  );

  const curTotal = data ? (metric === 'frames' ? data.totals.frames : data.totals.meters) : 0;
  const prevTotal = data ? (metric === 'frames' ? data.totals.prevFrames : data.totals.prevMeters) : 0;
  const change = data?.comparable ? percentChange(curTotal, prevTotal) : null;
  // A drop is flagged only when trends are switched on (they are off until ingestion is complete)
  const dropPct = th?.trendsEnabled && change !== null && change <= -th.gatewayTrafficDropWarningPct ? Math.abs(change) : null;

  const topGateways = [...allGateways].filter((g) => g.uniqueMeters > 0).sort((a, b) => b.uniqueMeters - a.uniqueMeters).slice(0, 6);
  const maxMeters = topGateways[0]?.uniqueMeters || 1;
  const totalLinks = allGateways.reduce((s, g) => s + g.uniqueMeters, 0);
  const title = scope === 'GATEWAY' ? gateway.alias.toUpperCase() : 'ALL GATEWAYS IN VIEW';

  return (
    <div className="cc-traffic-view">
      <div className="cc-card cc-chart-card">
        <div className="cc-card-header">
          <span className="cc-card-title">
            {metric === 'frames' ? 'FRAMES STORED' : 'UNIQUE METERS HEARD'} ({title}) — {data ? bucketSizeLabel(data.bucket).toUpperCase() : '…'}, {windowLabel}
          </span>
          <div className="cc-chart-legend">
            <span className="cc-segment" role="group" aria-label="Metric">
              {(['frames', 'meters'] as const).map((m) => (
                <button key={m} aria-pressed={metric === m} className={`cc-subfilter-chip ${metric === m ? 'cc-subfilter-chip--active' : ''}`} onClick={() => setMetric(m)}>
                  {m === 'frames' ? 'Frames' : 'Unique meters'}
                </button>
              ))}
            </span>
            <span className="cc-segment" role="group" aria-label="Scope">
              {(['GATEWAY', 'ALL'] as const).map((s) => (
                <button key={s} aria-pressed={scope === s} className={`cc-subfilter-chip ${scope === s ? 'cc-subfilter-chip--active' : ''}`} onClick={() => setScope(s)}>
                  {s === 'GATEWAY' ? 'This gateway' : 'All gateways'}
                </button>
              ))}
            </span>
          </div>
        </div>

        {data && (
          <div className="cc-traffic-summary">
            <strong>{curTotal.toLocaleString()}</strong> {metric === 'frames' ? 'frames' : 'unique meters'}
            <span className="cc-cell-mute">
              {' '}
              · previous period {data.comparable ? prevTotal.toLocaleString() : 'not available (before the first stored day)'}
            </span>
            {dropPct !== null && <span className="cc-drop-chip">Traffic ↓ {dropPct}% vs previous period</span>}
          </div>
        )}

        <div className="cc-chart-wrapper">
          {error ? (
            <div className="cc-card-meta cc-card-alert" role="alert">
              Could not load traffic ({error})
            </div>
          ) : !data ? (
            <div className="cc-skeleton-box" style={{ height: 220, width: '100%' }} aria-label="Loading traffic" />
          ) : points.every((p) => p.value === 0 && p.prev === 0) ? (
            <EmptyState message="No frames for this selection in the chosen window." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={points} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="t" stroke={COLORS.axis} fontSize={10} tickLine={false} minTickGap={24} tickFormatter={(t: string) => formatBucketTick(t, data.bucket)} />
                <YAxis stroke={COLORS.axis} fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#0E1626', borderColor: '#1E293B', borderRadius: 6, fontSize: 12, color: '#fff' }}
                  labelFormatter={(t: string) => `${formatBucketTooltip(t, data.bucket)} (${data.tz})`}
                  formatter={(v: number, name: string) => [v.toLocaleString(), name === 'value' ? 'This period' : 'Previous period']}
                />
                <Bar dataKey="value" fill={COLORS.bar} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                {data.comparable && <Line dataKey="prev" type="linear" stroke={COLORS.prev} strokeDasharray="4 3" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="cc-chart-caption">
          Times in {data?.tz ?? 'India time'}
          {data?.comparable ? ' · dashed line = previous equal period' : ''}
          {' · '}
          {metric === 'frames'
            ? 'frames kept in Cortex (not the network’s true total yet), shown for reference'
            : 'distinct meters with a stored frame in each bucket'}
          {!th?.trendsEnabled && ' · change alerts are off until ingestion is complete'}
          {loading && data ? ' · updating…' : ''}
        </div>
      </div>

      <div className="cc-card cc-chart-card">
        <div className="cc-card-header">
          <span className="cc-card-title">TOP GATEWAYS — UNIQUE METERS</span>
          <span className="cc-card-meta">{totalLinks.toLocaleString()} gateway–meter links</span>
        </div>
        <div className="cc-bars-container">
          {topGateways.map((gw) => (
            <div key={gw.gatewayId} className="cc-bar-row">
              <span className="cc-bar-label">
                {gw.alias} ({gw.gatewayId.slice(0, 4)}...{gw.gatewayId.slice(-4)})
              </span>
              <div className="cc-bar-track">
                <div className="cc-bar-fill" style={{ width: `${Math.round((gw.uniqueMeters / maxMeters) * 100)}%` }} />
              </div>
              <span className="cc-bar-val">{gw.uniqueMeters}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
