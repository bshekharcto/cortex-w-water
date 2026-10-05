import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { GatewayItem } from '../types/commandCenter.types';

interface Props {
  allGateways: GatewayItem[];
  hourlyActivity?: Array<{ hour: string; count: number }>;
}

export function GatewayTrafficChart({
  allGateways,
  hourlyActivity,
}: Props) {
  const chartData = useMemo(
    () => (hourlyActivity ?? []).map((h) => ({ time: h.hour, frames: h.count })),
    [hourlyActivity]
  );
  const totalObserved = allGateways.reduce((sum, gw) => sum + gw.uniqueMeters, 0);
  const topGateways = [...allGateways]
    .filter((gw) => gw.uniqueMeters > 0)
    .sort((a, b) => b.uniqueMeters - a.uniqueMeters)
    .slice(0, 6);

  const maxMeters = topGateways[0]?.uniqueMeters || 1;

  return (
    <div className="cc-traffic-view">
      {/* Chart 1: Hourly Uplink Activity */}
      <div className="cc-card cc-chart-card">
        <div className="cc-card-header">
          <span className="cc-card-title">
            UPLINK ACTIVITY (ALL GATEWAYS) — HOURLY
          </span>
          <div className="cc-chart-legend">
            <span className="cc-legend-item">
              <span className="cc-legend-dot cc-legend-dot--blue" /> frames
            </span>
          </div>
        </div>

        <div className="cc-chart-wrapper">
          {chartData.length === 0 ? (
            <div className="cc-card-meta" style={{ padding: 24, textAlign: 'center' }}>
              No hourly activity available.
            </div>
          ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
              <XAxis
                dataKey="time"
                stroke="#64748B"
                fontSize={10}
                tickLine={false}
                interval={3}
              />
              <YAxis stroke="#64748B" fontSize={10} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: '#0E1626',
                  borderColor: '#1E293B',
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#fff',
                }}
              />
              <Bar dataKey="frames" fill="#3B82F6" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Chart 2: Top Gateways Load Ranking */}
      <div className="cc-card cc-chart-card">
        <div className="cc-card-header">
          <span className="cc-card-title">TOP GATEWAYS — UNIQUE METERS</span>
          <span className="cc-card-meta">of {totalObserved.toLocaleString()} gateway-meter links</span>
        </div>

        <div className="cc-bars-container">
          {topGateways.map((gw) => {
            const pct = Math.round((gw.uniqueMeters / maxMeters) * 100);
            return (
              <div key={gw.gatewayId} className="cc-bar-row">
                <span className="cc-bar-label">
                  {gw.alias} ({gw.gatewayId.slice(0, 4)}...{gw.gatewayId.slice(-4)})
                </span>
                <div className="cc-bar-track">
                  <div className="cc-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="cc-bar-val">{gw.uniqueMeters}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
