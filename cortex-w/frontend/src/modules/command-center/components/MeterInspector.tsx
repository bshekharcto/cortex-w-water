import { Copy, X, Check } from 'lucide-react';
import { useState } from 'react';
import { MeterTelemetryItem } from '../types/commandCenter.types';

interface Props {
  meter: MeterTelemetryItem;
  onClose: () => void;
}

export function MeterInspector({ meter, onClose }: Props) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

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
            <span className="cc-mono cc-cell-mute">DevEUI {meter.devEui}</span>
            <button
              className="cc-copy-btn"
              onClick={() => copyToClipboard(meter.devEui, 'devEui')}
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
        <span className="cc-chip cc-chip--live">LIVE</span>
        <span className="cc-inspector-freshness">Last seen {meter.frameAge}</span>
      </div>

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
            <span className="cc-v cc-mono">{meter.lastSeenDate.slice(11, 23)} UTC</span>
          </div>
          <div className="cc-kv-row">
            <span className="cc-k">FCnt</span>
            <span className="cc-v cc-mono">{meter.fCnt}</span>
          </div>
          <div className="cc-kv-row">
            <span className="cc-k">FPort</span>
            <span className="cc-v cc-mono">{meter.fPort}</span>
          </div>
          <div className="cc-kv-row">
            <span className="cc-k">Frequency</span>
            <span className="cc-v cc-mono">{meter.frequency} MHz</span>
          </div>
          <div className="cc-kv-row">
            <span className="cc-k">Data Rate</span>
            <span className="cc-v cc-mono">DR{meter.dr}</span>
          </div>
          <div className="cc-kv-row">
            <span className="cc-k">RSSI / SNR</span>
            <span className="cc-v cc-mono">
              {meter.lastRssi} dBm · {meter.lastSnr} dB
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
                <span className="cc-mono">{path.rssi} dBm</span>
                <span className="cc-mono">{path.snr} dB</span>
                <span className="cc-cell-mute">{path.lastSeenText}</span>
              </div>
            </div>
          ))}
        </div>
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
          {meter.lastRssi >= -95 ? (
            <span className="cc-diag-chip cc-diag-chip--good">Strong Signal Link</span>
          ) : (
            <span className="cc-diag-chip cc-diag-chip--warn">Weak RSSI Alert</span>
          )}
          {meter.lastSnr >= 0 ? (
            <span className="cc-diag-chip cc-diag-chip--good">Clean RF SNR</span>
          ) : (
            <span className="cc-diag-chip cc-diag-chip--warn">Marginal RF Noise</span>
          )}
          <span className="cc-diag-chip cc-diag-chip--good">Normal FCnt Progression</span>
        </div>
      </div>
    </aside>
  );
}
