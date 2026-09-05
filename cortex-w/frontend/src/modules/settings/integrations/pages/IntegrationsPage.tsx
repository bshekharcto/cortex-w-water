import { Plug } from 'lucide-react';

export function IntegrationsPage() {
  return (
    <div>
      <h2 className="cw-section-title">Integrations</h2>
      <div className="cw-surface" style={{ padding: 'var(--cw-card-padding)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Plug size={20} />
          <h3 style={{ font: 'var(--cw-font-section-title)', margin: 0 }}>Connected Services</h3>
        </div>
        <p style={{ color: 'var(--cw-text-muted)' }}>
          API base URL, data-mode selection, Google Maps key configuration, and upstream backend connectivity status.
          No secrets are committed to source — all sensitive configuration is injected at runtime via environment variables (spec 41).
        </p>
      </div>
    </div>
  );
}
