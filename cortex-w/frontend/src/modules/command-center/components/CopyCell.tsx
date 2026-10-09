import { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { copyText } from '../utils/clipboard';

interface Props {
  value: string | null | undefined;
  /** What the copy button is called for screen readers, e.g. "meter ID". */
  label: string;
  /** Show the copy button at all times (outside a table row there is no hover to reveal it). */
  alwaysVisible?: boolean;
}

/**
 * A table cell value with a copy button that appears on row hover or keyboard focus. It stops the click
 * from reaching the row, so copying never also selects the row. A failed copy is shown, not hidden.
 */
export function CopyCell({ value, label, alwaysVisible }: Props) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  if (!value) return <>—</>;

  const copy = async (e: React.SyntheticEvent) => {
    e.stopPropagation();
    setState((await copyText(value)) ? 'done' : 'failed');
    setTimeout(() => setState('idle'), 1500);
  };

  const title = state === 'failed' ? 'Copy failed' : state === 'done' ? 'Copied' : `Copy ${label}`;
  return (
    <span className="cc-copy-cell">
      <span title={value}>{value}</span>
      <button
        type="button"
        className="cc-copy-btn cc-copy-btn--inline"
        style={state !== 'idle' || alwaysVisible ? { opacity: 1 } : undefined}
        aria-label={title}
        title={title}
        onClick={copy}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {state === 'done' ? <Check size={12} /> : state === 'failed' ? <X size={12} /> : <Copy size={12} />}
      </button>
    </span>
  );
}
