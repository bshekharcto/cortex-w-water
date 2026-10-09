interface DashboardLoaderProps {
  /** What is being loaded, e.g. "Loading dashboard…". */
  label?: string;
}

/**
 * The one loader of the Dashboard: shown instead of the cards and the table while a page's data is first loading,
 * so the cards and the table never show separate spinners of their own.
 */
export function DashboardLoader({ label = 'Loading dashboard…' }: DashboardLoaderProps) {
  return (
    <div
      className="cw-surface"
      role="status"
      aria-live="polite"
      style={{
        minHeight: 360,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        textAlign: 'center',
        padding: 32,
      }}
    >
      <div className="cw-spinner" style={{ width: 44, height: 44, borderWidth: 4 }} />
      <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--cw-text)' }}>{label}</div>
      <div style={{ fontSize: '0.85rem', color: 'var(--cw-text-muted)' }}>Getting the latest numbers for your areas</div>
    </div>
  );
}
