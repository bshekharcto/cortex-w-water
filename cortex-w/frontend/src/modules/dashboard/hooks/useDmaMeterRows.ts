import { useState, useEffect, useCallback, useMemo } from 'react';
import type { MeterRow } from '../models/dashboardRows';
import { fetchDmaMeterRows } from '../services/dashboardDataService';

export function useDmaMeterRows(
  zoneId: string,
  dmaId: string,
  searchQuery: string = '',
  statusFilter: 'ALL' | 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN' = 'ALL'
) {
  const [meters, setMeters] = useState<MeterRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadMeters = useCallback(async () => {
    if (!zoneId || !dmaId) {
      setMeters([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchDmaMeterRows(zoneId, dmaId);
      setMeters(data);
    } catch (err: any) {
      console.error('[useDmaMeterRows] Failed to load DMA meters:', err);
      setError(err?.message || 'Failed to load meters');
    } finally {
      setIsLoading(false);
    }
  }, [zoneId, dmaId]);

  useEffect(() => {
    loadMeters();
  }, [loadMeters]);

  const filteredMeters = useMemo(() => {
    let result = meters;

    if (statusFilter !== 'ALL') {
      result = result.filter((m) => m.connectivityStatus === statusFilter);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (m) =>
          m.meterId.toLowerCase().includes(q) ||
          m.deviceId.toLowerCase().includes(q) ||
          (m.consumerName && m.consumerName.toLowerCase().includes(q)) ||
          (m.consumerId && m.consumerId.toLowerCase().includes(q)) ||
          (m.address && m.address.toLowerCase().includes(q))
      );
    }

    return result;
  }, [meters, searchQuery, statusFilter]);

  return {
    meters: filteredMeters,
    rawMeters: meters,
    isLoading,
    error,
    refetch: loadMeters,
  };
}
