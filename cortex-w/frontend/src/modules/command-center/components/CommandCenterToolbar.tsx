import { Activity, Search } from 'lucide-react';
import { TimeWindow } from '../types/commandCenter.types';
import { SiteTreeSelect } from './SiteTreeSelect';

interface Props {
  activeTab: 'Gateways' | 'Meters';
  onTabChange: (tab: 'Gateways' | 'Meters') => void;
  timeRange: TimeWindow;
  onTimeRangeChange: (range: TimeWindow) => void;
  customRange?: { from: string; to: string };
  maxDate?: string; // the last day that can be picked: today at the site
  onCustomRangeChange?: (range: { from: string; to: string }) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sites?: Array<{ id: string; name: string; parentId?: string | null }>;
  selectedSiteId?: string;
  onSiteChange?: (siteId: string) => void;
}

export function CommandCenterToolbar({
  activeTab,
  onTabChange,
  timeRange,
  onTimeRangeChange,
  customRange,
  maxDate,
  onCustomRangeChange,
  searchQuery,
  onSearchChange,
  sites,
  selectedSiteId = 'ALL',
  onSiteChange,
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

          <SiteTreeSelect sites={sites ?? []} value={selectedSiteId} onChange={(v) => onSiteChange?.(v)} />
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

          {timeRange === 'CUSTOM' && customRange && (
            <div className="cc-time-group" title="Up to 92 days">
              <input
                type="date"
                className="cc-time-btn"
                value={customRange.from}
                max={customRange.to}
                onChange={(e) => e.target.value && onCustomRangeChange?.({ ...customRange, from: e.target.value })}
              />
              <input
                type="date"
                className="cc-time-btn"
                value={customRange.to}
                min={customRange.from}
                max={maxDate}
                onChange={(e) => e.target.value && onCustomRangeChange?.({ ...customRange, to: e.target.value })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
