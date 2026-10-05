import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { ScopeNode } from '../models/dashboardScope';

interface DashboardBreadcrumbProps {
  path: ScopeNode[]; // real root-to-current chain resolved from the live site tree
}

// Generic over depth — renders however many real ancestors the current node
// actually has, built from a URL path like /app/dashboard/6394/6942/6943.
export function DashboardBreadcrumb({ path }: DashboardBreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', color: 'var(--cw-text-muted)', flexWrap: 'wrap' }}>
        {path.length === 0 ? (
          <span style={{ fontWeight: 600, color: 'var(--cw-text)' }}>Dashboard</span>
        ) : (
          <Link
            to="/app/dashboard"
            style={{ color: 'var(--cw-primary)', textDecoration: 'none', fontWeight: 500 }}
          >
            Dashboard
          </Link>
        )}

        {path.map((node, idx) => {
          const isLast = idx === path.length - 1;
          const href = `/app/dashboard/${path.slice(0, idx + 1).map((n) => n.id).join('/')}`;
          return (
            <span key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ChevronRight size={14} style={{ opacity: 0.6 }} />
              {isLast ? (
                <span style={{ fontWeight: 600, color: 'var(--cw-text)' }}>{node.name}</span>
              ) : (
                <Link to={href} style={{ color: 'var(--cw-primary)', textDecoration: 'none', fontWeight: 500 }}>
                  {node.name}
                </Link>
              )}
            </span>
          );
        })}
      </div>
    </nav>
  );
}
