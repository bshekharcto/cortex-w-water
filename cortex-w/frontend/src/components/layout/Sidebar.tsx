import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { CORTEX_ICONS } from '@/theme/cortexTheme';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { canAccessPath } from '@/modules/auth/access';
import clsx from 'clsx';
import { ClientLogo, SidebarBrand } from './SidebarBrand';

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
      { label: 'Gateway Status', path: '/app/gis/gateway-status', icon: 'gatewayStatus' },
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
  const { pathname } = useLocation();
  const autoCollapsed = useRef(false);
  // The Network Explorer wants the room for the map: the menu tucks in when it opens (it can be expanded again) and comes
  // back when leaving, unless the user set it themselves.
  useEffect(() => {
    const onMap = pathname.startsWith('/app/gis/network');
    if (onMap && !collapsed && !autoCollapsed.current) {
      autoCollapsed.current = true;
      setCollapsed(true);
    } else if (!onMap && autoCollapsed.current) {
      autoCollapsed.current = false;
      setCollapsed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
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
      <button
        className="cw-sidebar-collapse-btn"
        onClick={() => {
          autoCollapsed.current = false; // a choice of the user's own
          setCollapsed((v) => !v);
        }}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
      <SidebarBrand collapsed={collapsed} />

      {/* Nav groups */}
      <nav className="cw-sidebar-nav">
        {NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((i) => canAccessPath(user, i.path)) }))
          .filter((group) => group.items.length > 0)
          .map((group) => (
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
          {/* collapsed: only the sign-out button is left in the footer */}
          {!collapsed && <ClientLogo size={32} />}
          {!collapsed && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="cw-sidebar-user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.displayName || 'Active User'}
              </div>
              <div className="cw-sidebar-user-role">{user?.role ?? ''}</div>
            </div>
          )}
          <button onClick={handleLogout} className="cw-sidebar-logout" aria-label="Sign out" title="Sign out / Logout">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
