import { MeterTelemetryItem } from '../types/commandCenter.types';
import { EmptyState } from '@/components/empty-state/EmptyState';

interface Props {
  gatewayAlias: string;
  meters: MeterTelemetryItem[];
}

interface Band {
  label: string;
  color: string;
  test: (v: number) => boolean;
}

const RSSI_BANDS: Band[] = [
  { label: 'Strong (>= -80 dBm)', color: '#10B981', test: (v) => v >= -80 },
  { label: 'Good (-81 to -90 dBm)', color: '#3B82F6', test: (v) => v < -80 && v >= -90 },
  { label: 'Weak (-91 to -100 dBm)', color: '#F59E0B', test: (v) => v < -90 && v >= -100 },
  { label: 'Critical (< -100 dBm)', color: '#EF4444', test: (v) => v < -100 },
];

const SNR_BANDS: Band[] = [
  { label: 'Excellent (>= 5 dB)', color: '#10B981', test: (v) => v >= 5 },
  { label: 'Good (0 to <5 dB)', color: '#3B82F6', test: (v) => v >= 0 && v < 5 },
  { label: 'Marginal (-10 to <0 dB)', color: '#F59E0B', test: (v) => v >= -10 && v < 0 },
  { label: 'Poor (< -10 dB)', color: '#EF4444', test: (v) => v < -10 },
];

function bucket(values: number[], bands: Band[]) {
  return bands.map((b) => {
    const count = values.filter(b.test).length;
    return { ...b, count, pct: values.length ? Math.round((count / values.length) * 100) : 0 };
  });
}

export function GatewayRadioHealth({ gatewayAlias, meters }: Props) {
  const rssi = meters.map((m) => m.lastRssi).filter((v) => Number.isFinite(v));
  const snr = meters.map((m) => m.lastSnr).filter((v) => Number.isFinite(v));

  if (meters.length === 0) {
    return <EmptyState message={`No meters have been heard through ${gatewayAlias} in this window.`} />;
  }

  const sections = [
    { title: 'RSSI', rows: bucket(rssi, RSSI_BANDS), total: rssi.length },
    { title: 'SNR', rows: bucket(snr, SNR_BANDS), total: snr.length },
  ];

  return (
    <div className="cc-radio-health-view">
      {sections.map((sec) => (
        <div key={sec.title} className="cc-card cc-chart-card">
          <div className="cc-card-header">
            <span className="cc-card-title">
              {sec.title} DISTRIBUTION — {gatewayAlias.toUpperCase()}
            </span>
            <span className="cc-card-meta">{sec.total} meters (latest frame)</span>
          </div>
          <div className="cc-bars-container">
            {sec.rows.map((b) => (
              <div key={b.label} className="cc-bar-row">
                <span className="cc-bar-label">{b.label}</span>
                <div className="cc-bar-track">
                  <div className="cc-bar-fill" style={{ width: `${b.pct}%`, backgroundColor: b.color }} />
                </div>
                <span className="cc-bar-val">{b.count}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
