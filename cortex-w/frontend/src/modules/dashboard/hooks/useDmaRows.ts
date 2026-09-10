import { useState, useEffect, useCallback, useMemo } from 'react';
import type { DmaRow } from '../models/dashboardRows';
import { fetchDmaRows } from '../services/dashboardDataService';

export function useDmaRows(zoneId: string, searchQuery: string = '') {
  const [dmas, setDmas] = useState<DmaRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadDmas = useCallback(async () => {
    if (!zoneId) {
      setDmas([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchDmaRows(zoneId);
      setDmas(data);
    } catch (err: any) {
      console.error('[useDmaRows] Failed to load DMA rows:', err);
      setError(err?.message || 'Failed to load DMAs');
    } finally {
      setIsLoading(false);
    }
  }, [zoneId]);

  useEffect(() => {
    loadDmas();
  }, [loadDmas]);

  const filteredDmas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return dmas;
    return dmas.filter((d) => d.dmaName.toLowerCase().includes(q));
  }, [dmas, searchQuery]);

  return {
    dmas: filteredDmas,
    rawDmas: dmas,
    isLoading,
    error,
    refetch: loadDmas,
  };
}
