import { X } from 'lucide-react';
import { GatewayItem, GatewayTabType } from '../types/commandCenter.types';

interface Props {
  gateway: GatewayItem;
  activeTab: GatewayTabType;
  onTabChange: (tab: GatewayTabType) => void;
  onClearSelection: () => void;
}

export function SelectedGatewayHeader({
  gateway,
  activeTab,
  onTabChange,
  onClearSelection,
}: Props) {
  const statusBadge =
    gateway.status === 'reporting'
      ? 'cc-status-pill--green'
      : gateway.status === 'degraded'
      ? 'cc-status-pill--amber'
      : gateway.status === 'stale'
      ? 'cc-status-pill--orange'
      : 'cc-status-pill--gray';

  return (
    <div className="cc-selected-gw-header">
      <div className="cc-gw-header-top">
        <div className="cc-gw-title-group">
          <h2 className="cc-gw-title">{gateway.alias}</h2>
          <span className="cc-mono cc-gw-id">{gateway.gatewayId}</span>
          <span className={`cc-status-pill ${statusBadge}`}>
            {gateway.status.toUpperCase()}
          </span>
        </div>

        <button
          className="cc-close-gw-btn"
          onClick={onClearSelection}
          title="Return to All-Gateway Overview"
        >
          <X size={15} />
          <span>All Gateways</span>
        </button>
      </div>

      <div className="cc-gw-meta-row">
        <span className="cc-gw-meta-item">
          <strong>{gateway.uniqueMeters}</strong> unique meters
        </span>
        <span className="cc-gw-meta-sep">·</span>
        <span className="cc-gw-meta-item">
          <strong>{gateway.frameCount}</strong> frames (24h)
        </span>
        <span className="cc-gw-meta-sep">·</span>
        <span className="cc-gw-meta-item">
          Last frame: <strong>{gateway.lastFrameText}</strong>
        </span>
        {gateway.avgRssi !== 0 && (
          <>
            <span className="cc-gw-meta-sep">·</span>
            <span className="cc-gw-meta-item">
              Avg RSSI: <strong>{gateway.avgRssi} dBm</strong>
            </span>
            <span className="cc-gw-meta-sep">·</span>
            <span className="cc-gw-meta-item">
              Avg SNR: <strong>{gateway.avgSnr} dB</strong>
            </span>
          </>
        )}
      </div>

      <div className="cc-gw-tabs-row">
        {(
          [
            { key: 'METERS', label: 'Meters' },
            { key: 'FRAMES', label: 'Latest Frames' },
            { key: 'TRAFFIC', label: 'Traffic' },
            { key: 'RADIO', label: 'Radio Health' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            className={`cc-gw-tab ${activeTab === t.key ? 'cc-gw-tab--active' : ''}`}
            onClick={() => onTabChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
