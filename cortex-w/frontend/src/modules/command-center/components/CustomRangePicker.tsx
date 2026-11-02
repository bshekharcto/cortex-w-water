import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { DateRangeCalendar } from '@/modules/gis/gateway-status/components/DateRangeCalendar';
import { fmtDay, type DayPick } from '@/modules/gis/gateway-status/gatewayStatusModel';
import '@/modules/gis/gateway-status/gatewayStatus.css';

// Command Center has no first day of its own: any day up to today can be picked (a range is still at most 92 days)
const NO_LIMIT = '1970-01-01';

interface Props {
  range: { from: string; to: string };
  /** The last day that can be picked: today at the site. */
  today: string;
  onApply: (range: { from: string; to: string }) => void;
}

/**
 * The Custom range of the Command Center: the same calendar as Gateway Status (click the first day, then the last; up to 92
 * days, any time in the past), opened from a button that shows the range in force. It sits inside the dark Command Center scope, so the calendar
 * takes the dark palette from the tokens (see commandCenter.css for the day colours).
 */
export function CustomRangePicker({ range, today, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<DayPick | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // opening starts from the range in force, with nothing half-picked
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
  const label = `${fmtDay(range.from)} – ${fmtDay(range.to)}`;

  return (
    <div className="gs-range cc-range-picker" ref={box}>
      <button type="button" className="cc-time-btn cc-time-btn--active cc-range-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Pick dates" title="Pick dates (up to 92 days)">
        <CalendarDays size={14} /> {label}
      </button>
      {open && (
        <div className="gs-range-pop" role="dialog" aria-label="Pick dates">
          <DateRangeCalendar value={{ start: range.from, end: range.to }} today={today} pick={pick} onChange={setPick} min={NO_LIMIT} />
          <div className="gs-range-summary">
            {complete ? `${fmtDay(complete.start)} – ${fmtDay(complete.end)}` : pick ? `${fmtDay(pick.start)} – …` : label}
          </div>
          <div className="gs-range-actions">
            <button type="button" className="cw-button-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button
              type="button"
              className="gs-range-apply"
              disabled={!complete}
              onClick={() => {
                if (!complete) return;
                onApply({ from: complete.start, to: complete.end });
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
