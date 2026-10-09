import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { RawFrameItem } from '../types/commandCenter.types';
import { fmt, formatFrequency, formatLocalTime, formatStatusByte, localTzLabel, utcTitle, yesNo } from '../utils/format';
import { isPoorSnr, isWeakRssi, useThresholds } from '../utils/thresholds';
import { CopyCell } from './CopyCell';

interface Props {
  frame: RawFrameItem;
  onClose: () => void;
  onOpenMeter: (meterId: string) => void;
}

/** Every stored field of one frame. Nothing is invented: what upstream didn't send shows as "—". */
export function FrameDetailDrawer({ frame, onClose, onOpenMeter }: Props) {
  const th = useThresholds();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), [frame.id]);

  const rows: Array<[string, React.ReactNode, string?]> = [
    ['Received', <span title={utcTitle(frame.decodedAt)}>{formatLocalTime(frame.decodedAt)} {localTzLabel()}</span>],
    ['Received (UTC)', utcTitle(frame.decodedAt)?.replace(' UTC', '') ?? '—'],
    ['Meter clock', fmt(frame.meterTimestamp), "The meter's own clock as it reported it. Often wrong; never used to judge freshness."],
    ['Gateway', <><strong>{frame.gatewayAlias}</strong> <CopyCell value={frame.gatewayId} label="gateway ID" alwaysVisible /></>],
    ['Meter ID', <CopyCell value={frame.meterId} label="meter ID" alwaysVisible />],
    ['DevEUI', <CopyCell value={frame.devEui} label="DevEUI" alwaysVisible />],
    ['FCnt', fmt(frame.fCnt)],
    ['FPort', fmt(frame.fPort)],
    ['Frequency', formatFrequency(frame.frequency, true)],
    ['Data rate', frame.dr == null ? '—' : `DR${frame.dr}`],
    ['RSSI', <span className={isWeakRssi(th, frame.rssi) ? 'cc-text-warn' : ''}>{fmt(frame.rssi, ' dBm')}</span>],
    ['SNR', <span className={isPoorSnr(th, frame.snr) ? 'cc-text-danger' : ''}>{fmt(frame.snr, ' dB')}</span>],
    ['Confirmed', yesNo(frame.confirmed)],
    ['ADR', yesNo(frame.adr)],
    ['Checksum', fmt(frame.checksumStatus)],
    ['Status byte', formatStatusByte(frame.statusByte)],
    ['Link quality', frame.statusEvent.replace('_', ' ')],
    ['Heard by several gateways', frame.multiGateway ? 'Yes' : 'No'],
  ];

  return (
    <>
      <div className="cc-drawer-backdrop cc-drawer-backdrop--always" onClick={onClose} aria-hidden="true" />
      <aside className="cc-frame-drawer" role="dialog" aria-modal="true" aria-label="Frame details">
        <div className="cc-frame-drawer-head">
          <div>
            <div className="cc-inspector-card-title">FRAME DETAILS</div>
            <div className="cc-mono cc-cell-mute">{frame.id}</div>
          </div>
          <button ref={closeRef} className="cc-inspector-close" onClick={onClose} aria-label="Close frame details" title="Close (Esc)">
            <X size={16} />
          </button>
        </div>
        <div className="cc-kv-list">
          {rows.map(([k, v, tip]) => (
            <div className="cc-kv-row" key={k} title={tip}>
              <span className="cc-k">{k}</span>
              <span className="cc-v cc-mono">{v}</span>
            </div>
          ))}
        </div>
        <p className="cc-frame-drawer-note">The raw payload is not stored, only the decoded fields above.</p>
        <button
          className="cw-button-secondary cc-inspector-wide-btn"
          onClick={() => {
            onOpenMeter(frame.meterId);
            onClose();
          }}
        >
          Open meter {frame.meterId}
        </button>
      </aside>
    </>
  );
}
