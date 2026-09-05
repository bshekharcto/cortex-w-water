import { useNavigate } from 'react-router-dom';
import { Home, Gauge, MapPin, CalendarPlus, Activity, Droplets, AlertTriangle, Radio as RadioIcon, ShieldCheck, Waves } from 'lucide-react';
import { KpiCard } from '@/components/cards/KpiCard';
import { StatusBadge } from '@/components/status/StatusBadge';
import { dashboardSeed } from '@/data/seed/telemetry/dashboardSeed';
import { formatNumber } from '@/utils/number';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const { installation: inst, supply, network: net, trend7d, attention } = dashboardSeed;

export function DashboardPage() {
  const nav = useNavigate();

  const trendData = trend7d.labels.map((l, i) => ({
    date: l,
    meters: trend7d.reportingMeters[i],
    consumption: trend7d.consumption[i],
  }));

  return (
    <div>
      {/* Section A — Installation & Configuration */}
      <section className="cw-section">
        <h2 className="cw-section-title">Installation & Configuration</h2>
        <div className="cw-kpi-grid">
          <KpiCard icon={Home} iconTone="primary" label="Households Onboarded" value={formatNumber(inst.householdsOnboarded)} subtitle="Total registered households" onClick={() => nav('/app/consumer/households')} />
          <KpiCard icon={Gauge} iconTone="blue" label="Meters Configured" value={formatNumber(inst.metersConfigured)} subtitle="Devices provisioned" />
          <KpiCard icon={MapPin} iconTone="teal" label="Households Mapped" value={formatNumber(inst.householdsMapped)} subtitle="Linked to a meter" />
          <KpiCard icon={CalendarPlus} iconTone="green" label="Installations Today" value={String(inst.installationsToday)} subtitle="04 Sep 2026" />
          <KpiCard icon={Activity} iconTone="green" label="Reporting Meters" value={formatNumber(inst.reportingMeters)} subtitle="Unique in latest telemetry" onClick={() => nav('/app/command-center')} />
        </div>
      </section>

      {/* Section B — Water Supply Performance */}
      <section className="cw-section">
        <h2 className="cw-section-title">Water Supply Performance</h2>
        <div className="cw-kpi-grid">
          <KpiCard icon={Droplets} iconTone="blue" label="Total Consumption" value={`${formatNumber(supply.totalConsumptionKL)} KL`} />
          <KpiCard icon={Gauge} iconTone="teal" label="Avg per Active Meter" value={`${supply.avgConsumptionPerMeterKL} KL`} />
          <KpiCard icon={AlertTriangle} iconTone="red" label="No Supply / No Reporting" value={formatNumber(supply.noSupply)} />
          <KpiCard icon={Waves} iconTone="orange" label="Valve Abnormal" value={formatNumber(supply.valveAbnormal)} onClick={() => nav('/app/ai/alarms')} />
        </div>
      </section>

      {/* Section C — Network Availability */}
      <section className="cw-section">
        <h2 className="cw-section-title">Network Availability</h2>
        <div className="cw-kpi-grid">
          <KpiCard icon={RadioIcon} iconTone="primary" label="Configured Gateways" value={String(net.configuredGateways)} />
          <KpiCard icon={RadioIcon} iconTone="green" label="Gateways Reporting" value={`${net.gatewaysReporting} / ${net.configuredGateways}`} />
          <KpiCard icon={Activity} iconTone="blue" label="Reporting Meters" value={formatNumber(net.reportingMeters)} />
          <KpiCard icon={ShieldCheck} iconTone="green" label="Checksum OK" value={`${net.checksumOk}%`} subtitle="Data integrity" />
        </div>
      </section>

      {/* Section D — 7-day trends */}
      <section className="cw-section">
        <h2 className="cw-section-title">7-Day Trends</h2>
        <div className="cw-surface" style={{ padding: 'var(--cw-card-padding)' }}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cw-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="meters" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="kl" orientation="right" tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line yAxisId="meters" type="monotone" dataKey="meters" stroke="var(--cw-primary)" strokeWidth={2} name="Reporting Meters" dot={false} />
              <Line yAxisId="kl" type="monotone" dataKey="consumption" stroke="var(--cw-teal)" strokeWidth={2} name="Consumption KL" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Section E — Attention Required */}
      <section className="cw-section">
        <h2 className="cw-section-title">Attention Required</h2>
        <div className="cw-surface cw-table-wrap">
          <table className="cw-table">
            <thead>
              <tr>
                <th>Severity</th><th>Issue</th><th>Entity</th><th>Site</th><th>Age</th><th></th>
              </tr>
            </thead>
            <tbody>
              {attention.map((a, i) => (
                <tr key={i} className="cw-table-row--clickable" onClick={() => nav(a.link)}>
                  <td><StatusBadge status={a.severity === 'critical' ? 'Abnormal' : a.severity === 'high' ? 'Warning' : 'Normal'} /></td>
                  <td>{a.issue}</td>
                  <td>{a.entity}</td>
                  <td>{a.site}</td>
                  <td>{a.ageHours}h</td>
                  <td style={{ color: 'var(--cw-primary)', cursor: 'pointer' }}>View</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
