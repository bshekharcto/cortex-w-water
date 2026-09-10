import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import type { DashboardScope } from '../models/dashboardScope';

function humanize(str?: string): string {
  if (!str) return '';
  return str
    .replace(/^demo-|^zone-|^dma-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function useDashboardScope(resolvedNames?: { zoneName?: string; dmaName?: string }): DashboardScope {
  const { zoneId, dmaId } = useParams<{ zoneId?: string; dmaId?: string }>();

  return useMemo(() => {
    if (zoneId && dmaId) {
      return {
        level: 'DMA',
        zoneId,
        zoneName: resolvedNames?.zoneName || humanize(zoneId),
        dmaId,
        dmaName: resolvedNames?.dmaName || humanize(dmaId),
      };
    }

    if (zoneId) {
      return {
        level: 'ZONE',
        zoneId,
        zoneName: resolvedNames?.zoneName || humanize(zoneId),
      };
    }

    return { level: 'GLOBAL' };
  }, [zoneId, dmaId, resolvedNames?.zoneName, resolvedNames?.dmaName]);
}
