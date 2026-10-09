import { useEffect, useState } from 'react';
import {
  fetchGatewayRadioHealth,
  GatewayRadioHealthData,
  GatewayScope,
} from '@/services/api/commandCenterApi';

interface Props {
  gatewayId: string;
  gatewayAlias: string;
  scope: GatewayScope;
}

const RSSI_BANDS = [
  { key: 'strong', label: 'Strong (>= -80 dBm)', color: '#10B981' },
  { key: 'good', label: 'Good (-81 to -90 dBm)', color: '#3B82F6' },
  { key: 'weak', label: 'Weak (-91 to -100 dBm)', color: '#F59E0B' },
  { key: 'critical', label: 'Critical (< -100 dBm)', color: '#EF4444' },
] as const;

const SNR_BANDS = [
  { key: 'excellent', label: 'Excellent (>= 5 dB)', color: '#10B981' },
  { key: 'good', label: 'Good (0 to <5 dB)', color: '#3B82F6' },
  { key: 'marginal', label: 'Marginal (-10 to <0 dB)', color: '#F59E0B' },
  { key: 'poor', label: 'Poor (< -10 dB)', color: '#EF4444' },
] as const;

export function GatewayRadioHealth({ gatewayId, gatewayAlias, scope }: Props) {
  const [data, setData] = useState<GatewayRadioHealthData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const customFrom = scope.custom?.from;
  const customTo = scope.custom?.to;
  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchGatewayRadioHealth(gatewayId, scope)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setState('ready');
      })
      .catch((err) => {
        console.warn('[GatewayRadioHealth] Could not load radio health:', err);
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
    // the scope object is rebuilt on every render; its fields are what matter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayId, scope.days, customFrom, customTo, scope.siteId]);

  const frames = data?.frames ?? 0;
  const meta = state === 'loading' ? 'loading…' : state === 'error' ? 'could not load' : `${frames.toLocaleString()} frames`;

  const renderBars = (bands: ReadonlyArray<{ key: string; label: string; color: string }>, counts?: Record<string, number>) => (
    <div className="cc-bars-container">
      {bands.map((b) => {
        const count = counts?.[b.key] ?? 0;
        const pct = frames > 0 ? Math.round((count / frames) * 100) : 0;
        return (
          <div key={b.key} className="cc-bar-row">
            <span className="cc-bar-label">{b.label}</span>
            <div className="cc-bar-track">
              <div className="cc-bar-fill" style={{ width: `${pct}%`, backgroundColor: b.color }} />
            </div>
            <span className="cc-bar-val">{count.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="cc-radio-health-view">
      <div className="cc-card cc-chart-card">
        <div className="cc-card-header">
          <span className="cc-card-title">RSSI DISTRIBUTION — {gatewayAlias.toUpperCase()}</span>
          <span className="cc-card-meta">{meta}</span>
        </div>
        {renderBars(RSSI_BANDS, data?.rssi)}
      </div>

      <div className="cc-card cc-chart-card">
        <div className="cc-card-header">
          <span className="cc-card-title">SNR DISTRIBUTION — {gatewayAlias.toUpperCase()}</span>
          <span className="cc-card-meta">{meta}</span>
        </div>
        {renderBars(SNR_BANDS, data?.snr)}
      </div>
    </div>
  );
}
