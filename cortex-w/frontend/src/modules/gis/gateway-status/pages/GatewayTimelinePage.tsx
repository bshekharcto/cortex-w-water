import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowLeft, Clock, HeartPulse, Hourglass, WifiOff } from 'lucide-react';
import { KpiCard } from '@/components/cards/KpiCard';
import { gatewayStatusApi, type GatewayRange } from '@/services/api/gatewayStatusApi';
import { useGatewayLoad } from '../useGatewayLoad';
import {
  DASH,
  STATE_LABEL,
  computeTimelineStats,
  fmtDateTime,
  fmtDuration,
  fmtHm,
  fmtInt,
  fmtPercent,
  offlinePeriods,
  presetOf,
  rangeFromParams,
  rangeToParams,
  reasonLabel,
  todayIn,
  viewAround,
  type View,
} from '../gatewayStatusModel';
import { StateTimelineChart } from '../components/StateTimelineChart';
import { RangeControls } from '../components/RangeControls';
import { Pager } from '../components/Pager';
import '../gatewayStatus.css';

const REFRESH_MS = 60_000;
const EUI = /^[0-9a-f]{16}$/i;
const PAGE_SIZES = [10, 25, 50];

/** GIS > Gateway Status > one gateway: its online/offline periods over the chosen days. */
export function GatewayTimelinePage() {
  const navigate = useNavigate();
  const { gatewayId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const paramText = params.toString();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = useMemo(() => rangeFromParams(params), [paramText]);
  const validId = EUI.test(gatewayId);

  const key = `${gatewayId}|${range.startDate}|${range.endDate}`;
  // Like the list: the four quick ranges of this gateway come together in one call, so switching needs no wait.
  const preset = presetOf(range);
  const today = todayIn(range.timeZone);
  const bundle = useGatewayLoad(
    `${gatewayId}|presets|${today}`,
    (signal) => gatewayStatusApi.timelinePresets(gatewayId, today, range.timeZone, signal),
    REFRESH_MS,
    validId
  );
  const custom = useGatewayLoad(key, (signal) => gatewayStatusApi.timeline(gatewayId, range, signal), REFRESH_MS, validId && preset === null);
  const active = preset ? bundle : custom;
  const data = preset ? bundle.data?.ranges[preset] ?? null : custom.data;
  const loading = validId && active.loading;
  const error = active.error;
  const reload = () => {
    bundle.reload();
    custom.reload();
  };

  const full: View | null = useMemo(
    () => (data ? { from: Date.parse(data.range.startAt), to: Date.parse(data.range.endAt) } : null),
    [data?.range.startAt, data?.range.endAt] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [view, setView] = useState<View | null>(null);
  // A new range (or gateway) starts from its whole extent; a refresh of the same one keeps the zoom.
  useEffect(() => setView(null), [key]);
  const shown = view ?? full;

  const stats = useMemo(() => (data ? computeTimelineStats(data) : null), [data]);
  const periods = useMemo(() => (data ? offlinePeriods(data) : []), [data]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => setPage(0), [key]);
  const visible = periods.slice(page * pageSize, (page + 1) * pageSize);

  const back = () => navigate({ pathname: '/app/gis/gateway-status', search: paramText ? `?${paramText}` : '' });
  const changeRange = (next: GatewayRange) => setParams(rangeToParams(next));
  const notFound = !validId || (error && /unknown gateway/i.test(error));

  return (
    <div className="gs-page">
      <div className="gs-toolbar">
        <div className="gs-toolbar-left">
          <button className="cw-icon-btn gs-back" onClick={back} aria-label="Back to Gateway Status" title="Back to Gateway Status">
            <ArrowLeft size={18} />
          </button>
          <div className="gs-title gs-mono gs-title--id">{validId ? gatewayId.toLowerCase() : 'Gateway'}</div>
          {data?.status && (
            <span className={`gs-state gs-state--${data.status} gs-state--pill`}>
              <span className="gs-dot" />
              {STATE_LABEL[data.status]}
            </span>
          )}
          {data && <span className="gs-lastseen">Last seen: <strong>{fmtDateTime(data.lastSeenAt)}</strong></span>}
        </div>
        <RangeControls range={range} onChange={changeRange} />
      </div>

      {error && !notFound && (
        <div className="gs-banner gs-banner--error" role="alert">
          {error} {data ? 'Showing the last data received.' : <button className="gs-link" onClick={reload}>Try again</button>}
        </div>
      )}

      <div className="gs-body">
        {notFound ? (
          <div className="gs-loading">This gateway was not found. <button className="gs-link" onClick={back}>Back to the list</button></div>
        ) : loading && !data ? (
          <div className="gs-loading" role="status"><div className="cw-spinner" /> Loading timeline…</div>
        ) : data && stats && shown && full ? (
          <>
            <div className="gs-stats">
              <KpiCard icon={Activity} iconTone="green" label="Uptime" value={fmtPercent(stats.uptimePercent)} subtitle={`${fmtHm(stats.onlineSeconds)} of ${fmtHm(stats.observedSeconds)}`} />
              <KpiCard icon={Clock} iconTone="red" label="Total Downtime" value={fmtPercent(stats.downtimePercent)} subtitle={`${fmtDuration(stats.offlineSeconds)} of ${fmtHm(stats.observedSeconds)}`} />
              <KpiCard icon={AlertTriangle} iconTone="orange" label="Offline Periods" value={fmtInt(stats.offlinePeriods)} />
              <KpiCard icon={WifiOff} iconTone="primary" label="No Data" value={fmtDuration(stats.noDataSeconds)} subtitle="Not covered by any report" />
              <KpiCard icon={Hourglass} iconTone="purple" label="Longest Outage" value={stats.offlinePeriods ? fmtDuration(stats.longestOutageSeconds) : DASH} />
              <KpiCard
                icon={HeartPulse}
                iconTone="teal"
                label="Heartbeats (30 s)"
                value={fmtPercent(stats.heartbeatPercent)}
                subtitle={stats.heartbeatsExpected ? `${fmtInt(stats.heartbeatsReceived)} of ${fmtInt(stats.heartbeatsExpected)} expected` : undefined}
              />
            </div>

            <div className="cw-surface gs-card">
              <StateTimelineChart timeline={data} view={shown} full={full} onViewChange={setView} />
            </div>

            <div className="cw-surface gs-card">
              <div className="gs-card-title">Offline Periods ({periods.length})</div>
              <div className="cw-table-wrap">
                <table className="cw-table cw-table--centered gs-table">
                  <thead>
                    <tr><th>#</th><th>Offline From</th><th>Back Online At</th><th>Duration</th><th>Reason</th></tr>
                  </thead>
                  <tbody>
                    {visible.map((p) => (
                      <tr
                        key={p.index}
                        className="cw-table-row--clickable"
                        tabIndex={0}
                        title="Zoom the timeline to this period"
                        onClick={() => setView(viewAround(p.segment, full))}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setView(viewAround(p.segment, full))}
                      >
                        <td>{p.index}</td>
                        <td>{fmtDateTime(p.segment.start)}</td>
                        <td>{p.ongoing ? 'Still offline' : fmtDateTime(p.segment.end)}</td>
                        <td>{fmtDuration(p.segment.durationSeconds)}</td>
                        <td>{reasonLabel(p.segment.reason)}</td>
                      </tr>
                    ))}
                    {periods.length === 0 && (
                      <tr><td colSpan={5} className="gs-empty">No offline periods in this range.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Pager total={periods.length} page={page} pageSize={pageSize} sizes={PAGE_SIZES} onPage={setPage} onPageSize={setPageSize} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
