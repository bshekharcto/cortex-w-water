import { RawFrameItem } from '../types/commandCenter.types';
import { fmt, formatFrequency, formatLocalTime, localTzLabel, utcTitle, yesNo } from '../utils/format';
import { useThresholds, isWeakRssi, isPoorSnr } from '../utils/thresholds';
import { TableSkeleton } from './TableSkeleton';
import { CopyCell } from './CopyCell';
import { Info } from 'lucide-react';

interface Props {
  frames: RawFrameItem[];
  gatewayAlias: string;
  onSelectFrameMeter: (meterId: string) => void;
  /** Total frames for this gateway in the window (more may be loadable). */
  total?: number;
  loading?: boolean;
  error?: string | null;
  onLoadMore?: () => void;
  /** Opens the frame detail drawer. */
  onInspectFrame?: (frame: RawFrameItem) => void;
  /** Frames that just arrived; their rows flash briefly. */
  highlightIds?: Set<string>;
}

export function GatewayFramesTable({
  frames,
  gatewayAlias,
  onSelectFrameMeter,
  total,
  loading,
  error,
  onLoadMore,
  onInspectFrame,
  highlightIds,
}: Props) {
  const th = useThresholds();
  return (
    <div className="cc-frames-view">
      <div className="cc-subfilter-bar">
        <span className="cc-subfilter-label">Latest Decoded Frames for {gatewayAlias}:</span>
        <span className="cc-subfilter-count">
          ({frames.length.toLocaleString()}{total != null ? ` of ${total.toLocaleString()}` : ''} frames, newest first)
        </span>
      </div>

      <div className="cc-table-scroll-container">
        <table className="cc-telemetry-table">
          <thead>
            <tr>
              <th>Decoded At ({localTzLabel()})</th>
              <th>Meter ID</th>
              <th>DevEUI</th>
              <th>FCnt</th>
              <th>FPort</th>
              <th>Freq (MHz)</th>
              <th>DR</th>
              <th>RSSI</th>
              <th>SNR</th>
              <th>Confirmed</th>
              <th>ADR</th>
              <th>Checksum</th>
              <th>Event</th>
              {onInspectFrame && <th aria-label="Details" />}
            </tr>
          </thead>
          <tbody>
            {frames.length === 0 && loading && <TableSkeleton label="Loading frames…" />}
            {frames.length === 0 && !loading && (
              <tr>
                <td colSpan={99} className="cc-table-empty">
                  {error ? `Could not load frames (${error}).` : 'No frames received through this gateway in the selected window.'}
                </td>
              </tr>
            )}
            {frames.map((frame) => {
              const isWeak = isWeakRssi(th, frame.rssi);
              const isPoor = isPoorSnr(th, frame.snr);

              return (
                <tr
                  key={frame.id}
                  className={`cc-table-row ${highlightIds?.has(frame.id) ? 'cc-row-new' : ''}`}
                  onClick={() => onSelectFrameMeter(frame.meterId)}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectFrameMeter(frame.meterId); } }}
                >
                  <td className="cc-mono" title={utcTitle(frame.decodedAt)}>{formatLocalTime(frame.decodedAt)}</td>
                  <td className="cc-mono cc-cell-bold"><CopyCell value={frame.meterId} label="meter ID" /></td>
                  <td className="cc-mono cc-cell-mute"><CopyCell value={frame.devEui} label="DevEUI" /></td>
                  <td className="cc-mono">{fmt(frame.fCnt)}</td>
                  <td className="cc-mono">{fmt(frame.fPort)}</td>
                  <td className="cc-mono">{formatFrequency(frame.frequency)}</td>
                  <td className="cc-mono">{frame.dr == null ? '—' : `DR${frame.dr}`}</td>
                  <td className={`cc-mono ${isWeak ? 'cc-text-warn' : ''}`}>
                    {fmt(frame.rssi, ' dBm')}
                  </td>
                  <td className={`cc-mono ${isPoor ? 'cc-text-danger' : ''}`}>
                    {fmt(frame.snr, ' dB')}
                  </td>
                  <td>{yesNo(frame.confirmed)}</td>
                  <td>{yesNo(frame.adr)}</td>
                  <td>
                    <span className={frame.checksumStatus === 'OK' ? 'cc-tag-ok' : 'cc-text-danger'}>{fmt(frame.checksumStatus)}</span>
                  </td>
                  <td>
                    <span className={`cc-event-badge cc-event-badge--${frame.statusEvent.toLowerCase()}`}>
                      {frame.statusEvent.replace('_', ' ')}
                    </span>
                  </td>
                  {onInspectFrame && (
                    <td>
                      <button
                        className="cc-icon-btn cc-row-info"
                        aria-label={`Details for the frame from meter ${frame.meterId}`}
                        title="Frame details"
                        onClick={(e) => {
                          e.stopPropagation();
                          onInspectFrame(frame);
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <Info size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {onLoadMore && total != null && frames.length < total && (
        <button className="cw-button-secondary cc-load-more" disabled={loading} onClick={onLoadMore}>
          {loading ? 'Loading…' : `Load more (${(total - frames.length).toLocaleString()} remaining)`}
        </button>
      )}
    </div>
  );
}
