import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { GatewayItem } from '../types/commandCenter.types';

interface Props {
  gateways: GatewayItem[];
  selectedGatewayId: string | null;
  onSelectGateway: (id: string | null) => void;
  loading?: boolean;
}

export function GatewayRail({
  gateways,
  selectedGatewayId,
  onSelectGateway,
  loading,
}: Props) {
  const [filter, setFilter] = useState<'ALL' | 'REPORTING' | 'DEGRADED' | 'STALE' | 'NO_TRAFFIC'>('ALL');
  const [railSearch, setRailSearch] = useState('');

  const filteredList = useMemo(() => {
    return gateways.filter((gw) => {
      // Search
      if (railSearch) {
        const q = railSearch.toLowerCase();
        const match = gw.alias.toLowerCase().includes(q) || gw.gatewayId.toLowerCase().includes(q);
        if (!match) return false;
      }
      // Status filter
      if (filter === 'REPORTING') return gw.status === 'reporting';
      if (filter === 'DEGRADED') return gw.status === 'degraded';
      if (filter === 'STALE') return gw.status === 'stale';
      if (filter === 'NO_TRAFFIC') return gw.status === 'no-traffic';
      return true;
    });
  }, [gateways, filter, railSearch]);

  return (
    <div className="cc-gateway-rail">
      <div className="cc-rail-header">
        <div className="cc-rail-title-row">
          <span className="cc-rail-title">GATEWAYS</span>
          <span className="cc-rail-count">{loading && gateways.length === 0 ? 'Syncing...' : `${gateways.length} known`}</span>
        </div>

        <div className="cc-rail-search-box">
          <Search size={13} className="cc-rail-search-icon" />
          <input
            type="text"
            className="cc-rail-search-input"
            placeholder="Search gateway ID or alias..."
            value={railSearch}
            onChange={(e) => setRailSearch(e.target.value)}
          />
        </div>

        <div className="cc-rail-filters">
          {(['ALL', 'REPORTING', 'DEGRADED', 'STALE', 'NO_TRAFFIC'] as const).map((f) => (
            <button
              key={f}
              className={`cc-rail-filter-btn ${filter === f ? 'cc-rail-filter-btn--active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'NO_TRAFFIC' ? 'No Traffic' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="cc-rail-list">
        {loading && gateways.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="cc-rail-item" style={{ cursor: 'default' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="cc-skeleton-box" style={{ width: 70, height: 14 }} />
                  <span className="cc-skeleton-box" style={{ width: 45, height: 14, borderRadius: 4 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="cc-skeleton-box" style={{ width: 85, height: 11 }} />
                  <span className="cc-skeleton-box" style={{ width: 60, height: 11 }} />
                </div>
              </div>
            ))}
          </div>
        )}
        {filteredList.map((gw) => {
          const isSelected = selectedGatewayId === gw.gatewayId;
          const statusDotClass =
            gw.status === 'reporting'
              ? 'cc-dot--reporting'
              : gw.status === 'degraded'
              ? 'cc-dot--degraded'
              : gw.status === 'stale'
              ? 'cc-dot--stale'
              : 'cc-dot--no-traffic';

          return (
            <div
              key={gw.gatewayId}
              className={`cc-rail-item ${isSelected ? 'cc-rail-item--active' : ''}`}
              onClick={() => onSelectGateway(isSelected ? null : gw.gatewayId)}
            >
              <div className="cc-rail-item-top">
                <div className="cc-rail-item-name-group">
                  <span className={`cc-dot ${statusDotClass}`} />
                  <span className="cc-rail-item-alias">{gw.alias}</span>
                </div>
                {gw.status === 'reporting' && (
                  <span className="cc-badge cc-badge--fresh">{gw.lastFrameText}</span>
                )}
                {gw.status === 'degraded' && (
                  <span className="cc-badge cc-badge--warn">{gw.trendText}</span>
                )}
                {gw.status === 'stale' && (
                  <span className="cc-badge cc-badge--stale">{gw.lastFrameText}</span>
                )}
                {gw.status === 'no-traffic' && (
                  <span className="cc-badge cc-badge--mute">no traffic</span>
                )}
              </div>

              <div className="cc-rail-item-sub">
                <span className="cc-mono cc-eui-text">{gw.gatewayId}</span>
              </div>

              <div className="cc-rail-item-metrics">
                <span className="cc-metric-meters">
                  {gw.uniqueMeters} {gw.uniqueMeters === 1 ? 'meter' : 'meters'}
                </span>
                {gw.avgRssi !== 0 && (
                  <span className="cc-metric-radio">
                    RSSI {gw.avgRssi} · SNR {gw.avgSnr}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
