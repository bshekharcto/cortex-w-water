import { Phone } from 'lucide-react';
import type { HouseholdConsumer } from '@/services/api/householdApi';

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

/** Who the household is: every row is a value from the records, or a dash. */
export function OverviewTab({ consumer, loading }: { consumer: HouseholdConsumer | null; loading: boolean }) {
  const v = (x: unknown) => (loading && !consumer ? 'Loading…' : show(x));
  const mobile = consumer?.mobile ? `${consumer.countryCode ?? ''} ${consumer.mobile}`.trim() : null;
  return (
    <div className="gis-meter-tab-body">
      <div className="gis-card">
        <span className="gis-card-title">Consumer Account</span>
        <div className="gis-kv-row">
          <span className="gis-k">Consumer Name</span>
          <span className="gis-v" style={{ color: '#2563EB', fontWeight: 700 }}>{v(consumer?.name)}</span>
        </div>
        <div className="gis-kv-row">
          <span className="gis-k">Consumer ID</span>
          <span className="gis-v" style={{ fontFamily: 'monospace' }}>{v(consumer?.customId)}</span>
        </div>
        <div className="gis-kv-row">
          <span className="gis-k">Contact Mobile</span>
          <span className="gis-v" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Phone size={12} color="#64748B" /> {v(mobile)}
          </span>
        </div>
        <div className="gis-kv-row">
          <span className="gis-k">Account Status</span>
          <span className="gis-v" style={{ fontWeight: 600 }}>{v(consumer?.status)}</span>
        </div>
        <div className="gis-kv-row">
          <span className="gis-k">Registered</span>
          <span className="gis-v">{v(consumer?.registrationDate?.slice(0, 10))}</span>
        </div>
      </div>

      <div className="gis-card">
        <span className="gis-card-title">Service Location</span>
        <div className="gis-kv-row">
          <span className="gis-k">Address</span>
          <span className="gis-v" style={{ textAlign: 'right', maxWidth: 240 }}>{v(consumer?.location)}</span>
        </div>
        <div className="gis-kv-row"><span className="gis-k">Ward</span><span className="gis-v">{v(consumer?.ward)}</span></div>
        <div className="gis-kv-row"><span className="gis-k">PIN Code</span><span className="gis-v">{v(consumer?.pinCode)}</span></div>
        <div className="gis-kv-row"><span className="gis-k">Zone</span><span className="gis-v">{v(consumer?.zone)}</span></div>
        <div className="gis-kv-row"><span className="gis-k">Locality</span><span className="gis-v">{v(consumer?.locality)}</span></div>
        <div className="gis-kv-row"><span className="gis-k">DMA</span><span className="gis-v">{v(consumer?.dma)}</span></div>
        <div className="gis-kv-row"><span className="gis-k">Site</span><span className="gis-v">{v(consumer?.siteName)}</span></div>
      </div>
    </div>
  );
}
