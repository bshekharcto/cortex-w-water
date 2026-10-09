import { useState, useEffect, useCallback, useMemo } from 'react';
import type { NodeRow } from '../models/dashboardRows';
import { fetchNodeChildren } from '../services/dashboardDataService';
import { useDataFreshness } from '@/components/layout/DataFreshness';

/**
 * Fetches the direct children of a node — or the real top-level sites when
 * `parentId` is null. Depth-agnostic: this one hook drives every level of
 * the drill-down, however deep the real hierarchy actually goes.
 *
 * `enabled: false` skips fetching entirely (used when this hook is reused
 * to look up a sibling list only in some branches — e.g. recovering a leaf
 * node's own totals from its parent's children — so it doesn't redundantly
 * re-fetch the root list on every render where that branch isn't active).
 */
export function useNodeChildren(parentId: string | null, searchQuery: string = '', enabled: boolean = true) {
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  // `silent`: a reload by itself when new data has arrived. No loader and no error: what is on screen stays until the new
  // values replace it.
  const loadNodes = useCallback(async (silent: boolean = false) => {
    if (!enabled) {
      setNodes([]);
      setIsLoading(false);
      return;
    }
    if (!silent) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const data = await fetchNodeChildren(parentId);
      // fetchNodeChildren answers [] when the request failed: a quiet reload must not blank what is on screen
      setNodes((prev) => (silent && data.length === 0 && prev.length > 0 ? prev : data));
    } catch (err: any) {
      if (silent) return;
      console.error('[useNodeChildren] Failed to load node children:', err);
      setError(err?.message || 'Failed to load');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [parentId, enabled]);

  useEffect(() => {
    loadNodes();
  }, [loadNodes]);

  // new data has arrived: update the values in place
  const { version } = useDataFreshness();
  useEffect(() => {
    if (version > 0) loadNodes(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const filteredNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter((n) => n.name.toLowerCase().includes(q));
  }, [nodes, searchQuery]);

  return {
    nodes: filteredNodes,
    rawNodes: nodes,
    isLoading,
    error,
    refetch: () => loadNodes(),
  };
}
