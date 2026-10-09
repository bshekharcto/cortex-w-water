import { useState, useEffect, useCallback, useRef } from 'react';
import { EMPTY_METER_PAGE, fetchNodeMeters, type MeterPage, type MeterSortField } from '../services/dashboardDataService';
import { useDataFreshness } from '@/components/layout/DataFreshness';

export const METERS_PAGE_SIZE = 15;

/**
 * One page of the meters attached to a node, sorted, searched and filtered by the server. Only meaningful for a real
 * leaf (a node with no further children) — call this once useNodeChildren for the same id has come back empty.
 * A new node, search, status or sort starts again at the first page; a slow answer never replaces a newer one.
 */
export function useNodeMeters(
  nodeId: string | null,
  searchQuery: string = '',
  statusFilter: 'ALL' | 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN' = 'ALL'
) {
  const [data, setData] = useState<MeterPage>(EMPTY_METER_PAGE);
  const [page, setPage] = useState<number>(0);
  const [sort, setSort] = useState<{ field: MeterSortField; dir: 'asc' | 'desc' }>({ field: 'devEui', dir: 'asc' });
  const [debouncedQuery, setDebouncedQuery] = useState<string>(searchQuery);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadedNode, setLoadedNode] = useState<string | null>(null); // the node whose first page has arrived
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  // typing in the search box asks the server once the user pauses, not on every key
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // another node, search or status: back to the first page
  useEffect(() => {
    setPage(0);
  }, [nodeId, debouncedQuery, statusFilter]);

  // `silent`: a reload by itself when new data has arrived. No loader and no error: the rows on screen stay until the new
  // values replace them.
  const load = useCallback(async (silent: boolean = false) => {
    if (!nodeId) {
      setData(EMPTY_METER_PAGE);
      setIsLoading(false);
      return;
    }
    const id = ++seq.current;
    if (!silent) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const result = await fetchNodeMeters(nodeId, {
        page,
        size: METERS_PAGE_SIZE,
        sort: sort.field,
        dir: sort.dir,
        q: debouncedQuery,
        status: statusFilter,
      });
      if (id !== seq.current) return;
      setData(result);
      setLoadedNode(nodeId);
      if (result.page !== page) setPage(result.page); // the list shrank: the server answered with the first page
    } catch (err: any) {
      if (id !== seq.current || silent) return;
      console.error('[useNodeMeters] Failed to load node meters:', err);
      setError(err?.message || 'Failed to load meters');
    } finally {
      if (id === seq.current && !silent) setIsLoading(false);
    }
  }, [nodeId, page, sort, debouncedQuery, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // new data has arrived: update the page on screen in place
  const { version } = useDataFreshness();
  useEffect(() => {
    if (version > 0) load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const toggleSort = useCallback((field: MeterSortField) => {
    setSort((current) => (current.field === field ? { field, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }));
    setPage(0);
  }, []);

  return {
    meters: data.content,
    total: data.total,
    totalPages: data.totalPages,
    page,
    setPage,
    sort,
    toggleSort,
    summary: data.summary,
    isLoading,
    /** True until the first page of the current node has arrived (later pages keep the cards and the table on screen). */
    isFirstLoad: !!nodeId && loadedNode !== nodeId && isLoading,
    error,
    refetch: () => load(),
  };
}
