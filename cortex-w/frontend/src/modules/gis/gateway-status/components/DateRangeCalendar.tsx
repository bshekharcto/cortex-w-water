import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { DATA_AVAILABLE_FROM, addMonths, dayPickable, daysBetween, monthGrid, monthLabel, monthOf, pickDay, type DayPick } from '../gatewayStatusModel';

interface DateRangeCalendarProps {
  /** The range in force: it is shown highlighted until a new one is started. */
  value: { start: string; end: string };
  today: string;
  onChange: (pick: DayPick) => void;
  pick: DayPick | null;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** A month calendar for choosing a range of days: click the first day, then the last. */
export function DateRangeCalendar({ value, today, pick, onChange }: DateRangeCalendarProps) {
  const [month, setMonth] = useState(monthOf(value.end));
  const [hover, setHover] = useState<string | null>(null);

  // What is highlighted: the half-made pick (up to the day under the pointer), else the range in force.
  const shown = pick
    ? pick.end === null
      ? { start: hover && hover < pick.start ? hover : pick.start, end: hover && hover > pick.start ? hover : pick.start }
      : { start: pick.start, end: pick.end }
    : value;

  const canNext = addMonths(month, 1) <= monthOf(today);
  const canPrev = month > monthOf(DATA_AVAILABLE_FROM);

  return (
    <div className="gs-cal">
      <div className="gs-cal-head">
        <button type="button" className="cw-icon-btn" onClick={() => setMonth(addMonths(month, -1))} disabled={!canPrev} aria-label="Previous month"><ChevronLeft size={16} /></button>
        <span className="gs-cal-month" aria-live="polite">{monthLabel(month)}</span>
        <button type="button" className="cw-icon-btn" onClick={() => setMonth(addMonths(month, 1))} disabled={!canNext} aria-label="Next month"><ChevronRight size={16} /></button>
      </div>
      <div className="gs-cal-grid" role="grid" aria-label={monthLabel(month)} onMouseLeave={() => setHover(null)}>
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="gs-cal-dow" role="columnheader">{d}</span>
        ))}
        {monthGrid(month).flat().map((day, i) =>
          day === null ? (
            <span key={i} />
          ) : (
            <button
              key={day}
              type="button"
              role="gridcell"
              className={clsx(
                'gs-cal-day',
                day >= shown.start && day <= shown.end && 'gs-cal-day--in',
                (day === shown.start || day === shown.end) && 'gs-cal-day--edge',
                day === today && 'gs-cal-day--today'
              )}
              disabled={!dayPickable(day, pick, today)}
              aria-label={day}
              aria-selected={day >= shown.start && day <= shown.end}
              onMouseEnter={() => setHover(day)}
              onClick={() => onChange(pickDay(pick, day))}
            >
              {Number(day.slice(8))}
            </button>
          )
        )}
      </div>
      <div className="gs-cal-foot">
        {pick && pick.end === null
          ? 'Now pick the last day'
          : `${daysBetween(shown.start, shown.end)} day${daysBetween(shown.start, shown.end) === 1 ? '' : 's'}`}
      </div>
    </div>
  );
}
