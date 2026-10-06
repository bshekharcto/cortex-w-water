import { useState, useEffect, useCallback, useMemo } from 'react';
import type { MeterRow } from '../models/dashboardRows';
import { fetchNodeMeters, describeError } from '../services/dashboardDataService';

/**
 * Fetches the meters directly attached to a node. Only meaningful for a
 * real leaf (a node with no further children) — call this once
 * useNodeChildren for the same id has come back empty.
 */
export function useNodeMeters(
  nodeId: string | null,
  searchQuery: string = '',
  statusFilter: 'ALL' | 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN' = 'ALL'
) {
  const [meters, setMeters] = useState<MeterRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadMeters = useCallback(async () => {
    if (!nodeId) {
      setMeters([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchNodeMeters(nodeId);
      setMeters(data);
    } catch (err) {
      console.error('[useNodeMeters] Failed to load node meters:', err);
      setMeters([]);
      setError(describeError(err, 'Failed to load meters'));
    } finally {
      setIsLoading(false);
    }
  }, [nodeId]);

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
          (m.devEui && m.devEui.toLowerCase().includes(q)) ||
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
