import { useState, useEffect, useCallback } from 'react';
import type { ScopeNode } from '../models/dashboardScope';
import { fetchNodeAncestors, describeError } from '../services/dashboardDataService';

/**
 * Resolves the real root-to-node name chain for the current node id — the
 * single source of truth for the breadcrumb. Always fetched fresh from the
 * real site tree rather than relying on names cached from prior clicks, so
 * a pasted deep link or a page refresh mid-path still renders correctly.
 */
export function useNodeAncestors(nodeId: string | null) {
  const [ancestors, setAncestors] = useState<ScopeNode[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(!!nodeId);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!nodeId) {
      setAncestors([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const chain = await fetchNodeAncestors(nodeId);
      setAncestors(chain);
    } catch (err) {
      console.error('[useNodeAncestors] Failed to resolve breadcrumb:', err);
      setAncestors([]);
      setError(describeError(err, 'Failed to resolve the breadcrumb'));
    } finally {
      setIsLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    load();
  }, [load]);

  return { ancestors, isLoading, error, refetch: load };
}
