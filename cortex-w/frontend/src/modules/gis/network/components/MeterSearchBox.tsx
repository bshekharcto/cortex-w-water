import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { networkApi, type NetMeterSuggestion } from '@/services/api/networkApi';
import { METER_STATUS_STYLE, type MeterPoint } from '../networkModel';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  siteId: string;
  /** The meters the map already has: they answer the first letters at once, before the server does. */
  points: ReadonlyArray<MeterPoint>;
  /** A suggestion was chosen. */
  onPick: (suggestion: NetMeterSuggestion) => void;
  /** Enter on text that is not a suggestion: search for it as typed. */
  onSubmit: (text: string) => void;
}

const MAX_SUGGESTIONS = 5;
const MIN_CHARS = 2;
const DEBOUNCE_MS = 120;

// answers already given this session (per site and text): typing the same thing again, or backspacing, costs nothing
const answered = new Map<string, NetMeterSuggestion[]>();
const remember = (key: string, items: NetMeterSuggestion[]) => {
  if (answered.size >= 200) answered.delete(answered.keys().next().value as string);
  answered.set(key, items);
};

/** Meter ids on the map that start with / contain the text: the instant part of the suggestions. */
function localSuggestions(points: ReadonlyArray<MeterPoint>, q: string): NetMeterSuggestion[] {
  const starts: NetMeterSuggestion[] = [];
  const contains: NetMeterSuggestion[] = [];
  for (const p of points) {
    const id = p.meterId.toLowerCase();
    const at = id.indexOf(q);
    if (at < 0) continue;
    (at === 0 ? starts : contains).push({ meterId: p.meterId, assetId: p.assetId, consumerId: null, consumerName: null, siteId: p.siteId });
    if (starts.length >= MAX_SUGGESTIONS) break;
  }
  return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
}

/**
 * The search box of the Network Explorer. Typing shows up to five meters whose meter id or consumer id matches what has
 * been typed so far: the ones already on the map appear immediately, the server's answer (which also knows consumer ids
 * and meters without a position) replaces them a moment later and is remembered for the session.
 */
export function MeterSearchBox({ value, onChange, placeholder, siteId, points, onPick, onSubmit }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [remote, setRemote] = useState<{ key: string; items: NetMeterSuggestion[] } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const q = value.trim().toLowerCase();
  const key = `${siteId}|${q}`;
  const pointIds = useMemo(() => new Map(points.map((p) => [p.meterId, p])), [points]);

  // the server's answer for what is typed (debounced, the previous request cancelled, remembered)
  useEffect(() => {
    if (q.length < MIN_CHARS) return;
    const hit = answered.get(key);
    if (hit) {
      setRemote({ key, items: hit });
      return;
    }
    const ctl = new AbortController();
    const t = window.setTimeout(() => {
      networkApi
        .suggestMeters(siteId, q, ctl.signal)
        .then((r) => {
          if (ctl.signal.aborted) return;
          remember(key, r.items);
          setRemote({ key, items: r.items });
        })
        .catch(() => undefined); // the instant part stays; the next keystroke asks again
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(t);
      ctl.abort();
    };
  }, [key, q, siteId]);

  const local = useMemo(() => (q.length >= MIN_CHARS ? localSuggestions(points, q) : []), [points, q]);
  const items = (remote && remote.key === key ? remote.items : local).slice(0, MAX_SUGGESTIONS);
  const showList = open && q.length >= MIN_CHARS && items.length > 0;

  useEffect(() => setActive(-1), [key]);
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const pick = (s: NetMeterSuggestion) => {
    setOpen(false);
    onPick(s);
  };

  return (
    <div className="gis-search-wrap" ref={boxRef}>
      <Search size={13} className="gis-search-icon" />
      <input
        type="text"
        className="gis-search-input"
        placeholder={placeholder}
        value={value}
        role="combobox"
        aria-expanded={showList}
        aria-controls="gis-suggest-list"
        aria-autocomplete="list"
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && items.length) {
            e.preventDefault();
            setOpen(true);
            setActive((a) => (a + 1) % items.length);
          } else if (e.key === 'ArrowUp' && items.length) {
            e.preventDefault();
            setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
          } else if (e.key === 'Enter') {
            if (showList && active >= 0) pick(items[active]);
            else {
              setOpen(false);
              onSubmit(value.trim());
            }
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {value && (
        <button
          className="gis-search-clear"
          aria-label="Clear search"
          onClick={() => {
            onChange('');
            onSubmit('');
          }}
        >
          <X size={12} />
        </button>
      )}
      {showList && (
        <ul className="gis-suggest" id="gis-suggest-list" role="listbox">
          {items.map((s, i) => {
            const point = pointIds.get(s.meterId);
            return (
              <li
                key={s.meterId}
                role="option"
                aria-selected={i === active}
                className={`gis-suggest-item ${i === active ? 'gis-suggest-item--active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                onMouseEnter={() => setActive(i)}
              >
                <span className="gis-suggest-dot" style={{ background: point ? METER_STATUS_STYLE[point.status].color : '#CBD5E1' }} />
                <span className="gis-suggest-main">
                  <span className="gis-suggest-id">{s.meterId}</span>
                  {(s.consumerId || s.consumerName) && (
                    <span className="gis-suggest-sub">
                      {[s.consumerId, s.consumerName].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                {!point && <span className="gis-suggest-tag">not on the map</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
