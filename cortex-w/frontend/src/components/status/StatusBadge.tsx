import clsx from 'clsx';

export type StatusTone = 'positive' | 'warning' | 'negative' | 'neutral';

const TONE_CLASS: Record<StatusTone, string> = {
  positive: 'cw-badge--green',
  warning: 'cw-badge--orange',
  negative: 'cw-badge--red',
  neutral: 'cw-badge--muted',
};

/**
 * Central place mapping a domain status string to a tone + label, per the
 * "status labels must be textual, not color-only" rule (spec 35). Extend
 * STATUS_TONE_MAP rather than branching on strings in every component.
 */
export const STATUS_TONE_MAP: Record<string, StatusTone> = {
  Reporting: 'positive',
  Connected: 'positive',
  Disconnected: 'warning',
  Delayed: 'warning',
  Silent: 'negative',
  'Never Seen': 'negative',
  'Data Quality Issue': 'warning',
  Degraded: 'warning',
  'No Recent Traffic': 'negative',
  'No Data in Period': 'neutral',
  Normal: 'positive',
  Warning: 'warning',
  Abnormal: 'negative',
  Unknown: 'neutral',
  Paid: 'positive',
  Pending: 'warning',
  Overdue: 'negative',
  Open: 'negative',
  Acknowledged: 'warning',
  Assigned: 'warning',
  Resolved: 'positive',
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE_MAP[status] ?? 'neutral';
  return <span className={clsx('cw-badge', TONE_CLASS[tone])}>{status}</span>;
}
