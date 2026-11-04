import { RefreshCw } from 'lucide-react';
import type { HouseholdBills } from '@/services/api/householdApi';
import type { PartState } from '../../hooks/useHouseholdParts';

const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const money = (n: unknown) => (n == null || !Number.isFinite(Number(n)) ? '—' : `₹ ${Number(n).toFixed(2)}`);
const day = (s?: string) => (s ? s.slice(0, 10) : '—');

/** The latest bill and the tariff of the household's site, exactly as the billing system holds them. */
export function BillingTab({ bills, state, onRetry }: { bills: HouseholdBills | null; state: PartState; onRetry: () => void }) {
  if (state === 'idle' || state === 'loading') {
    return (
      <div className="gis-meter-tab-body">
        <div className="gis-card" style={{ textAlign: 'center', color: '#64748B', fontSize: 12, padding: '24px 8px' }}>
          <RefreshCw size={18} className="gis-spin" style={{ margin: '0 auto 8px auto', display: 'block' }} />
          Loading billing…
        </div>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="gis-meter-tab-body">
        <div className="gis-card" style={{ textAlign: 'center', color: '#B45309', fontSize: 12, padding: '24px 8px' }}>
          Could not load the billing details.
          <button className="gis-layer-btn" onClick={onRetry} style={{ marginLeft: 6 }}>Retry</button>
        </div>
      </div>
    );
  }

  const bill = bills?.latestBill ?? null;
  const slabs = bills?.slabs ?? [];
  const status = bill?.status?.toUpperCase();
  const charges = bill?.billCharges ?? [];
  const failed = bills?.unavailable ?? [];

  return (
    <div className="gis-meter-tab-body">
      <div className="gis-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="gis-card-title">Latest Bill</span>
          {status && <span className={`gis-packet-pill ${status === 'PAID' ? 'gis-packet-pill--good' : ''}`}>{status}</span>}
        </div>
        {failed.includes('bill') && <div style={{ fontSize: 12, color: '#B45309', marginBottom: 6 }}>The billing system did not answer.<button className="gis-layer-btn" onClick={onRetry} style={{ marginLeft: 6 }}>Retry</button></div>}
        {bill ? (
          <>
            <div className="gis-kv-row"><span className="gis-k">Billing Period</span><span className="gis-v">{day(bill.startDate)} — {day(bill.endDate)}</span></div>
            <div className="gis-kv-row"><span className="gis-k">Bill Date</span><span className="gis-v">{day(bill.date)}</span></div>
            <div className="gis-kv-row"><span className="gis-k">Due Date</span><span className="gis-v">{day(bill.dueDate)}</span></div>
            <div className="gis-kv-row"><span className="gis-k">Previous Reading</span><span className="gis-v">{dash(bill.prevReading)}</span></div>
            <div className="gis-kv-row"><span className="gis-k">Current Reading</span><span className="gis-v">{dash(bill.currentReading)}</span></div>
            <div className="gis-kv-row"><span className="gis-k">Consumption</span><span className="gis-v">{bill.consumption == null ? '—' : `${bill.consumption} KL`}</span></div>
            <div className="gis-kv-row">
              <span className="gis-k">Total Amount</span>
              <span className="gis-v" style={{ fontSize: 16, fontWeight: 700 }}>{money(bill.totalAmount ?? bill.amount)}</span>
            </div>
            {charges.length > 0 && (
              <div className="gis-drawer-table-wrap" style={{ marginTop: 8 }}>
                <table className="gis-mini-table">
                  <thead><tr><th>Charge</th><th style={{ textAlign: 'right' }}>Rate</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                  <tbody>
                    {charges.map((c, i) => (
                      <tr key={i}>
                        <td>{dash(c.chargeName)}</td>
                        <td style={{ textAlign: 'right' }}>{dash(c.rate)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(c.amountCharged)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          !failed.includes('bill') && <p style={{ color: '#64748B', fontSize: 13, margin: '8px 0 0 0' }}>No bill has been generated for this household yet.</p>
        )}
      </div>

      <div className="gis-card">
        <span className="gis-card-title">Water Tariff</span>
        {slabs.length > 0 ? (
          <div className="gis-drawer-table-wrap" style={{ marginTop: 8 }}>
            <table className="gis-mini-table">
              <thead><tr><th>From (KL)</th><th>To (KL)</th><th style={{ textAlign: 'right' }}>Rate / KL</th></tr></thead>
              <tbody>
                {[...slabs].sort((a, b) => a.minUnits - b.minUnits).map((s, i) => (
                  <tr key={i}>
                    <td>{s.minUnits}</td>
                    <td>{s.maxUnits == null ? 'and above' : s.maxUnits}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(s.ratePerUnit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: '#64748B', fontSize: 13, margin: '8px 0 0 0' }}>{failed.includes('tariff') ? 'The tariff could not be loaded.' : 'No tariff is configured for this site.'}</p>
        )}
      </div>
    </div>
  );
}
