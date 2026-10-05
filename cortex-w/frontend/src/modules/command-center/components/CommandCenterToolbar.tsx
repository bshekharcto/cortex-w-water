import { Activity, RefreshCw, Search } from 'lucide-react';
import { TimeWindow } from '../types/commandCenter.types';

interface Props {
  activeTab: 'Gateways' | 'Meters';
  onTabChange: (tab: 'Gateways' | 'Meters') => void;
  timeRange: TimeWindow;
  onTimeRangeChange: (range: TimeWindow) => void;
  customRange: { from: string; to: string };
  onCustomRangeChange: (r: { from: string; to: string }) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRefresh: () => void;
  lastUpdatedText: string;
  isSyncing?: boolean;
  sites?: Array<{ id: string; name: string }>;
  selectedSiteId?: string;
  onSiteChange?: (siteId: string) => void;
  autoRefresh: boolean;
  onAutoRefreshChange: (on: boolean) => void;
  autoRefreshSeconds: number;
}

export function CommandCenterToolbar({
  activeTab,
  onTabChange,
  timeRange,
  onTimeRangeChange,
  customRange,
  onCustomRangeChange,
  searchQuery,
  onSearchChange,
  onRefresh,
  lastUpdatedText,
  isSyncing,
  sites,
  selectedSiteId = 'ALL',
  onSiteChange,
  autoRefresh,
  onAutoRefreshChange,
  autoRefreshSeconds,
}: Props) {
  return (
    <div className="cc-toolbar-section">
      <div className="cc-breadcrumb-bar">
        <span className="cc-breadcrumb-parent">Operations</span>
        <span className="cc-breadcrumb-sep">&gt;</span>
        <span className="cc-breadcrumb-current">Command Center</span>
      </div>

      <div className="cc-header-bar">
        <div className="cc-header-left">
          <div className="cc-title-wrap">
            <Activity size={18} className="cc-pulse-icon" />
            <span>COMMAND CENTER</span>
          </div>

          <div className="cc-tab-group">
            <button
              className={`cc-tab-btn ${activeTab === 'Gateways' ? 'cc-tab-btn--active' : ''}`}
              onClick={() => onTabChange('Gateways')}
            >
              Gateways
            </button>
            <button
              className={`cc-tab-btn ${activeTab === 'Meters' ? 'cc-tab-btn--active' : ''}`}
              onClick={() => onTabChange('Meters')}
            >
              Meters
            </button>
          </div>

          <select
            className="cc-site-selector"
            value={selectedSiteId}
            onChange={(e) => onSiteChange?.(e.target.value)}
          >
            {(sites && sites.length > 0 ? sites : [{ id: 'ALL', name: 'All Sites' }]).map((s) => (
              <option key={s.id} value={s.id}>
                {s.id === 'ALL' ? 'All Sites (Fleet)' : `Site: ${s.name} (${s.id})`}
              </option>
            ))}
          </select>
        </div>

        <div className="cc-header-right">
          <div className="cc-search-wrap">
            <Search size={14} className="cc-search-icon" />
            <input
              type="text"
              className="cc-global-search"
              placeholder="Search Meter ID, DevEUI, or Gateway..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          <div className="cc-time-group">
            {(['1H', '6H', '24H', '7D', '30D', 'CUSTOM'] as TimeWindow[]).map((t) => (
              <button
                key={t}
                className={`cc-time-btn ${timeRange === t ? 'cc-time-btn--active' : ''}`}
                onClick={() => onTimeRangeChange(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {timeRange === 'CUSTOM' && (
            <div className="cc-time-group" title="Custom range (UTC dates, max 90 days)">
              <input
                type="date"
                className="cc-global-search"
                style={{ width: 130 }}
                value={customRange.from}
                max={customRange.to || undefined}
                onChange={(e) => onCustomRangeChange({ ...customRange, from: e.target.value })}
              />
              <input
                type="date"
                className="cc-global-search"
                style={{ width: 130 }}
                value={customRange.to}
                min={customRange.from || undefined}
                onChange={(e) => onCustomRangeChange({ ...customRange, to: e.target.value })}
              />
            </div>
          )}

          <div
            className={`cc-sync-pill ${isSyncing ? '' : 'cc-sync-pill--live'}`}
            title={isSyncing ? 'Synchronizing upstream telemetry stream...' : 'Live stream active'}
          >
            <span className="cc-sync-pulse-dot" />
            <span>{isSyncing ? 'Syncing stream...' : 'Live Feed'}</span>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={autoRefresh}
            className={`cc-live-badge cc-live-badge--toggle ${autoRefresh ? '' : 'cc-live-badge--off'}`}
            onClick={() => onAutoRefreshChange(!autoRefresh)}
            title={
              autoRefresh
                ? `Auto refresh ON (every ${autoRefreshSeconds}s). Click to pause.`
                : 'Auto refresh OFF. Click to resume.'
            }
          >
            <span className="cc-live-dot" />
            <span>Auto {autoRefresh ? 'ON' : 'OFF'}</span>
          </button>

          <div className="cc-live-badge" title="Time since the last successful refresh">
            <span>Updated {lastUpdatedText}</span>
          </div>

          <button className="cc-icon-btn" onClick={onRefresh} title="Manual Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
