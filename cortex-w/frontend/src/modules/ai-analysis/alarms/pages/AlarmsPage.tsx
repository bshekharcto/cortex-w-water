import { useState } from 'react';
import { FilterBar } from '@/components/filters/FilterBar';
import { StatusBadge } from '@/components/status/StatusBadge';
import { Drawer } from '@/components/drawer/Drawer';
import { alarmSeed, type SeedAlarm } from '@/data/seed/alarms/alarmSeed';
import { formatNumber } from '@/utils/number';

const SEVERITY_LABEL: Record<string, string> = { critical: 'Abnormal', high: 'Warning', medium: 'Delayed', low: 'Normal' };

export function AlarmsPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SeedAlarm | null>(null);

  const filtered = alarmSeed.filter(
    (a) => a.rule.toLowerCase().includes(search.toLowerCase()) || a.entityId.includes(search),
  );

  return (
    <div>
      <h2 className="cw-section-title">Alarms</h2>
      <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="Search alarms…" onReset={() => setSearch('')}>
        {null}
      </FilterBar>

      <div className="cw-surface cw-table-wrap">
        <table className="cw-table">
          <thead><tr><th>ID</th><th>Category</th><th>Rule</th><th>Severity</th><th>Status</th><th>Entity</th><th>Affected</th><th>Site</th></tr></thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id} className="cw-table-row--clickable" onClick={() => setSelected(a)}>
                <td style={{ fontWeight: 500 }}>{a.id}</td>
                <td>{a.category}</td>
                <td>{a.rule}</td>
                <td><StatusBadge status={SEVERITY_LABEL[a.severity] ?? a.severity} /></td>
                <td><StatusBadge status={a.status} /></td>
                <td>{a.entityType === 'gateway' ? a.entityId.slice(-8) : a.entityId}</td>
                <td>{a.affectedCount ? formatNumber(a.affectedCount) : '—'}</td>
                <td>{a.site}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.id ?? ''} subtitle={selected?.rule}>
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><strong>Category:</strong> {selected.category}</div>
            <div><strong>Description:</strong> {selected.description}</div>
            <div><strong>Severity:</strong> <StatusBadge status={SEVERITY_LABEL[selected.severity] ?? selected.severity} /></div>
            <div><strong>Status:</strong> <StatusBadge status={selected.status} /></div>
            <div><strong>Entity:</strong> {selected.entityType} — {selected.entityId}</div>
            {selected.affectedCount && <div><strong>Affected count:</strong> {formatNumber(selected.affectedCount)}</div>}
            <div><strong>Created:</strong> {selected.createdAt}</div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
