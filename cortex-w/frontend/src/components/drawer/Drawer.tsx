import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import clsx from 'clsx';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  width?: number;
}

export function Drawer({ open, onClose, title, subtitle, children, width = 420 }: DrawerProps) {
  return (
    <>
      {open && <div className="cw-drawer-overlay" onClick={onClose} />}
      <aside className={clsx('cw-drawer', open && 'cw-drawer--open')} style={{ width }}>
        <div className="cw-drawer-header">
          <div>
            <h2 className="cw-drawer-title">{title}</h2>
            {subtitle && <p className="cw-drawer-subtitle">{subtitle}</p>}
          </div>
          <button className="cw-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="cw-drawer-body">{children}</div>
      </aside>
    </>
  );
}
