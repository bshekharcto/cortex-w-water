import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  height?: string;
}

// A plain modal: a dimmed backdrop, a titled panel, Escape or a click outside closes it.
export function Dialog({ title, onClose, children, width = '90vw', height = '80vh' }: DialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          height,
          maxWidth: '100vw',
          maxHeight: '100vh',
          background: 'var(--cw-surface, #fff)',
          border: '1px solid var(--cw-border, #E2E8F0)',
          borderRadius: 10,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--cw-border, #E2E8F0)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{title}</h2>
          <button className="cw-icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, padding: 18, display: 'flex', flexDirection: 'column' }}>{children}</div>
      </div>
    </div>
  );
}
