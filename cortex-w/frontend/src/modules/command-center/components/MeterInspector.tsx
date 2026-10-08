import { Copy, X, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MeterTelemetryItem, RawFrameItem } from '../types/commandCenter.types';
import { fetchMeterFrames, windowKey, type WindowParams } from '@/services/api/commandCenterApi';
import { fmt, formatFrequency, formatLocalTime, formatStatusByte, localTzLabel, utcTitle, yesNo } from '../utils/format';
import { useNow, formatAgo } from '../utils/timeAgo';
import { useThresholds, isWeakRssi, isPoorSnr } from '../utils/thresholds';
import { describeError, isAbortError } from '../utils/errors';
import { copyText } from '../utils/clipboard';
import { CopyCell } from './CopyCell';

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
    const ctrl = new AbortController();
    setRecent({ items: [], total: 0, loading: true, error: null });
    fetchMeterFrames(meter.meterId, win, { limit: 15, signal: ctrl.signal })
      .then((p) => setRecent({ items: p.items, total: p.total, loading: false, error: null }))
      .catch((e) => {
        if (isAbortError(e)) return;
        setRecent({ items: [], total: 0, loading: false, error: describeError(e, 'Failed to load') });
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meter.meterId, winId]);
  const status = meter.statusChips[0] ?? 'live';

  const copyToClipboard = async (text: string, field: string) => {
    // only claim "copied" when it really was
    if (!(await copyText(text))) return;
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
        <div className="cc-inspector-card cc-inspector-note" role="note">
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
            <span className="cc-v cc-mono cc-cell-bold">{latestGw?.alias ?? '—'}</span>
          </div>
          <div className="cc-kv-row">
            <span className="cc-k">Gateway ID</span>
            <span className="cc-v cc-mono">
              <CopyCell value={latestGw?.gatewayId} label="gateway ID" alwaysVisible />
            </span>
          </div>
          <div className="cc-kv-row">
            <span className="cc-k">Received</span>
            <span className="cc-v cc-mono" title={utcTitle(meter.lastSeenDate)}>{formatLocalTime(meter.lastSeenDate)} {localTzLabel()}</span>
          </div>
          <div className="cc-kv-row" title="The meter's own clock, as it reported it. Often wrong, so it is shown separately and never used to judge freshness.">
            <span className="cc-k">Meter clock</span>
            <span className="cc-v cc-mono cc-cell-mute">{fmt(meter.meterTimestamp)}</span>
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
            <span className="cc-v">{yesNo(meter.confirmed)}</span>
          </div>
          <div className="cc-kv-row">
            <span className="cc-k">ADR</span>
            <span className="cc-v">{yesNo(meter.adr)}</span>
          </div>
          <div className="cc-kv-row">
            <span className="cc-k">Checksum</span>
            <span className={`cc-v ${meter.checksumStatus === 'OK' ? 'cc-tag-ok' : meter.checksumStatus ? 'cc-text-danger' : ''}`}>{fmt(meter.checksumStatus)}</span>
          </div>
          <div className="cc-kv-row">
            <span className="cc-k">Status byte</span>
            <span className="cc-v cc-mono">{formatStatusByte(meter.statusByte)}</span>
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
          <div className="cc-cell-mute cc-inspector-muted">
            {recent.loading ? 'Loading frames…' : recent.error ? `Could not load frames (${recent.error}).` : 'No frames in the selected window.'}
          </div>
        ) : (
          <div className="cc-gw-paths-list">
            {recent.items.map((f) => (
              <div key={f.id} className="cc-gw-path-item cc-recent-row">
                {/* Two short lines so the narrow inspector never wraps a gateway name mid-word */}
                <div className="cc-recent-line">
                  <span className="cc-mono" title={utcTitle(f.decodedAt)}>{formatLocalTime(f.decodedAt)}</span>
                  <span className="cc-cell-bold">{f.gatewayAlias}</span>
                </div>
                <div className="cc-mono cc-cell-mute cc-recent-sub">
                  FCnt {fmt(f.fCnt)} ·{' '}
                  <span className={isWeakRssi(th, f.rssi) ? 'cc-text-warn' : ''}>{fmt(f.rssi, ' dBm')}</span> ·{' '}
                  <span className={isPoorSnr(th, f.snr) ? 'cc-text-danger' : ''}>{fmt(f.snr, ' dB')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <button className="cw-button-secondary cc-inspector-wide-btn" onClick={onViewAllFrames}>
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
            <span className="cc-diag-chip cc-diag-chip--good">
              {th && meter.lastRssi >= th.rssiBands.strong ? 'Strong Signal Link' : 'Signal within limits'}
            </span>
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
        </div>
      </div>
    </aside>
  );
}
