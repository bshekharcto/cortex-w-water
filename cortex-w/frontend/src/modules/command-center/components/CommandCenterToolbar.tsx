import { Activity, RefreshCw, Search } from 'lucide-react';
import { TimeWindow } from '../types/commandCenter.types';
import { useNow, formatAgo } from '../utils/timeAgo';

interface Props {
  activeTab: 'Gateways' | 'Meters';
  onTabChange: (tab: 'Gateways' | 'Meters') => void;
  timeRange: TimeWindow;
  onTimeRangeChange: (range: TimeWindow) => void;
  customRange: { from: string; to: string };
  onCustomRangeChange: (r: { from: string; to: string }) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  /** Inline feedback under the search box (no match, searching, look-back result…). */
  searchHint?: { kind: string; text?: string } | null;
  /** Why the custom date range can't be used; the page keeps showing the previous valid range. */
  rangeError?: string | null;
  onRefresh: () => void;
  /** When the data on screen was generated (server time), not when the browser fetched it. */
  lastUpdatedAt: string | null;
  isSyncing?: boolean;
  sites?: Array<{ id: string; name: string }>;
  selectedSiteId?: string;
  onSiteChange?: (siteId: string) => void;
  autoRefresh: boolean;
  onAutoRefreshChange: (on: boolean) => void;
  autoRefreshSeconds: number;
  /** Narrow screens: opens the gateway list drawer. */
  onToggleRail?: () => void;
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
  searchHint,
  rangeError,
  onRefresh,
  lastUpdatedAt,
  isSyncing,
  sites,
  selectedSiteId = 'ALL',
  onSiteChange,
  autoRefresh,
  onAutoRefreshChange,
  autoRefreshSeconds,
  onToggleRail,
}: Props) {
  const nowMs = useNow();
  const dataIsOld = !!lastUpdatedAt && nowMs - Date.parse(lastUpdatedAt) > 10 * 60 * 1000;
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

          <button className="cw-button-secondary cc-rail-toggle" onClick={onToggleRail} aria-label="Show the gateway list">
            Gateways ☰
          </button>

          <div className="cc-tab-group">
            <button
              aria-pressed={activeTab === 'Gateways'}
              className={`cc-tab-btn ${activeTab === 'Gateways' ? 'cc-tab-btn--active' : ''}`}
              onClick={() => onTabChange('Gateways')}
            >
              Gateways
            </button>
            <button
              aria-pressed={activeTab === 'Meters'}
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
            <div className="cc-search-field">
              <Search size={14} className="cc-search-icon" />
              <input
                type="text"
                className="cc-global-search"
                aria-label="Search meter ID, DevEUI or gateway"
                placeholder="Search Meter ID, DevEUI, or Gateway..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
            {searchHint?.text && (
              <div
                className={`cc-search-hint ${searchHint.kind === 'none' || searchHint.kind === 'error' ? 'cc-search-hint--warn' : ''}`}
                role="status"
              >
                {searchHint.text}
              </div>
            )}
          </div>

          <div className="cc-time-group">
            {(['1H', '6H', '24H', '7D', '30D', 'CUSTOM'] as TimeWindow[]).map((t) => (
              <button
                key={t}
                aria-pressed={timeRange === t}
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
                className="cc-global-search cc-date-input"
                value={customRange.from}
                max={customRange.to || undefined}
                onChange={(e) => onCustomRangeChange({ ...customRange, from: e.target.value })}
              />
              <input
                type="date"
                className="cc-global-search cc-date-input"
                value={customRange.to}
                min={customRange.from || undefined}
                onChange={(e) => onCustomRangeChange({ ...customRange, to: e.target.value })}
              />
              {rangeError && (
                <span className="cc-range-error" role="alert">
                  {rangeError}. Showing the previous range.
                </span>
              )}
            </div>
          )}

          <div
            className={`cc-sync-pill ${isSyncing ? '' : autoRefresh ? 'cc-sync-pill--live' : 'cc-sync-pill--paused'}`}
            title={
              isSyncing
                ? 'Fetching the latest data…'
                : autoRefresh
                ? `Refreshing automatically every ${autoRefreshSeconds}s`
                : 'Auto refresh is paused. Use the refresh button to update.'
            }
          >
            <span className="cc-sync-pulse-dot" />
            <span>{isSyncing ? 'Syncing stream...' : autoRefresh ? 'Live Feed' : 'Auto-refresh paused'}</span>
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

          <div
            className={`cc-live-badge ${dataIsOld ? 'cc-live-badge--stale' : ''}`}
            title={dataIsOld ? 'This data is more than 10 minutes old. Use the refresh button to update it.' : 'Age of the data on screen'}
          >
            <span>Updated {lastUpdatedAt ? formatAgo(lastUpdatedAt, nowMs) : '—'}</span>
          </div>

          <button className="cc-icon-btn" onClick={onRefresh} title="Manual Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
