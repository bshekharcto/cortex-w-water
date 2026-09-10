import { useState, useEffect, useCallback } from 'react';
import type { DashboardScope } from '../models/dashboardScope';
import type { DashboardKpis } from '../models/dashboardKpis';
import { fetchScopeKpis } from '../services/dashboardDataService';

export function useDashboardKpis(scope: DashboardScope) {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const scopeKey = scope.level === 'GLOBAL'
    ? 'GLOBAL'
    : scope.level === 'ZONE'
    ? `ZONE_${scope.zoneId}`
    : `DMA_${scope.zoneId}_${scope.dmaId}`;

  const loadKpis = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchScopeKpis(scope);
      setKpis(data);
    } catch (err: any) {
      console.error('[useDashboardKpis] Error loading scope KPIs:', err);
      setError(err?.message || 'Failed to load KPIs');
    } finally {
      setIsLoading(false);
    }
  }, [scopeKey]);

  useEffect(() => {
    loadKpis();
  }, [loadKpis]);

  return { kpis, isLoading, error, refetch: loadKpis };
}
