import type { TrafficBucket } from '../types/commandCenter.types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-06T14:20" -> parts, without going through Date (so no timezone can shift it). */
function parts(t: string) {
  const [d, hm = '00:00'] = t.split('T');
  const [y, m, day] = d.split('-').map(Number);
  return { y, m, day, hm };
}

/** Short axis label: a day for daily buckets, a clock time otherwise. */
export function formatBucketTick(t: string, bucket: TrafficBucket): string {
  const p = parts(t);
  if (bucket === '1d') return `${String(p.day).padStart(2, '0')} ${MONTHS[p.m - 1]}`;
  return p.hm;
}

/** Full label for a tooltip: "06 Oct" for days, "06 Oct 14:20" for finer buckets. */
export function formatBucketTooltip(t: string, bucket: TrafficBucket): string {
  const p = parts(t);
  const day = `${String(p.day).padStart(2, '0')} ${MONTHS[p.m - 1]}`;
  return bucket === '1d' ? day : `${day} ${p.hm}`;
}

/** Human size of a bucket, for the chart caption. */
export function bucketSizeLabel(bucket: TrafficBucket): string {
  return { '5m': '5-minute', '15m': '15-minute', '1h': 'hourly', '1d': 'daily' }[bucket];
}

/** Percent change from `prev` to `cur`; null when there is nothing to compare against. */
export function percentChange(cur: number, prev: number): number | null {
  if (!prev || prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}
