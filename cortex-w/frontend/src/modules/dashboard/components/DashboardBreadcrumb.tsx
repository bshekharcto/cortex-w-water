import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { DashboardScope } from '../models/dashboardScope';

interface DashboardBreadcrumbProps {
  scope: DashboardScope;
}

export function DashboardBreadcrumb({ scope }: DashboardBreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', color: 'var(--cw-text-muted)' }}>
        {scope.level === 'GLOBAL' && (
          <span style={{ fontWeight: 600, color: 'var(--cw-text)' }}>Dashboard</span>
        )}

        {scope.level === 'ZONE' && (
          <>
            <Link
              to="/app/dashboard"
              style={{ color: 'var(--cw-primary)', textDecoration: 'none', fontWeight: 500 }}
            >
              Dashboard
            </Link>
            <ChevronRight size={14} style={{ opacity: 0.6 }} />
            <span style={{ fontWeight: 600, color: 'var(--cw-text)' }}>{scope.zoneName}</span>
          </>
        )}

        {scope.level === 'DMA' && (
          <>
            <Link
              to="/app/dashboard"
              style={{ color: 'var(--cw-primary)', textDecoration: 'none', fontWeight: 500 }}
            >
              Dashboard
            </Link>
            <ChevronRight size={14} style={{ opacity: 0.6 }} />
            <Link
              to={`/app/dashboard/zone/${scope.zoneId}`}
              style={{ color: 'var(--cw-primary)', textDecoration: 'none', fontWeight: 500 }}
            >
              {scope.zoneName}
            </Link>
            <ChevronRight size={14} style={{ opacity: 0.6 }} />
            <span style={{ fontWeight: 600, color: 'var(--cw-text)' }}>{scope.dmaName}</span>
          </>
        )}
      </div>
    </nav>
  );
}
