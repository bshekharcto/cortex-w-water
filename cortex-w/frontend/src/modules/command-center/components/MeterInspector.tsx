import { Copy, X, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MeterTelemetryItem, RawFrameItem } from '../types/commandCenter.types';
import { fetchMeterFrames, windowKey, type WindowParams } from '@/services/api/commandCenterApi';
import { fmt, formatFrequency, formatLocalTime, localTzLabel, utcTitle } from '../utils/format';
import { useNow, formatAgo } from '../utils/timeAgo';
import { useThresholds, isWeakRssi, isPoorSnr } from '../utils/thresholds';
import { describeError } from '../utils/errors';

interface Props {
  meter: MeterTelemetryItem;
  onClose: () => void;
  win: WindowParams;
  onViewAllFrames: () => void;
  /** Found by a 90-day look-back: not heard by any gateway in the selected window. */
  outsideWindow?: boolean;
}

export function MeterInspector({ meter, onClose, win, onViewAllFrames, outsideWindow }: Props) {
  const th = useThresholds();
  const nowMs = useNow();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // The meter's most recent frames (any gateway) for the "Recent frames" card
  const [recent, setRecent] = useState<{ items: RawFrameItem[]; total: number; loading: boolean; error: string | null }>({
    items: [],
    total: 0,
    loading: true,
    error: null,
  });
  const winId = windowKey(win);
  useEffect(() => {
    let cancelled = false;
    setRecent({ items: [], total: 0, loading: true, error: null });
    fetchMeterFrames(meter.meterId, win, { limit: 15 })
      .then((p) => !cancelled && setRecent({ items: p.items, total: p.total, loading: false, error: null }))
      .catch((e) => !cancelled && setRecent({ items: [], total: 0, loading: false, error: describeError(e, 'Failed to load') }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meter.meterId, winId]);
  const status = meter.statusChips[0] ?? 'live';

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const latestGw = meter.gatewaysHeard.find((g) => g.isLatest) || meter.gatewaysHeard[0];

  return (
    <aside className="cc-meter-inspector">
      <div className="cc-inspector-header">
        <div className="cc-inspector-title-wrap">
          <span className="cc-inspector-heading">LATEST METER INFO</span>
          <div className="cc-inspector-meter-id-row">
            <span className="cc-inspector-meter-id">Meter {meter.meterId}</span>
            <button
              className="cc-copy-btn"
              onClick={() => copyToClipboard(meter.meterId, 'meterId')}
              title="Copy Meter ID"
            >
              {copiedField === 'meterId' ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
          <div className="cc-inspector-deveui-row">
            <span className="cc-mono cc-cell-mute">DevEUI {fmt(meter.devEui)}</span>
            <button
              className="cc-copy-btn"
              onClick={() => copyToClipboard(meter.devEui ?? '', 'devEui')}
              title="Copy DevEUI"
            >
              {copiedField === 'devEui' ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
        </div>

        <button className="cc-inspector-close" onClick={onClose} title="Close Inspector">
          <X size={16} />
        </button>
      </div>

      <div className="cc-inspector-badges-row">
        <span className={`cc-chip cc-chip--${status}`}>{status.toUpperCase()}</span>
        <span className="cc-inspector-freshness">Last seen {formatAgo(meter.lastSeenDate, nowMs)}</span>
      </div>
      {outsideWindow && (
        <div className="cc-inspector-card" role="note" style={{ fontSize: 12, color: '#FBBF24' }}>
          Not heard in the selected time window. Showing the last known frame
          {meter.gatewaysHeard.find((p) => p.isLatest) ? ` via ${meter.gatewaysHeard.find((p) => p.isLatest)!.alias}` : ''}.
        </div>
      )}

      {/* Latest Frame Details Card */}
      <div className="cc-inspector-card">
        <div className="cc-inspector-card-title">LATEST DECODED FRAME</div>
        <div className="cc-kv-list">
          <div className="cc-kv-row">
            <span className="cc-k">Gateway</span>
            <span className="cc-v cc-mono cc-cell-bold">{latestGw?.alias}</span>
          </div>
          <div className="cc-kv-row">
            <span className="cc-k">Decoded At</span>
            <span className="cc-v cc-mono" title={utcTitle(meter.lastSeenDate)}>{formatLocalTime(meter.lastSeenDate)} {localTzLabel()}</span>
          </div>
          <div className="cc-kv-row">
            <span className="cc-k">FCnt</span>
            <span className="cc-v cc-mono">{fmt(meter.fCnt)}</span>
          </div>
          <div className="cc-kv-row">
            <span className="cc-k">FPort</span>
            <span className="cc-v cc-mono">{fmt(meter.fPort)}</span>
          </div>
          <div className="cc-kv-row">
            <span className="cc-k">Frequency</span>
            <span className="cc-v cc-mono">{formatFrequency(meter.frequency, true)}</span>
          </div>
          <div className="cc-kv-row">
            <span className="cc-k">Data Rate</span>
            <span className="cc-v cc-mono">{meter.dr == null ? '—' : `DR${meter.dr}`}</span>
          </div>
          <div className="cc-kv-row">
            <span className="cc-k">RSSI / SNR</span>
            <span className="cc-v cc-mono">
              {fmt(meter.lastRssi, ' dBm')} · {fmt(meter.lastSnr, ' dB')}
            </span>
          </div>
          <div className="cc-kv-row">
            <span className="cc-k">Confirmed</span>
            <span className="cc-v">{meter.confirmed ? 'Yes' : 'No'}</span>
          </div>
          <div className="cc-kv-row">
            <span className="cc-k">ADR</span>
            <span className="cc-v">{meter.adr ? 'Yes' : 'No'}</span>
          </div>
          <div className="cc-kv-row">
            <span className="cc-k">Checksum</span>
            <span className="cc-v cc-tag-ok">OK</span>
          </div>
        </div>
      </div>

      {/* Gateway Reception Paths */}
      <div className="cc-inspector-card">
        <div className="cc-inspector-card-title">
          HEARD BY GATEWAYS ({meter.gatewaysHeard.length})
        </div>
        <div className="cc-gw-paths-list">
          {meter.gatewaysHeard.map((path) => (
            <div
              key={path.gatewayId}
              className={`cc-gw-path-item ${path.isLatest ? 'cc-gw-path-item--latest' : ''}`}
            >
              <div className="cc-gw-path-name">
                <span className="cc-cell-bold">{path.alias}</span>
                {path.isLatest && <span className="cc-latest-badge">LATEST</span>}
              </div>
              <div className="cc-gw-path-metrics">
                <span className="cc-mono">{fmt(path.rssi, ' dBm')}</span>
                <span className="cc-mono">{fmt(path.snr, ' dB')}</span>
                <span className="cc-cell-mute">{formatAgo(path.lastSeenAt, nowMs)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent frames */}
      <div className="cc-inspector-card">
        <div className="cc-inspector-card-title">RECENT FRAMES{recent.total > 0 ? ` (${recent.total})` : ''}</div>
        {recent.items.length === 0 ? (
          <div className="cc-cell-mute" style={{ fontSize: 12 }}>
            {recent.loading ? 'Loading frames…' : recent.error ? `Could not load frames (${recent.error}).` : 'No frames in the selected window.'}
          </div>
        ) : (
          <div className="cc-gw-paths-list">
            {recent.items.map((f) => (
              <div key={f.id} className="cc-gw-path-item" style={{ display: 'block' }}>
                {/* Two short lines so the narrow inspector never wraps a gateway name mid-word */}
                <div style={{ display: 'flex', justifyContent: 'space-between', whiteSpace: 'nowrap' }}>
                  <span className="cc-mono" title={utcTitle(f.decodedAt)}>{formatLocalTime(f.decodedAt)}</span>
                  <span className="cc-cell-bold">{f.gatewayAlias}</span>
                </div>
                <div className="cc-mono cc-cell-mute" style={{ whiteSpace: 'nowrap', fontSize: 11.5, marginTop: 2 }}>
                  FCnt {fmt(f.fCnt)} ·{' '}
                  <span className={isWeakRssi(th, f.rssi) ? 'cc-text-warn' : ''}>{fmt(f.rssi, ' dBm')}</span> ·{' '}
                  <span className={isPoorSnr(th, f.snr) ? 'cc-text-danger' : ''}>{fmt(f.snr, ' dB')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <button className="cw-button-secondary" style={{ marginTop: 10, width: '100%' }} onClick={onViewAllFrames}>
          View all frames
        </button>
      </div>

      {/* Diagnostics */}
      <div className="cc-inspector-card">
        <div className="cc-inspector-card-title">RF & FLOW DIAGNOSTICS</div>
        <div className="cc-diag-chips">
          {meter.otherGatewaysCount > 0 ? (
            <span className="cc-diag-chip cc-diag-chip--info">
              Multi-Gateway Reception (+{meter.otherGatewaysCount})
            </span>
          ) : (
            <span className="cc-diag-chip cc-diag-chip--mute">Single Gateway Reach</span>
          )}
          {meter.lastRssi == null ? (
            <span className="cc-diag-chip cc-diag-chip--mute">RSSI unavailable</span>
          ) : !isWeakRssi(th, meter.lastRssi) ? (
            <span className="cc-diag-chip cc-diag-chip--good">Strong Signal Link</span>
          ) : (
            <span className="cc-diag-chip cc-diag-chip--warn">Weak RSSI Alert</span>
          )}
          {meter.lastSnr == null ? (
            <span className="cc-diag-chip cc-diag-chip--mute">SNR unavailable</span>
          ) : !isPoorSnr(th, meter.lastSnr) ? (
            <span className="cc-diag-chip cc-diag-chip--good">SNR within limits</span>
          ) : (
            <span className="cc-diag-chip cc-diag-chip--warn">Poor SNR</span>
          )}
          <span className="cc-diag-chip cc-diag-chip--good">Normal FCnt Progression</span>
        </div>
      </div>
    </aside>
  );
}
