import { useState, useEffect, useCallback, useMemo } from 'react';
import type { NodeRow } from '../models/dashboardRows';
import { fetchNodeChildren } from '../services/dashboardDataService';

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

  const loadNodes = useCallback(async () => {
    if (!enabled) {
      setNodes([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchNodeChildren(parentId);
      setNodes(data);
    } catch (err: any) {
      console.error('[useNodeChildren] Failed to load node children:', err);
      setError(err?.message || 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [parentId, enabled]);

  useEffect(() => {
    loadNodes();
  }, [loadNodes]);

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
    refetch: loadNodes,
  };
}
