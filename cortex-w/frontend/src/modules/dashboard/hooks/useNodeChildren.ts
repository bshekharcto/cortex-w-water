import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
const EMPTY: NodeRow[] = [];

export function useNodeChildren(parentId: string | null, searchQuery: string = '', enabled: boolean = true) {
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined); // the parent whose children `nodes` holds
  const seq = useRef(0);

  // `silent`: a reload by itself when new data has arrived. No loader and no error: what is on screen stays until the new
  // values replace it.
  const loadNodes = useCallback(async (silent: boolean = false) => {
    if (!enabled) {
      setNodes([]);
      setIsLoading(false);
      return;
    }
    const id = ++seq.current; // a slow answer for an earlier level never replaces a newer one
    if (!silent) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const data = await fetchNodeChildren(parentId);
      if (id !== seq.current) return;
      setNodes(data);
      setLoadedFor(parentId);
    } catch (err: any) {
      if (id !== seq.current || silent) return;
      console.error('[useNodeChildren] Failed to load node children:', err);
      setError(err?.message || 'Failed to load');
    } finally {
      if (id === seq.current && !silent) setIsLoading(false);
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

  // rows of another level (still held for a moment after navigating) are never handed out, and count as loading
  const current = enabled ? loadedFor === parentId : true;
  const heldNodes = current ? nodes : EMPTY;

  const filteredNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return heldNodes;
    return heldNodes.filter((n) => n.name.toLowerCase().includes(q));
  }, [heldNodes, searchQuery]);

  return {
    nodes: filteredNodes,
    rawNodes: heldNodes,
    isLoading: isLoading || (enabled && !current && !error),
    error,
    refetch: () => loadNodes(),
  };
}
