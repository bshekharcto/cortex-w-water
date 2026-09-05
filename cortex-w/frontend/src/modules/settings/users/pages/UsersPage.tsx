import { ShieldCheck } from 'lucide-react';

export function UsersPage() {
  return (
    <div>
      <h2 className="cw-section-title">Users & Roles</h2>
      <div className="cw-surface" style={{ padding: 'var(--cw-card-padding)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <ShieldCheck size={20} />
          <h3 style={{ font: 'var(--cw-font-section-title)', margin: 0 }}>User Management</h3>
        </div>
        <p style={{ color: 'var(--cw-text-muted)' }}>
          Role-based access for Water_Dashboard (READ), Household (READ/WRITE), Billing (READ/WRITE), Map (READ/WRITE/DELETE).
          User list, role assignment, and permission visibility are Phase 6 deliverables.
        </p>
      </div>
    </div>
  );
}
