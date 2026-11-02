import { useState } from 'react';
import { Download } from 'lucide-react';
import type { MeterDayRow } from '@/services/api/mapApi';
import { csvCell, summarizeDays } from '@/modules/gis/shared/meterDetailModel';

/** The last days that have a reading: the same chart, strip and table as Meter 360, from the same data. */
export function ReadingsTab({ readings, loading, fileStem, hasMeter }: { readings: MeterDayRow[]; loading: boolean; fileStem: string; hasMeter: boolean }) {
  const [hovered, setHovered] = useState<MeterDayRow | null>(null);
  const sum = summarizeDays(readings);

  const downloadCsv = () => {
    const headers = ['Date', 'Consumption_Liters', 'Consumption_m3', 'Meter_Index_m3'];
    const rows = readings.map((r) => [r.date, r.consumptionL, r.consumptionM3, r.readingM3]);
    const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');
    const a = document.createElement('a');
    a.setAttribute('href', encodeURI(csv));
    a.setAttribute('download', `household_${fileStem}_daily_history.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="gis-meter-tab-body">
      <div className="gis-chart-box">
        <div className="gis-chart-header">
          <span className="gis-chart-title">Last {sum.days || 10} Days Daily Consumption (Liters)</span>
          <span className="gis-chart-avg">{sum.days ? `Daily Avg: ${sum.avgL} L` : ''}</span>
        </div>
        <div className="gis-bar-chart-container">
          {readings.length === 0 && (
            <div style={{ margin: 'auto', color: '#94A3B8', fontSize: 12 }}>
              {loading ? 'Loading readings…' : hasMeter ? 'No daily readings recorded for this meter yet.' : 'No meter is linked to this household.'}
            </div>
          )}
          {readings.map((day, idx) => {
            const heightPercent = Math.max(Math.round(((day.consumptionL || 0) / (sum.maxL || 1)) * 100), 6);
            const isPeak = sum.maxL != null && sum.maxL > 0 && day.consumptionL === sum.maxL;
            const dayNumber = (day.shortDate.split(' ')[1] || day.shortDate).replace(/\D/g, '') || String(idx + 1);
            return (
              <div key={day.date} className="gis-bar-col" onMouseEnter={() => setHovered(day)} onMouseLeave={() => setHovered(null)}>
                <div className="gis-bar-track">
                  <div className={`gis-bar-fill ${isPeak ? 'gis-bar-fill--peak' : day.consumptionL === 0 ? 'gis-bar-fill--zero' : ''} ${hovered?.date === day.date ? 'gis-bar-fill--hover' : ''}`} style={{ height: `${heightPercent}%` }} />
                </div>
                <span className="gis-bar-label">{dayNumber.padStart(2, '0')}</span>
              </div>
            );
          })}
        </div>
        <div className="gis-chart-tooltip-bar">
          {hovered
            ? `${hovered.date}: ${hovered.consumptionL} L (${hovered.consumptionM3} m³) • Meter index ${hovered.readingM3.toFixed(3)} m³`
            : 'Hover over any bar to inspect daily use and the meter index'}
        </div>
      </div>

      <div className="gis-readings-stats-strip">
        <div className="gis-strip-item"><span className="gis-strip-k">{sum.days}-Day Total</span><span className="gis-strip-v">{sum.totalL.toLocaleString()} L</span></div>
        <div className="gis-strip-item"><span className="gis-strip-k">Min Day</span><span className="gis-strip-v">{sum.minL == null ? '—' : `${sum.minL} L`}</span></div>
        <div className="gis-strip-item"><span className="gis-strip-k">Peak Day</span><span className="gis-strip-v">{sum.maxL == null ? '—' : `${sum.maxL} L`}</span></div>
        <div className="gis-strip-item"><span className="gis-strip-k">Days with a reading</span><span className="gis-strip-v">{sum.days}</span></div>
      </div>

      <div className="gis-drawer-table-wrap">
        <div className="gis-table-action-row">
          <span className="gis-table-title">Daily Meter Logs ({sum.days} Days)</span>
          <button className="gis-csv-btn" onClick={downloadCsv} disabled={readings.length === 0}>
            <Download size={12} /> Export CSV
          </button>
        </div>
        <table className="gis-mini-table">
          <thead>
            <tr><th>Date</th><th style={{ textAlign: 'right' }}>Daily (L)</th><th style={{ textAlign: 'right' }}>Index (m³)</th></tr>
          </thead>
          <tbody>
            {readings.map((r) => (
              <tr key={r.date}>
                <td><strong>{r.shortDate}</strong></td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.consumptionL} L</td>
                <td style={{ textAlign: 'right', color: '#475569' }}>{Number(r.readingM3).toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
