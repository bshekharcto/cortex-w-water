import { useCallback, useEffect, useRef, useState, type UIEvent } from 'react';

/**
 * Minimal fixed-row-height windowing for large tables: only the rows in (and just around) the viewport are
 * rendered, with spacer rows standing in for the rest. Rows MUST be exactly `rowHeight` px tall.
 * `resetKey` scrolls back to the top when the underlying list changes (filter, search, new gateway).
 */
export function useVirtualRows(count: number, resetKey: string, rowHeight = 40, overscan = 10) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(520);
  const frame = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setViewport(el.clientHeight || 520);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [resetKey]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const onScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setScrollTop(top));
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(count, Math.ceil((scrollTop + viewport) / rowHeight) + overscan);
  return { containerRef, onScroll, start, end, padTop: start * rowHeight, padBottom: Math.max(0, (count - end) * rowHeight) };
}
