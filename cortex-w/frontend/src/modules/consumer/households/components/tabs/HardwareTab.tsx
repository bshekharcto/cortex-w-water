import { RefreshCw } from 'lucide-react';
import type { HouseholdCore, HouseholdDocuments, HouseholdHardware } from '@/services/api/householdApi';
import { MeterPhotoGrid } from '@/modules/gis/shared/MeterPhotoGrid';
import { formatMHz, formatStamp } from '@/modules/gis/shared/meterDetailModel';
import type { PartState } from '../../hooks/useHouseholdParts';

interface Props {
  core: HouseholdCore | null;
  hardware: HouseholdHardware | null;
  documents: HouseholdDocuments | null;
  hardwareState: PartState;
  documentsState: PartState;
  onRetry: (part: 'hardware' | 'documents') => void;
}

const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const pending = (s: PartState) => s === 'idle' || s === 'loading';

/** The household's meter: its radio link, its swap history and the installation photographs (same pictures as Meter 360). */
export function HardwareTab({ core, hardware, documents, hardwareState, documentsState, onRetry }: Props) {
  const meter = hardware?.meter ?? null;
  const frame = hardware?.lastFrame ?? null;
  const swap = documents?.replacement ?? null;
  const meters = core?.meters ?? [];
  const wait = (s: PartState, v: unknown) => (pending(s) ? 'Loading…' : dash(v));

  return (
    <div className="gis-meter-tab-body">
      <div className="gis-card">
        <span className="gis-card-title">Active Smart Meter</span>
        {hardwareState === 'error' && (
          <div style={{ margin: '6px 0', fontSize: 12, color: '#B45309' }}>
            Could not load the meter details.
            <button className="gis-layer-btn" onClick={() => onRetry('hardware')} style={{ marginLeft: 6 }}>Retry</button>
          </div>
        )}
        {hardwareState === 'done' && !meter ? (
          <p style={{ color: '#64748B', fontSize: 13, margin: '8px 0 0 0' }}>No meter is linked to this household.</p>
        ) : (
          <>
            <div className="gis-kv-row">
              <span className="gis-k">Meter Number</span>
              <span className="gis-v" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563EB' }}>{wait(hardwareState, meter?.meterId)}</span>
            </div>
            <div className="gis-kv-row">
              <span className="gis-k">Device EUI</span>
              <span className="gis-v" style={{ fontFamily: 'monospace' }}>{wait(hardwareState, meter?.devEui)}</span>
            </div>
            <div className="gis-kv-row">
              <span className="gis-k">Connected Gateway</span>
              <span className="gis-v" style={{ fontFamily: 'monospace' }}>{wait(hardwareState, meter?.gatewayId)}</span>
            </div>
            <div className="gis-kv-row">
              <span className="gis-k">RSSI Signal Power</span>
              <span className="gis-v" style={{ color: meter?.rssi == null ? undefined : meter.rssi > -90 ? '#059669' : meter.rssi > -95 ? '#D97706' : '#DC2626' }}>
                {pending(hardwareState) ? 'Loading…' : meter?.rssi != null ? `${meter.rssi} dBm` : '—'}
              </span>
            </div>
            <div className="gis-kv-row">
              <span className="gis-k">Signal-to-Noise Ratio (SNR)</span>
              <span className="gis-v" style={{ color: meter?.snr == null ? undefined : meter.snr > -10 ? '#059669' : '#D97706' }}>
                {pending(hardwareState) ? 'Loading…' : meter?.snr != null ? `${meter.snr} dB` : '—'}
              </span>
            </div>
            <div className="gis-kv-row">
              <span className="gis-k">Frequency · Data rate</span>
              <span className="gis-v">
                {pending(hardwareState) ? 'Loading…' : frame ? `${formatMHz(frame.frequencyHz)} · ${frame.dataRate == null ? '—' : `DR${frame.dataRate}`}` : '—'}
              </span>
            </div>
            <div className="gis-kv-row">
              <span className="gis-k">Last Decoded Telemetry</span>
              <span className="gis-v">{pending(hardwareState) ? 'Loading…' : formatStamp(meter?.lastSeen)}</span>
            </div>
          </>
        )}
      </div>

      <div className="gis-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="gis-card-title">Meters Linked to this Household</span>
          <span className="gis-packet-pill gis-packet-pill--good">{meters.length} {meters.length === 1 ? 'Record' : 'Records'}</span>
        </div>
        {meters.length > 0 ? (
          <div className="gis-drawer-table-wrap">
            <table className="gis-mini-table">
              <thead>
                <tr><th>Meter Number</th><th>Status</th><th>Installed</th><th>Last Data</th><th style={{ textAlign: 'right' }}>Index (m³)</th></tr>
              </thead>
              <tbody>
                {meters.map((m) => (
                  <tr key={m.meterId}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#2563EB' }}>{m.meterId}</td>
                    <td>{m.isActive ? 'Active' : 'Inactive'}</td>
                    <td>{dash(m.installedDate?.slice(0, 10))}</td>
                    <td>{formatStamp(m.lastSeen)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{m.readingM3 == null ? '—' : m.readingM3.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: '#64748B', fontSize: 13, margin: '8px 0 0 0' }}>{core ? 'No meter is linked to this household.' : 'Loading…'}</p>
        )}
      </div>

      <div className="gis-card">
        <span className="gis-card-title">Meter Replacement</span>
        {pending(documentsState) ? (
          <div style={{ padding: '10px 0', fontSize: 12, color: '#64748B' }}><RefreshCw size={13} className="gis-spin" style={{ verticalAlign: 'middle', marginRight: 6 }} />Loading replacement history…</div>
        ) : documentsState === 'error' ? (
          <div style={{ margin: '6px 0', fontSize: 12, color: '#B45309' }}>
            Could not load the replacement history.
            <button className="gis-layer-btn" onClick={() => onRetry('documents')} style={{ marginLeft: 6 }}>Retry</button>
          </div>
        ) : swap ? (
          <>
            <div className="gis-kv-row"><span className="gis-k">Old Meter</span><span className="gis-v" style={{ fontFamily: 'monospace' }}>{dash(swap.oldMeterNumber)}</span></div>
            <div className="gis-kv-row"><span className="gis-k">Old Meter Final Reading</span><span className="gis-v">{swap.oldMeterReading == null ? '—' : `${swap.oldMeterReading} m³`}</span></div>
            <div className="gis-kv-row"><span className="gis-k">New Meter</span><span className="gis-v" style={{ fontFamily: 'monospace' }}>{dash(swap.newMeterNumber)}</span></div>
            <div className="gis-kv-row"><span className="gis-k">New Meter Start Reading</span><span className="gis-v">{swap.newMeterReading == null ? '—' : `${swap.newMeterReading} m³`}</span></div>
            <div className="gis-kv-row"><span className="gis-k">Replaced On</span><span className="gis-v">{dash(swap.date?.slice(0, 10))}</span></div>
          </>
        ) : (
          <p style={{ color: '#64748B', fontSize: 13, margin: '8px 0 0 0' }}>No meter replacement is recorded for this household.</p>
        )}
      </div>

      <div className="gis-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="gis-card-title">Installation Proof & Documents</span>
          {documentsState === 'done' && documents && <span style={{ fontSize: 11, color: '#64748B' }}>{documents.photos.length} Photos on AWS S3</span>}
        </div>
        {documents?.unavailable?.includes('photos') && documentsState === 'done' ? (
          <MeterPhotoGrid photos={[]} state="error" onRetry={() => onRetry('documents')} />
        ) : (
          <MeterPhotoGrid
            photos={documents?.photos ?? []}
            state={pending(documentsState) ? 'loading' : documentsState === 'error' ? 'error' : 'done'}
            onRetry={() => onRetry('documents')}
          />
        )}
      </div>
    </div>
  );
}
