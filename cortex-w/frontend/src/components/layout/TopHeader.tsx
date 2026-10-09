import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, Clock } from 'lucide-react';
import { useDataFreshness } from './DataFreshness';

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
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close the notifications dialog on outside click or Escape
  useEffect(() => {
    if (!notifOpen) return;
    const onDown = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [notifOpen]);

  const isCommandCenter = pathname.startsWith('/app/command-center');
  // Match longest prefix for deep links (e.g. /app/consumer/households/123)
  const matchedPath = Object.keys(ROUTE_TITLES)
    .filter((r) => pathname.startsWith(r))
    .sort((a, b) => b.length - a.length)[0];
  const title = matchedPath ? ROUTE_TITLES[matchedPath] : 'Cortex-W';

  // when the scheduler last updated the numbers, as clock time at the site (HH:MM)
  const { localTime } = useDataFreshness();
  const updatedAt = localTime ? localTime.slice(11, 16) : null;

  return (
    <header className={`cw-top-header ${isCommandCenter ? 'cw-top-header--dark' : ''}`}>
      <div className="cw-top-header-left">
        <h1 className="cw-top-header-title">Cortex-W <span className="cw-top-header-sep">|</span> {title}</h1>
        <span className="cw-top-header-powered">POWERED BY COGNECTO</span>
      </div>
      <div className="cw-top-header-right">
        {updatedAt && (
          <span className="cw-data-updated" title="When the numbers were last updated. They update by themselves.">
            <Clock size={13} /> Last updated {updatedAt}
          </span>
        )}
        <div className="cw-notif-wrap" ref={notifRef}>
          <button
            className="cw-icon-btn"
            aria-label="Notifications"
            aria-haspopup="dialog"
            aria-expanded={notifOpen}
            onClick={() => setNotifOpen((o) => !o)}
          >
            <Bell size={16} />
          </button>
          {notifOpen && (
            <div className="cw-notif-dialog" role="dialog" aria-label="Notifications">
              <div className="cw-notif-dialog-title">Notifications</div>
              <p className="cw-notif-dialog-body">No notifications have been enabled.</p>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
