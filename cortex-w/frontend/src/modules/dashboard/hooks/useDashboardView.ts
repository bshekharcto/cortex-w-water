import { useCallback, useEffect, useState } from 'react';
import type { DashboardView, MeterQueryParams } from '../models/dashboardView';
import { fetchDashboardView, describeError } from '../services/dashboardDataService';

interface Settled {
  nodeKey: string;
  requestKey: string;
  view: DashboardView | null;
  error: string | null;
}

/**
 * Loads one Dashboard screen (GET /dashboard/view) for `nodeId` (null = root)
 * with the leaf meter-list `query`.
 *
 *  - A response that arrives after the inputs changed (a slow request for a
 *    node the user already left) is discarded, never applied.
 *  - When only the meter query changes (next page, search, sort) on the same
 *    node, the previous result stays on screen, flagged `isFetching`, instead
 *    of blanking the table.
 *  - When the NODE changes, nothing from the previous node is returned:
 *    `view` is null and `isLoading` is true until the new one arrives, so a
 *    caller can't briefly act on the wrong node's data.
 */
export function useDashboardView(nodeId: string | null, query: MeterQueryParams) {
  const nodeKey = nodeId ?? '';
  const requestKey = JSON.stringify([nodeKey, query]);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stale = false;
    fetchDashboardView(nodeId, query)
      .then((view) => {
        if (!stale) setSettled({ nodeKey, requestKey, view, error: null });
      })
      .catch((err) => {
        console.error('[dashboard] Failed to load the dashboard view:', err);
        if (!stale) setSettled({ nodeKey, requestKey, view: null, error: describeError(err, 'Failed to load the dashboard') });
      });
    return () => {
      stale = true;
    };
    // `nodeId` and `query` are fully captured by requestKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, attempt]);

  const sameNode = settled !== null && settled.nodeKey === nodeKey;
  const current = settled !== null && settled.requestKey === requestKey ? settled : null;
  const shown = current ?? (sameNode ? settled : null);

  const refetch = useCallback(() => {
    setSettled(null);
    setAttempt((n) => n + 1);
  }, []);

  return {
    view: shown?.view ?? null,
    error: shown?.error ?? null,
    isLoading: shown === null,
    isFetching: current === null && shown !== null,
    refetch,
  };
}
