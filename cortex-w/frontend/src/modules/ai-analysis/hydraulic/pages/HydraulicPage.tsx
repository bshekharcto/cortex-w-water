import { AlertTriangle } from 'lucide-react';
import { KpiCard } from '@/components/cards/KpiCard';
import { hydraulicSeed, HYDRAULIC_SEED_PROVENANCE } from '@/data/seed/hydraulic/hydraulicSeed';
import { formatNumber } from '@/utils/number';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts';

const { waterBalance: wb, demandProfile, dmaRanking } = hydraulicSeed;

/**
 * Spec 14.1: "There is currently NO backend API for hydraulic data."
 * This page always renders synthetic seed data and shows a clear indicator.
 * The repository is ready for a future API (hydraulicIsAlwaysSeed flag).
 */
export function HydraulicPage() {
  return (
    <div>
      {/* Demo-data indicator — spec 14.1 */}
      <div className="cw-surface" style={{ padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--cw-orange-soft)', borderColor: 'var(--cw-orange)' }}>
        <AlertTriangle size={16} style={{ color: 'var(--cw-orange)' }} />
        <span style={{ fontSize: 13 }}>
          Hydraulic analysis data is synthetic demo data (provenance: <code>{HYDRAULIC_SEED_PROVENANCE}</code>).
          This module does not connect to a backend API yet.
        </span>
      </div>

      <h2 className="cw-section-title">Hydraulic Analysis</h2>

      {/* Water Balance — spec 14.3 */}
      <section className="cw-section">
        <h3 style={{ font: 'var(--cw-font-section-title)', marginBottom: 12 }}>Water Balance</h3>
        <div className="cw-kpi-grid">
          <KpiCard icon={AlertTriangle} iconTone="blue" label="Total System Input" value={`${formatNumber(wb.totalInputM3)} m³`} />
          <KpiCard icon={AlertTriangle} iconTone="green" label="Authorized Consumption" value={`${formatNumber(wb.authorizedConsumptionM3)} m³`} />
          <KpiCard icon={AlertTriangle} iconTone="red" label="Non-Revenue Water" value={`${formatNumber(wb.nonRevenueWaterM3)} m³`} subtitle={`${wb.nrwPercent}%`} />
        </div>
      </section>

      {/* Demand Profile — spec 14.4 */}
      <section className="cw-section">
        <h3 style={{ font: 'var(--cw-font-section-title)', marginBottom: 12 }}>24h Demand Profile</h3>
        <div className="cw-surface" style={{ padding: 'var(--cw-card-padding)' }}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={demandProfile.hourly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cw-border)" />
              <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="demandM3" stroke="var(--cw-blue)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* DMA Ranking — spec 14.5 */}
      <section className="cw-section">
        <h3 style={{ font: 'var(--cw-font-section-title)', marginBottom: 12 }}>DMA Ranking</h3>
        <div className="cw-surface cw-table-wrap">
          <table className="cw-table">
            <thead><tr><th>DMA</th><th>Name</th><th>Meters</th><th>Avg KL</th><th>NRW %</th><th>Pressure bar</th><th>Anomalies</th></tr></thead>
            <tbody>
              {dmaRanking.map((d) => (
                <tr key={d.dmaId}>
                  <td style={{ fontWeight: 500 }}>{d.dmaId}</td>
                  <td>{d.name}</td>
                  <td>{d.meterCount}</td>
                  <td>{d.avgConsumptionKL}</td>
                  <td style={{ color: d.nrwPercent > 20 ? 'var(--cw-red)' : 'var(--cw-green)' }}>{d.nrwPercent}%</td>
                  <td>{d.pressureBar}</td>
                  <td>{d.anomalies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
