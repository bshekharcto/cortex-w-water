import { MapPin, Gauge, Activity, WifiOff, EyeOff, Droplets } from 'lucide-react';
import { KpiCard } from '@/components/cards/KpiCard';
import { formatNumber } from '@/utils/number';
import type { DashboardKpis } from '../models/dashboardKpis';

interface DashboardKpiRowProps {
  isLeaf: boolean; // true = currently showing meters (no "child areas" concept)
  kpis: DashboardKpis | null;
  isLoading?: boolean;
  selectedStatusFilter?: 'ALL' | 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN';
  onStatusFilterChange?: (status: 'ALL' | 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN') => void;
}

export function DashboardKpiRow({
  isLeaf,
  kpis,
  isLoading,
  selectedStatusFilter = 'ALL',
  onStatusFilterChange,
}: DashboardKpiRowProps) {
  if (isLoading || !kpis) {
    return (
      <div className="cw-kpi-wrap" style={{ marginBottom: 24 }}>
        <div className="cw-kpi-grid cw-kpi-grid--balanced" data-cards={isLeaf ? 7 : 8}>
          {[...Array(isLeaf ? 7 : 8)].map((_, idx) => (
            <div
              key={idx}
              className="cw-surface cw-kpi-card"
              style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}
            >
              <div className="cw-spinner" style={{ width: 24, height: 24 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const handleStatusClick = (status: 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN') => {
    if (!onStatusFilterChange) return;
    if (selectedStatusFilter === status) {
      onStatusFilterChange('ALL');
    } else {
      onStatusFilterChange(status);
    }
  };

  return (
    <div className="cw-kpi-wrap" style={{ marginBottom: 24 }}>
    <div className="cw-kpi-grid cw-kpi-grid--balanced" data-cards={isLeaf ? 7 : 8}>
      {/* 1. Child area count — hidden once drilled down to a leaf (meters) */}
      {!isLeaf && (
        <KpiCard
          icon={MapPin}
          iconTone="primary"
          label="Areas Below"
          value={formatNumber(kpis.childAreaCount ?? 0)}
          subtitle="Configured sub-areas"
        />
      )}

      {/* 2. Total Devices */}
      <KpiCard
        icon={Gauge}
        iconTone="blue"
        label="Total Devices"
        value={formatNumber(kpis.totalDevices)}
        subtitle="Provisioned in scope"
      />

      {/* 3. Connected */}
      <KpiCard
        icon={Activity}
        iconTone="green"
        label="Connected"
        value={formatNumber(kpis.connected)}
        subtitle={`${kpis.connectedPct.toFixed(2)}% active telemetry`}
        onClick={onStatusFilterChange ? () => handleStatusClick('CONNECTED') : undefined}
      />

      {/* 4. Disconnected */}
      <KpiCard
        icon={WifiOff}
        iconTone="orange"
        label="Disconnected"
        value={formatNumber(kpis.disconnected)}
        subtitle={`${kpis.disconnectedPct.toFixed(2)}% stale telemetry`}
        onClick={onStatusFilterChange ? () => handleStatusClick('DISCONNECTED') : undefined}
      />

      {/* 5. Never Seen */}
      <KpiCard
        icon={EyeOff}
        iconTone="red"
        label="Never Seen"
        value={formatNumber(kpis.neverSeen)}
        subtitle={`${kpis.neverSeenPct.toFixed(2)}% no packets yet`}
        onClick={onStatusFilterChange ? () => handleStatusClick('NEVER_SEEN') : undefined}
      />

      {/* 6. Yesterday Flow (m³) */}
      <KpiCard
        icon={Droplets}
        iconTone="blue"
        label="Yesterday Flow (m³)"
        value={formatNumber(Math.round(kpis.yesterdayFlowM3))}
        subtitle="Full calendar day"
      />

      {/* 7. Today's Flow (m³) */}
      <KpiCard
        icon={Droplets}
        iconTone="teal"
        label="Today's Flow (m³)"
        value={formatNumber(Math.round(kpis.todayFlowM3))}
        subtitle="Day-to-date total"
      />

      {/* 8. Monthly Flow (m³) */}
      <KpiCard
        icon={Droplets}
        iconTone="primary"
        label="Monthly Flow (m³)"
        value={formatNumber(Math.round(kpis.monthToDateFlowM3))}
        subtitle="Month-to-date total"
      />
    </div>
    </div>
  );
}
