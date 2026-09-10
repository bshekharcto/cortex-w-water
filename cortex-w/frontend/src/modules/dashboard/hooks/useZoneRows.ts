import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ZoneRow } from '../models/dashboardRows';
import { fetchZoneRows } from '../services/dashboardDataService';

export function useZoneRows(searchQuery: string = '') {
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadZones = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchZoneRows();
      setZones(data);
    } catch (err: any) {
      console.error('[useZoneRows] Failed to load zone rows:', err);
      setError(err?.message || 'Failed to load zones');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadZones();
  }, [loadZones]);

  const filteredZones = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter((z) => z.zoneName.toLowerCase().includes(q));
  }, [zones, searchQuery]);

  return {
    zones: filteredZones,
    rawZones: zones,
    isLoading,
    error,
    refetch: loadZones,
  };
}
