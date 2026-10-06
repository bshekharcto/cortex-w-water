import { useMemo } from 'react';
import type { MeterRow } from '../models/dashboardRows';
import { fetchNodeMeters } from '../services/dashboardDataService';
import { useKeyedFetch } from './useKeyedFetch';

const NO_METERS: MeterRow[] = [];

/**
 * Fetches the meters directly attached to a node. Only meaningful for a
 * real leaf (a node with no further children) — pass a null `nodeId` until
 * the node is known to be a leaf, which skips the fetch.
 *
 * `rawMeters` is the full, unfiltered list (use it for counts/KPIs);
 * `meters` is the search/status-filtered view for the table.
 */
export function useNodeMeters(
  nodeId: string | null,
  searchQuery: string = '',
  statusFilter: 'ALL' | 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN' = 'ALL'
) {
  const { data, isLoading, error, refetch } = useKeyedFetch<MeterRow[]>(
    nodeId,
    (id) => fetchNodeMeters(id as string),
    NO_METERS,
    nodeId !== null,
    'Failed to load meters'
  );

  const filteredMeters = useMemo(() => {
    let result = data;

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
  }, [data, searchQuery, statusFilter]);

  return {
    meters: filteredMeters,
    rawMeters: data,
    isLoading,
    error,
    refetch,
  };
}
