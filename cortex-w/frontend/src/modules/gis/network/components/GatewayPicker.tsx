import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { NetGateway } from '@/services/api/networkApi';
import { gatewayLabel } from '../networkModel';

interface Props {
  gateways: NetGateway[];
  /** 'ALL' or a gateway id */
  value: string;
  onChange: (gatewayId: string) => void;
}

/** One entry per gateway: its id and its name together, "id · name" (just the id when it has no separate name). */
export function gatewayEntry(g: NetGateway): { id: string; name: string | null } {
  const label = gatewayLabel(g);
  return { id: g.gatewayId, name: label.toLowerCase() === g.gatewayId.toLowerCase() ? null : label };
}

/** The gateway filter: a searchable, scrollable list in which every gateway shows its id and its name in a single entry. */
export function GatewayPicker({ gateways, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement | null>(null);

  const entries = useMemo(() => gateways.map((g) => ({ g, ...gatewayEntry(g) })), [gateways]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? entries.filter((e) => e.id.toLowerCase().includes(q) || (e.name ?? '').toLowerCase().includes(q)) : entries;
  }, [entries, query]);
  const selected = value === 'ALL' ? null : entries.find((e) => e.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div className="gis-gwpick" ref={root}>
      <button
        type="button"
        className={`gis-gwpick-btn ${selected ? 'gis-gwpick-btn--active' : ''}`}
        onClick={() => {
          setQuery('');
          setOpen((o) => !o);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selected ? `${selected.id}${selected.name ? ` · ${selected.name}` : ''}` : 'Gateway'}
      >
        <span className="gis-gwpick-label">
          {selected ? (
            <>
              <b>{selected.id}</b>
              {selected.name && <span className="gis-gwpick-name"> · {selected.name}</span>}
            </>
          ) : (
            `All gateways (${gateways.length})`
          )}
        </span>
        <ChevronDown size={13} />
      </button>
      {selected && (
        <button type="button" className="gis-gwpick-clear" onClick={() => onChange('ALL')} aria-label="Show all gateways" title="Show all gateways">
          <X size={12} />
        </button>
      )}

      {open && (
        <div className="gis-gwpick-panel">
          <div className="gis-gwpick-search">
            <Search size={12} />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search gateway ID or name…" />
          </div>
          <ul className="gis-gwpick-list" role="listbox">
            <li>
              <button type="button" role="option" aria-selected={value === 'ALL'} className="gis-gwpick-item" onClick={() => choose('ALL')}>
                <span className="gis-gwpick-item-main">All gateways</span>
                {value === 'ALL' && <Check size={13} />}
              </button>
            </li>
            {shown.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === e.id}
                  className={`gis-gwpick-item ${value === e.id ? 'gis-gwpick-item--on' : ''}`}
                  onClick={() => choose(e.id)}
                >
                  <span className="gis-gwpick-item-main">
                    <b>{e.id}</b>
                    {e.name && <span className="gis-gwpick-name"> · {e.name}</span>}
                  </span>
                  {value === e.id && <Check size={13} />}
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="gis-gwpick-empty">No gateway matches “{query}”</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
