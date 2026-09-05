import { NavLink } from 'react-router-dom';

export function SettingsPage() {
  return (
    <div>
      <h2 className="cw-section-title">Settings</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <NavLink to="/app/settings/general" className="cw-button-secondary">General</NavLink>
        <NavLink to="/app/settings/integrations" className="cw-button-secondary">Integrations</NavLink>
        <NavLink to="/app/settings/users" className="cw-button-secondary">Users & Roles</NavLink>
      </div>
      <div className="cw-surface" style={{ padding: 'var(--cw-card-padding)' }}>
        <h3 style={{ font: 'var(--cw-font-section-title)', marginBottom: 12 }}>General Configuration</h3>
        <p style={{ color: 'var(--cw-text-muted)' }}>Application-wide settings such as default site, timezone, and freshness thresholds. This view is the foundation shell — full configuration controls are a Phase 6 deliverable.</p>
      </div>
    </div>
  );
}
