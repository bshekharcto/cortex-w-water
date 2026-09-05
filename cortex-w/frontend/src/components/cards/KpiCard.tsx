import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

export interface KpiCardProps {
  icon: LucideIcon;
  iconTone?: 'primary' | 'green' | 'orange' | 'red' | 'blue' | 'purple' | 'teal';
  label: string;
  value: string;
  subtitle?: string;
  delta?: { direction: 'up' | 'down'; label: string };
  onClick?: () => void;
}

const TONE_VAR: Record<NonNullable<KpiCardProps['iconTone']>, string> = {
  primary: '--cw-primary',
  green: '--cw-green',
  orange: '--cw-orange',
  red: '--cw-red',
  blue: '--cw-blue',
  purple: '--cw-purple',
  teal: '--cw-teal',
};

export function KpiCard({ icon: Icon, iconTone = 'primary', label, value, subtitle, delta, onClick }: KpiCardProps) {
  const tone = TONE_VAR[iconTone];
  return (
    <div
      className={clsx('cw-surface', 'cw-kpi-card', onClick && 'cw-kpi-card--clickable')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="cw-kpi-icon" style={{ color: `var(${tone})`, background: `color-mix(in srgb, var(${tone}) 14%, transparent)` }}>
        <Icon size={18} strokeWidth={1.5} />
      </div>
      <div className="cw-kpi-value" style={{ font: 'var(--cw-font-kpi)' }}>{value}</div>
      <div className="cw-kpi-label">{label}</div>
      {subtitle && <div className="cw-kpi-subtitle">{subtitle}</div>}
      {delta && (
        <div className={clsx('cw-kpi-delta', delta.direction === 'up' ? 'cw-kpi-delta--up' : 'cw-kpi-delta--down')}>
          {delta.label}
        </div>
      )}
    </div>
  );
}
