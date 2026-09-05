import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { CORTEX_ICONS } from '@/theme/cortexTheme';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import clsx from 'clsx';

interface NavItem { label: string; path: string; icon: keyof typeof CORTEX_ICONS }
interface NavGroup { title: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'GLOBAL TOOLS',
    items: [
      { label: 'Dashboard', path: '/app/dashboard', icon: 'dashboard' },
      { label: 'Command Center', path: '/app/command-center', icon: 'commandCenter' },
    ],
  },
  {
    title: 'GIS',
    items: [
      { label: 'Network Explorer', path: '/app/gis/network', icon: 'networkExplorer' },
      { label: 'Gateway Placement', path: '/app/gis/gateway-placement', icon: 'gatewayPlacement' },
    ],
  },
  {
    title: 'CONSUMER',
    items: [
      { label: 'Households', path: '/app/consumer/households', icon: 'households' },
      { label: 'Billing', path: '/app/consumer/billing', icon: 'billing' },
    ],
  },
  {
    title: 'AI ANALYSIS',
    items: [
      { label: 'Alarms', path: '/app/ai/alarms', icon: 'alarms' },
      { label: 'Hydraulic Analysis', path: '/app/ai/hydraulic', icon: 'hydraulic' },
    ],
  },
  {
    title: 'ADMIN',
    items: [
      { label: 'Settings', path: '/app/settings', icon: 'settings' },
    ],
  },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <aside className={clsx('cw-sidebar', collapsed && 'cw-sidebar--collapsed')}>
      {/* Brand block */}
      <div className="cw-sidebar-brand">
        <div className="cw-sidebar-brand-mark">CW</div>
        {!collapsed && (
          <div>
            <div className="cw-sidebar-brand-name">Cortex-W</div>
            <div className="cw-sidebar-brand-sub">Water Intelligence</div>
          </div>
        )}
      </div>

      {/* Nav groups */}
      <nav className="cw-sidebar-nav">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="cw-sidebar-group">
            {!collapsed && <div className="cw-sidebar-group-title">{group.title}</div>}
            {group.items.map((item) => {
              const Icon = CORTEX_ICONS[item.icon];
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => clsx('cw-sidebar-link', isActive && 'cw-sidebar-link--active')}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={18} strokeWidth={1.5} />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom: user profile + logout + collapse toggle */}
      <div className="cw-sidebar-footer">
        <div className="cw-sidebar-user" title={user ? `${user.displayName} (${user.role})` : 'User Profile'}>
          <div className="cw-sidebar-avatar">{user?.displayName ? user.displayName[0].toUpperCase() : 'U'}</div>
          {!collapsed && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="cw-sidebar-user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.displayName || 'Active User'}
              </div>
              <div className="cw-sidebar-user-role">{user?.role || 'WatcoAdmin'}</div>
            </div>
          )}
          <button onClick={handleLogout} className="cw-sidebar-logout" aria-label="Sign out" title="Sign out / Logout">
            <LogOut size={16} />
          </button>
        </div>
        <button className="cw-sidebar-collapse-btn" onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
}
