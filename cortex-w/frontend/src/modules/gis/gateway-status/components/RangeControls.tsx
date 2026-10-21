import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import clsx from 'clsx';
import type { GatewayRange } from '@/services/api/gatewayStatusApi';
import { RANGE_PRESETS, fmtDay, presetRange, todayIn, type DayPick } from '../gatewayStatusModel';
import { DateRangeCalendar } from './DateRangeCalendar';

/** A quick range: its button label and the days it stands for. */
export interface RangeChoice {
  key: string;
  range: GatewayRange;
}

interface RangeControlsProps {
  range: GatewayRange;
  onChange: (range: GatewayRange) => void;
  /** The quick ranges offered; by default 1D 3D 7D 14D, which end today. */
  presets?: RangeChoice[];
}

/** "Time range: 1D 3D 7D 14D [calendar]": presets end today; the calendar picks any days (up to 92). */
export function RangeControls({ range, onChange, presets }: RangeControlsProps) {
  const choices: RangeChoice[] = presets ?? RANGE_PRESETS.map((p) => ({ key: p, range: presetRange(p) }));
  const active = choices.find((c) => c.range.startDate === range.startDate && c.range.endDate === range.endDate)?.key ?? null;
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<DayPick | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const today = todayIn(range.timeZone);

  // Opening starts from the range in force, with nothing half-picked.
  useEffect(() => {
    if (open) setPick(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const complete = pick && pick.end !== null ? { start: pick.start, end: pick.end } : null;

  return (
    <div className="gs-range" ref={box}>
      <span className="gs-range-label">Time range</span>
      {choices.map((c) => (
        <button key={c.key} className={clsx('gs-range-btn', active === c.key && 'gs-range-btn--active')} onClick={() => onChange(c.range)}>
          {c.key}
        </button>
      ))}
      <button
        className={clsx('gs-range-btn gs-range-btn--icon', !active && 'gs-range-btn--active')}
        onClick={() => setOpen((o) => !o)}
        aria-label="Pick dates"
        aria-expanded={open}
        title={!active ? `${fmtDay(range.startDate)} – ${fmtDay(range.endDate)}` : 'Pick dates'}
      >
        <CalendarDays size={16} />
      </button>
      {open && (
        <div className="gs-range-pop" role="dialog" aria-label="Pick dates">
          <DateRangeCalendar value={{ start: range.startDate, end: range.endDate }} today={today} pick={pick} onChange={setPick} />
          <div className="gs-range-summary">
            {complete
              ? `${fmtDay(complete.start)} – ${fmtDay(complete.end)}`
              : pick
                ? `${fmtDay(pick.start)} – …`
                : `${fmtDay(range.startDate)} – ${fmtDay(range.endDate)}`}
          </div>
          <div className="gs-range-actions">
            <button className="cw-button-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button
              className="gs-range-apply"
              disabled={!complete}
              onClick={() => {
                if (!complete) return;
                onChange({ startDate: complete.start, endDate: complete.end, timeZone: range.timeZone });
                setOpen(false);
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
