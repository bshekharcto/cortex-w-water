import { NetworkKpiData } from '../types/commandCenter.types';
import { fmt } from '../utils/format';
import { useNow, formatAgo } from '../utils/timeAgo';
import { useWindowLabel } from '../utils/thresholds';

interface Props {
  kpis?: NetworkKpiData | null;
  loading?: boolean;
}

export function NetworkKpiStrip({ kpis, loading }: Props) {
  const windowLabel = useWindowLabel();
  const nowMs = useNow();
  if (loading && !kpis) {
    return (
      <div className="cc-kpi-grid">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="cc-kpi-card" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className="cc-skeleton-box" style={{ width: 8, height: 8, borderRadius: '50%' }} />
              <span className="cc-skeleton-box" style={{ width: '60%', height: 12 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span className="cc-skeleton-box" style={{ width: '45%', height: 24 }} />
              <span className="cc-skeleton-box" style={{ width: '25%', height: 12 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!kpis) return null;

  return (
    <div className="cc-kpi-grid">
      {/* KPI 1 */}
      <div className="cc-kpi-card">
        <div className="cc-kpi-top">
          <span className="cc-kpi-dot cc-kpi-dot--green" />
          <span className="cc-kpi-label">GATEWAYS WITH TRAFFIC</span>
        </div>
        <div className="cc-kpi-value-row">
          <span className="cc-kpi-val">{kpis.gatewaysWithTraffic}</span>
          <span className="cc-kpi-sub">/ {kpis.totalConfiguredGateways}</span>
        </div>
      </div>

      {/* KPI 2 */}
      <div className="cc-kpi-card">
        <div className="cc-kpi-top">
          <span className="cc-kpi-dot cc-kpi-dot--red" />
          <span className="cc-kpi-label">NO RECENT TRAFFIC</span>
        </div>
        <div className="cc-kpi-value-row">
          <span className="cc-kpi-val cc-kpi-val--danger">{kpis.noRecentTrafficGateways}</span>
          <span className="cc-kpi-sub cc-kpi-sub--danger">silent</span>
        </div>
      </div>

      {/* KPI 3 */}
      <div className="cc-kpi-card">
        <div className="cc-kpi-top">
          <span className="cc-kpi-dot cc-kpi-dot--blue" />
          <span className="cc-kpi-label">UNIQUE METERS SEEN</span>
        </div>
        <div className="cc-kpi-value-row">
          <span className="cc-kpi-val">{kpis.uniqueMetersSeen.toLocaleString()}</span>
        </div>
      </div>

      {/* KPI 5 */}
      <div className="cc-kpi-card">
        <div className="cc-kpi-top">
          <span className="cc-kpi-dot cc-kpi-dot--green" />
          <span className="cc-kpi-label">LAST NETWORK FRAME</span>
        </div>
        <div className="cc-kpi-value-row">
          <span className="cc-kpi-val cc-kpi-val--sm">{formatAgo(kpis.lastFrameAt, nowMs)}</span>
        </div>
      </div>

      {/* KPI 6 */}
      <div className="cc-kpi-card">
        <div className="cc-kpi-top">
          <span className="cc-kpi-dot cc-kpi-dot--purple" />
          <span className="cc-kpi-label">MULTI-GW METERS</span>
        </div>
        <div className="cc-kpi-value-row">
          <span className="cc-kpi-val">{kpis.multiGatewayMeters}</span>
          <span className="cc-kpi-sub">heard by &gt;1 GW</span>
        </div>
      </div>

      {/* KPI 7 & 8 */}
      <div className="cc-kpi-card">
        <div className="cc-kpi-top">
          <span className="cc-kpi-dot cc-kpi-dot--teal" />
          <span className="cc-kpi-label">AVG RSSI / SNR</span>
        </div>
        <div className="cc-kpi-value-row">
          <span className="cc-kpi-val cc-kpi-val--sm">{fmt(kpis.avgRssi)}</span>
          <span className="cc-kpi-unit">dBm</span>
          <span className="cc-kpi-sub">· {fmt(kpis.avgSnr, ' dB')}</span>
        </div>
      </div>

      {/* Frames stored: demoted. It is informational only: ingestion currently keeps part of each day and the
          stored days mix two data shapes, so it is neither the network's true total nor trendable. */}
      <div
        className="cc-kpi-card cc-kpi-card--muted"
        title="Frames kept in Cortex for this window. Not the network's true total yet (ingestion stores only part of each day), so it is not shown as a trend."
      >
        <div className="cc-kpi-top">
          <span className="cc-kpi-dot cc-kpi-dot--blue" />
          <span className="cc-kpi-label">FRAMES STORED ({windowLabel})</span>
        </div>
        <div className="cc-kpi-value-row">
          <span className="cc-kpi-val cc-kpi-val--sm">{kpis.framesReceived.toLocaleString()}</span>
        </div>
        <div className="cc-kpi-note">informational</div>
      </div>
    </div>
  );
}
