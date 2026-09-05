import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { FilterBar } from '@/components/filters/FilterBar';
import { StatusBadge } from '@/components/status/StatusBadge';
import { EmptyState } from '@/components/empty-state/EmptyState';

const billSeedRows = [
  { id: 5001, householdId: 'WS/BMC/1520247', assetId: '0024004061', billDate: '2026-08-15', dueDate: '2026-09-15', consumption: 12.4, amount: 186.00, status: 'Pending' as const },
  { id: 5002, householdId: 'WS/BMC/1490971', assetId: '0024004067', billDate: '2026-08-15', dueDate: '2026-09-15', consumption: 8.2, amount: 123.00, status: 'Paid' as const },
  { id: 5003, householdId: 'WS/BMC/1488809', assetId: '0024004068', billDate: '2026-07-15', dueDate: '2026-08-15', consumption: 15.7, amount: 235.50, status: 'Overdue' as const },
];

export function BillingPage() {
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);

  const filtered = billSeedRows.filter(
    (b) => b.householdId.toLowerCase().includes(search.toLowerCase()),
  );

  function handleDelete(id: number) {
    // Spec guardrail #18: "Do not delete a Household or Bill without confirmation."
    if (deleting === id) {
      // second click = confirmed
      setDeleting(null);
      // In API mode: billingApi.deleteBill(id) + invalidate query
    } else {
      setDeleting(id);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 className="cw-section-title" style={{ margin: 0 }}>Billing</h2>
        <button className="cw-button-primary" style={{ width: 'auto', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> Generate Bill
        </button>
      </div>

      <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search by consumer ID…" onReset={() => setSearch('')}>
        {/* date range, status filter children go here */}
      </FilterBar>

      {filtered.length === 0 ? (
        <EmptyState message="No bills generated for this date range." />
      ) : (
        <div className="cw-surface cw-table-wrap">
          <table className="cw-table">
            <thead><tr><th>Bill #</th><th>Consumer ID</th><th>Meter</th><th>Bill Date</th><th>Due</th><th>Consumption KL</th><th>Amount ₹</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 500 }}>{b.id}</td>
                  <td>{b.householdId}</td>
                  <td>{b.assetId}</td>
                  <td>{b.billDate}</td>
                  <td>{b.dueDate}</td>
                  <td>{b.consumption}</td>
                  <td>₹{b.amount.toFixed(2)}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td>
                    <button
                      className="cw-icon-btn"
                      onClick={() => handleDelete(b.id)}
                      aria-label={deleting === b.id ? 'Confirm delete' : 'Delete bill'}
                      style={deleting === b.id ? { color: 'var(--cw-red)' } : {}}
                      title={deleting === b.id ? 'Click again to confirm deletion' : 'Delete'}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ font: 'var(--cw-font-meta)', color: 'var(--cw-text-faint)', marginTop: 12 }}>
        Bill amounts are computed server-side — spec 26.8. The frontend displays consumption (currentReading − prevReading) but never calculates the monetary amount.
      </p>
    </div>
  );
}
