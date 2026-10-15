import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import clsx from 'clsx';
import type { GatewayRange } from '@/services/api/gatewayStatusApi';
import { RANGE_PRESETS, fmtDay, presetOf, presetRange, todayIn, type DayPick, type RangePreset } from '../gatewayStatusModel';
import { DateRangeCalendar } from './DateRangeCalendar';

interface RangeControlsProps {
  range: GatewayRange;
  onChange: (range: GatewayRange) => void;
}

/** "Time range: 1D 3D 7D 14D [calendar]": presets end today; the calendar picks any days (up to 92). */
export function RangeControls({ range, onChange }: RangeControlsProps) {
  const active = presetOf(range);
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
      {RANGE_PRESETS.map((p: RangePreset) => (
        <button key={p} className={clsx('gs-range-btn', active === p && 'gs-range-btn--active')} onClick={() => onChange(presetRange(p))}>
          {p}
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
