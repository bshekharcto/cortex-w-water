import { useCallback, useEffect, useRef, useState } from 'react';
import { RawFrameItem } from '../types/commandCenter.types';
import { fetchGatewayFrames, windowKey, type WindowParams } from '@/services/api/commandCenterApi';
import { GatewayFramesTable } from './GatewayFramesTable';
import { describeError, isAbortError } from '../utils/errors';

interface Props {
  gatewayId: string;
  gatewayAlias: string;
  win: WindowParams;
  /** Changes whenever the page refreshes its summary, so this list stays current with it. */
  refreshToken?: string;
  onSelectFrameMeter: (meterId: string) => void;
}

const PAGE_SIZE = 100;

/** Latest Frames tab: the newest frames that actually came through the selected gateway. */
export function GatewayFramesPanel({ gatewayId, gatewayAlias, win, refreshToken, onSelectFrameMeter }: Props) {
  const [frames, setFrames] = useState<RawFrameItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const scopeKey = `${gatewayId}|${windowKey(win)}`;
  const lastScope = useRef('');

  const load = useCallback(
    async (offset: number) => {
      const id = ++seq.current;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);
      try {
        const page = await fetchGatewayFrames(gatewayId, win, { limit: PAGE_SIZE, offset, signal: ctrl.signal });
        if (id !== seq.current) return;
        setTotal(page.total);
        setFrames((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
      } catch (err) {
        if (isAbortError(err)) return;
        if (id === seq.current) setError(describeError(err, 'Failed to load frames'));
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [gatewayId, win]
  );

  // New gateway/window starts clean; a plain refresh keeps the current rows on screen until new ones arrive
  useEffect(() => {
    if (lastScope.current !== scopeKey) {
      lastScope.current = scopeKey;
      setFrames([]);
      setTotal(0);
    }
    load(0);
  }, [load, scopeKey, refreshToken]);

  return (
    <GatewayFramesTable
      frames={frames}
      total={total}
      loading={loading}
      error={error}
      gatewayAlias={gatewayAlias}
      onSelectFrameMeter={onSelectFrameMeter}
      onLoadMore={() => load(frames.length)}
    />
  );
}
