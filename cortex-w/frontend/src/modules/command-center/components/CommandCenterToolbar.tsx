import { Activity, RefreshCw, Search } from 'lucide-react';
import { TimeWindow } from '../types/commandCenter.types';

interface Props {
  activeTab: 'Gateways' | 'Meters';
  onTabChange: (tab: 'Gateways' | 'Meters') => void;
  timeRange: TimeWindow;
  onTimeRangeChange: (range: TimeWindow) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRefresh: () => void;
  lastUpdatedText: string;
}

export function CommandCenterToolbar({
  activeTab,
  onTabChange,
  timeRange,
  onTimeRangeChange,
  searchQuery,
  onSearchChange,
  onRefresh,
  lastUpdatedText,
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

          <select className="cc-site-selector" defaultValue="6394">
            <option value="6394">Site: BHUBANESWAR (6394)</option>
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
            {(['1H', '6H', '24H', '7D', 'CUSTOM'] as TimeWindow[]).map((t) => (
              <button
                key={t}
                className={`cc-time-btn ${timeRange === t ? 'cc-time-btn--active' : ''}`}
                onClick={() => onTimeRangeChange(t)}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="cc-live-badge" title="Auto refresh active (every 30s)">
            <span className="cc-live-dot" />
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
