import type { ScopeNode } from '../models/dashboardScope';
import { fetchNodeAncestors } from '../services/dashboardDataService';
import { useKeyedFetch } from './useKeyedFetch';

const NO_ANCESTORS: ScopeNode[] = [];

/**
 * Resolves the real root-to-node name chain for the current node id — the
 * single source of truth for the breadcrumb. Always fetched fresh from the
 * real site tree rather than relying on names cached from prior clicks, so
 * a pasted deep link or a page refresh mid-path still renders correctly.
 */
export function useNodeAncestors(nodeId: string | null) {
  const { data, isLoading, error, refetch } = useKeyedFetch<ScopeNode[]>(
    nodeId,
    (id) => fetchNodeAncestors(id as string),
    NO_ANCESTORS,
    nodeId !== null,
    'Failed to resolve the breadcrumb'
  );
  return { ancestors: data, isLoading, error, refetch };
}
