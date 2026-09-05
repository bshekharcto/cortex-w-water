import { Inbox } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  message: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon: Icon = Inbox, message, action }: EmptyStateProps) {
  return (
    <div className="cw-empty-state">
      <Icon size={36} strokeWidth={1.2} />
      <p>{message}</p>
      {action && (
        <button className="cw-button-secondary" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
