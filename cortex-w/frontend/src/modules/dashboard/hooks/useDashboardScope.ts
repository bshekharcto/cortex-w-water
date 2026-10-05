import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

/**
 * Reads the current node id out of the URL. The route is a single splat
 * (/app/dashboard/*), so however many real levels deep the user has
 * navigated, this just returns the last segment — the id to fetch children
 * (or meters) for. Depth-agnostic by construction: there's no fixed
 * zoneId/dmaId param pair to run out of.
 */
export function useDashboardScope(): { currentNodeId: string | null; pathIds: string[] } {
  const params = useParams();
  const splat = (params['*'] as string) || '';

  return useMemo(() => {
    const pathIds = splat.split('/').map((s) => s.trim()).filter(Boolean);
    return {
      pathIds,
      currentNodeId: pathIds.length > 0 ? pathIds[pathIds.length - 1] : null,
    };
  }, [splat]);
}
