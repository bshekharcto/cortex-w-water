import { useMemo } from 'react';
import type { NodeRow } from '../models/dashboardRows';
import { fetchNodeChildren } from '../services/dashboardDataService';
import { useKeyedFetch } from './useKeyedFetch';

const NO_NODES: NodeRow[] = [];

/**
 * Fetches the direct children of a node — or the real top-level sites when
 * `parentId` is null. Depth-agnostic: this one hook drives every level of
 * the drill-down, however deep the real hierarchy actually goes.
 *
 * `enabled: false` skips fetching entirely (used when this hook is reused
 * to look up a sibling list only in some branches — e.g. recovering a node's
 * own row from its parent's children — so it doesn't redundantly re-fetch on
 * every render where that branch isn't active).
 */
export function useNodeChildren(parentId: string | null, searchQuery: string = '', enabled: boolean = true) {
  const { data, isLoading, error, refetch } = useKeyedFetch<NodeRow[]>(
    parentId,
    fetchNodeChildren,
    NO_NODES,
    enabled,
    'Failed to load areas'
  );

  const filteredNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return data;
    return data.filter((n) => n.name.toLowerCase().includes(q));
  }, [data, searchQuery]);

  return {
    nodes: filteredNodes,
    rawNodes: data,
    isLoading,
    error,
    refetch,
  };
}
