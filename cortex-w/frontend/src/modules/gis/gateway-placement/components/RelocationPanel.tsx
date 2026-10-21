import { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import type { RelocationItem, RelocationResult } from '../../shared/mapTypes';

interface Props {
  relocation: RelocationResult;
  /** A gateway's name for people (the place from Gateway Status, else its stored name or id). */
  labelFor: (id: string) => string;
  lockedIds: ReadonlySet<string>;
  onToggleLock: (id: string) => void;
  focusedId: string | null;
  onFocus: (item: RelocationItem) => void;
}

const VERDICT_STYLE: Record<RelocationItem['verdict'], { label: string; bg: string; fg: string; border: string }> = {
  move: { label: 'MOVE', bg: '#FFEDD5', fg: '#C2410C', border: '#EA580C' },
  remove: { label: 'REMOVE', bg: '#FEE2E2', fg: '#B91C1C', border: '#DC2626' },
  keep: { label: 'KEEP', bg: '#DCFCE7', fg: '#166534', border: '#16A34A' },
  locked: { label: 'LOCKED', bg: '#E2E8F0', fg: '#334155', border: '#94A3B8' },
};

const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString());

/** The recommended changes to the existing network: moves and removals first (in the order to make them), then the rest. */
export function RelocationPanel({ relocation, labelFor, lockedIds, onToggleLock, focusedId, onFocus }: Props) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const changes = relocation.items.filter((i) => i.order != null).sort((a, b) => a.order! - b.order!);
  const unchanged = relocation.items.filter((i) => i.order == null).sort((a, b) => labelFor(a.id).localeCompare(labelFor(b.id)));

  const card = (item: RelocationItem) => {
    const style = VERDICT_STYLE[item.verdict];
    const lockedByUser = lockedIds.has(item.id);
    const canLock = item.lockedReason == null || item.lockedReason === 'you';
    return (
      <div
        key={item.id}
        onClick={() => onFocus(item)}
        style={{
          borderRadius: 8,
          border: focusedId === item.id ? `2px solid ${style.border}` : '1px solid #e2e8f0',
          background: '#ffffff',
          padding: 12,
          cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {item.order != null && (
            <span style={{ width: 22, height: 22, borderRadius: 4, background: style.border, color: '#fff', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {item.order}
            </span>
          )}
          <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${labelFor(item.id)} · ${item.id}`}>
            {labelFor(item.id)}
          </span>
          <span style={{ padding: '2px 8px', borderRadius: 12, background: style.bg, color: style.fg, fontSize: 10.5, fontWeight: 700, flexShrink: 0 }}>{style.label}</span>
          {canLock && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock(item.id);
              }}
              title={lockedByUser ? 'Unlock: this gateway may be moved or removed' : 'Lock: never move or remove this gateway (it still counts as covering)'}
              aria-pressed={lockedByUser}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', padding: 2, color: lockedByUser ? '#334155' : '#94a3b8' }}
            >
              {lockedByUser ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
          )}
        </div>

        {item.verdict === 'move' && item.moveTo && (
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>+{n(item.newlyReached)}</div>
              <div style={{ fontSize: 11, color: '#64748b' }} title="Meters it newly reaches in the new place">Reached</div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: item.lost ? '#dc2626' : '#0f172a' }}>−{n(item.lost)}</div>
              <div style={{ fontSize: 11, color: '#64748b' }} title="Meters only this gateway reached where it stands">Lost</div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{Math.round(item.moveTo.distanceM).toLocaleString()} m</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Distance</div>
            </div>
          </div>
        )}
        {item.verdict === 'move' && (
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
            Net <strong>+{n(item.net)}</strong> meters{item.working ? '' : item.lost ? ' · not working today' : ' · not working today, so nothing is lost'}
          </div>
        )}
        {item.verdict === 'remove' && (
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
            {item.working || item.lost ? (
              <>Only <strong>{n(item.lost)}</strong> meters depend on it: remove it or reuse it elsewhere.{item.working ? '' : ' Not working today.'}</>
            ) : (
              <>Not working and nothing worth moving it to: remove it, or repair it where it is.</>
            )}
          </div>
        )}
        {(item.verdict === 'keep' || item.verdict === 'locked') && (
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
            {item.verdict === 'locked' && (
              <>
                {item.lockedReason === 'other-site'
                  ? 'Stands in a site outside the selection (counted, never moved). '
                  : item.lockedReason === 'serves-other-sites'
                    ? 'Also serves meters of sites outside the selection (counted, never moved). '
                    : 'Locked by you. '}
              </>
            )}
            Only this one reaches <strong>{n(item.onlyThisOne)}</strong> meters{item.working ? '' : ' · not working today'}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {changes.map(card)}
      {unchanged.length > 0 && (
        <div>
          <button
            onClick={() => setShowUnchanged((v) => !v)}
            aria-expanded={showUnchanged}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569', padding: '4px 2px' }}
          >
            {showUnchanged ? 'Hide' : 'Show'} unchanged gateways ({unchanged.length})
          </button>
          {showUnchanged && <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>{unchanged.map(card)}</div>}
        </div>
      )}
    </>
  );
}
