import { useLocation } from 'react-router-dom';
import { Bell, RefreshCw } from 'lucide-react';
import { runtimeConfig } from '@/config/runtimeConfig';

const ROUTE_TITLES: Record<string, string> = {
  '/app/dashboard': 'Dashboard',
  '/app/command-center': 'Command Center',
  '/app/gis/network': 'Network Explorer',
  '/app/gis/gateway-placement': 'Gateway Placement',
  '/app/consumer/households': 'Households',
  '/app/consumer/billing': 'Billing',
  '/app/ai/alarms': 'Alarms',
  '/app/ai/hydraulic': 'Hydraulic Analysis',
  '/app/settings': 'Settings',
  '/app/settings/integrations': 'Integrations',
  '/app/settings/users': 'Users & Roles',
  '/app/settings/general': 'General',
};

export function TopHeader() {
  const { pathname } = useLocation();
  const isCommandCenter = pathname.startsWith('/app/command-center');
  // Match longest prefix for deep links (e.g. /app/consumer/households/123)
  const matchedPath = Object.keys(ROUTE_TITLES)
    .filter((r) => pathname.startsWith(r))
    .sort((a, b) => b.length - a.length)[0];
  const title = matchedPath ? ROUTE_TITLES[matchedPath] : 'Cortex-W';

  const dataMode = runtimeConfig.APP_DATA_MODE;

  return (
    <header className={`cw-top-header ${isCommandCenter ? 'cw-top-header--dark' : ''}`}>
      <div className="cw-top-header-left">
        <h1 className="cw-top-header-title">Cortex-W <span className="cw-top-header-sep">|</span> {title}</h1>
        <span className="cw-top-header-powered">POWERED BY COGNECTO</span>
      </div>
      <div className="cw-top-header-right">
        <span className={`cw-data-badge cw-data-badge--${dataMode}`}>
          {dataMode === 'seed' ? 'SEED DATA' : dataMode === 'api' ? 'LIVE' : 'HYBRID'}
        </span>
        <button className="cw-icon-btn" aria-label="Refresh"><RefreshCw size={16} /></button>
        <button className="cw-icon-btn" aria-label="Notifications"><Bell size={16} /></button>
      </div>
    </header>
  );
}
