import { useEffect, useRef, useState } from 'react';
import { fetchRadioHealth, windowKey, type WindowParams } from '@/services/api/commandCenterApi';
import type { RadioHealthData, RadioMeterStat } from '../types/commandCenter.types';
import { describeError, isAbortError } from '../utils/errors';
import { formatFrequency } from '../utils/format';
import { useThresholds } from '../utils/thresholds';
import { EmptyState } from '@/components/empty-state/EmptyState';

interface Props {
  win: WindowParams;
  siteId: string;
  gateway: { gatewayId: string; alias: string };
  refreshToken?: string;
  onSelectMeter: (meterId: string) => void;
}

interface Band {
  label: string;
  color: string;
  count: number;
}

function Bars({ title, meta, rows }: { title: string; meta: string; rows: Band[] }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="cc-card cc-chart-card">
      <div className="cc-card-header">
        <span className="cc-card-title">{title}</span>
        <span className="cc-card-meta">{meta}</span>
      </div>
      <div className="cc-bars-container">
        {rows.map((b) => (
          <div key={b.label} className="cc-bar-row">
            <span className="cc-bar-label">{b.label}</span>
            <div className="cc-bar-track">
              <div className="cc-bar-fill" style={{ width: `${total ? Math.round((b.count / total) * 100) : 0}%`, backgroundColor: b.color }} />
            </div>
            <span className="cc-bar-val">{b.count.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MeterList({ title, rows, onSelect }: { title: string; rows: RadioMeterStat[]; onSelect: (id: string) => void }) {
  return (
    <div className="cc-card cc-chart-card">
      <div className="cc-card-header">
        <span className="cc-card-title">{title}</span>
        <span className="cc-card-meta">average over the window</span>
      </div>
      <table className="cc-telemetry-table">
        <thead>
          <tr>
            <th>Meter ID</th>
            <th>Avg RSSI</th>
            <th>Avg SNR</th>
            <th>Frames</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="cc-table-empty">
                No frames.
              </td>
            </tr>
          )}
          {rows.map((m) => (
            <tr
              key={m.meterId}
              className="cc-table-row"
              tabIndex={0}
              onClick={() => onSelect(m.meterId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(m.meterId);
                }
              }}
            >
              <td className="cc-mono cc-cell-bold">{m.meterId}</td>
              <td className="cc-mono">{m.avgRssi} dBm</td>
              <td className="cc-mono">{m.avgSnr == null ? '—' : `${m.avgSnr} dB`}</td>
              <td className="cc-mono">{m.frames.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const fmtN = (n: number | null | undefined, unit: string) => (n == null ? '—' : `${n} ${unit}`);

/**
 * Radio Health tab: link quality from the stored frames (not just each meter's latest), for the selected
 * gateway or everything in view. Bands come from the shared configuration.
 */
export function GatewayRadioHealth({ win, siteId, gateway, refreshToken, onSelectMeter }: Props) {
  const th = useThresholds();
  const [scope, setScope] = useState<'GATEWAY' | 'ALL'>('GATEWAY');
  const [data, setData] = useState<RadioHealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scopeKey = `${scope === 'GATEWAY' ? gateway.gatewayId : 'ALL'}|${siteId}|${windowKey(win)}`;
  const lastScope = useRef('');

  useEffect(() => {
    const ctrl = new AbortController();
    if (lastScope.current !== scopeKey) {
      lastScope.current = scopeKey;
      setData(null);
    }
    setError(null);
    fetchRadioHealth(win, { siteId, gatewayId: scope === 'GATEWAY' ? gateway.gatewayId : undefined }, ctrl.signal)
      .then(setData)
      .catch((e) => {
        if (!isAbortError(e)) setError(describeError(e, 'Failed to load radio health'));
      });
    return () => ctrl.abort();
  }, [scopeKey, refreshToken, win, siteId, scope, gateway.gatewayId]);

  const rb = th?.rssiBands;
  const sb = th?.snrBands;
  const title = scope === 'GATEWAY' ? gateway.alias.toUpperCase() : 'ALL GATEWAYS IN VIEW';

  const scopeSwitch = (
    <div className="cc-subfilter-bar">
      <span className="cc-subfilter-label">Radio health for {title}</span>
      <span className="cc-segment" role="group" aria-label="Scope">
        {(['GATEWAY', 'ALL'] as const).map((s) => (
          <button key={s} aria-pressed={scope === s} className={`cc-subfilter-chip ${scope === s ? 'cc-subfilter-chip--active' : ''}`} onClick={() => setScope(s)}>
            {s === 'GATEWAY' ? 'This gateway' : 'All gateways'}
          </button>
        ))}
      </span>
    </div>
  );

  if (error) {
    return (
      <div className="cc-radio-health-view">
        {scopeSwitch}
        <div className="cc-card-meta cc-card-alert" role="alert">
          Could not load radio health ({error})
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="cc-radio-health-view">
        {scopeSwitch}
        <div className="cc-skeleton-box" style={{ height: 260, width: '100%' }} aria-label="Loading radio health" />
      </div>
    );
  }
  if (data.totals.frames === 0) {
    return (
      <div className="cc-radio-health-view">
        {scopeSwitch}
        <EmptyState message="No frames for this selection in the chosen window." />
      </div>
    );
  }

  const pct = (n: number) => (data.totals.meters ? `${Math.round((n / data.totals.meters) * 100)}% of meters` : '');
  const rssiRows: Band[] = [
    { label: rb ? `Strong (≥ ${rb.strong} dBm)` : 'Strong', color: '#10B981', count: data.rssiBuckets.strong },
    { label: rb ? `Good (${rb.strong - 1} to ${rb.good} dBm)` : 'Good', color: '#3B82F6', count: data.rssiBuckets.good },
    { label: rb ? `Weak (${rb.good - 1} to ${rb.weak} dBm)` : 'Weak', color: '#F59E0B', count: data.rssiBuckets.weak },
    { label: rb ? `Very weak (< ${rb.weak} dBm)` : 'Very weak', color: '#EF4444', count: data.rssiBuckets.veryWeak },
  ];
  const snrRows: Band[] = [
    { label: sb ? `Excellent (≥ ${sb.excellent} dB)` : 'Excellent', color: '#10B981', count: data.snrBuckets.excellent },
    { label: sb ? `Good (${sb.good} to < ${sb.excellent} dB)` : 'Good', color: '#3B82F6', count: data.snrBuckets.good },
    { label: sb ? `Marginal (${sb.marginal} to < ${sb.good} dB)` : 'Marginal', color: '#F59E0B', count: data.snrBuckets.marginal },
    { label: sb ? `Poor (< ${sb.marginal} dB)` : 'Poor', color: '#EF4444', count: data.snrBuckets.poor },
  ];
  const drRows: Band[] = data.byDr.map((d) => ({ label: d.dr == null ? 'DR unknown' : `DR${d.dr}`, color: '#3B82F6', count: d.frames }));
  const freqRows: Band[] = data.byFrequency.map((f) => ({
    label: f.frequencyHz == null ? 'Frequency unknown' : `${formatFrequency(f.frequencyHz)} Hz`,
    color: '#38BDF8',
    count: f.frames,
  }));

  return (
    <div className="cc-radio-health-view">
      {scopeSwitch}

      <div className="cc-radio-tiles">
        <div className="cc-radio-tile">
          <div className="cc-radio-tile-label">Avg RSSI</div>
          <div className="cc-radio-tile-value">{fmtN(data.totals.avgRssi, 'dBm')}</div>
        </div>
        <div className="cc-radio-tile">
          <div className="cc-radio-tile-label">Avg SNR</div>
          <div className="cc-radio-tile-value">{fmtN(data.totals.avgSnr, 'dB')}</div>
        </div>
        <div className="cc-radio-tile">
          <div className="cc-radio-tile-label">Frames analysed</div>
          <div className="cc-radio-tile-value">{data.totals.frames.toLocaleString()}</div>
          <div className="cc-radio-tile-sub">from {data.totals.meters.toLocaleString()} meters</div>
        </div>
        <div className="cc-radio-tile" title="Meters whose latest frame had RSSI or SNR below the weak limits">
          <div className="cc-radio-tile-label">Weak-link meters</div>
          <div className="cc-radio-tile-value">{data.weakLinkMeters.toLocaleString()}</div>
          <div className="cc-radio-tile-sub">{pct(data.weakLinkMeters)}</div>
        </div>
        <div className="cc-radio-tile" title="Meters with two or more weak-RSSI frames in the window">
          <div className="cc-radio-tile-label">Repeatedly weak</div>
          <div className="cc-radio-tile-value">{data.repeatWeakMeters.toLocaleString()}</div>
          <div className="cc-radio-tile-sub">{pct(data.repeatWeakMeters)}</div>
        </div>
      </div>

      <div className="cc-radio-grid">
        <Bars title="RSSI DISTRIBUTION" meta={`${data.totals.frames.toLocaleString()} frames`} rows={rssiRows} />
        <Bars title="SNR DISTRIBUTION" meta={`${data.totals.frames.toLocaleString()} frames`} rows={snrRows} />
        <Bars title="FRAMES BY DATA RATE" meta="share of frames" rows={drRows} />
        <Bars title="FRAMES BY FREQUENCY" meta="Hz" rows={freqRows} />
        <MeterList title="STRONGEST METERS" rows={data.strongest} onSelect={onSelectMeter} />
        <MeterList title="WEAKEST METERS" rows={data.weakest} onSelect={onSelectMeter} />
      </div>
    </div>
  );
}
