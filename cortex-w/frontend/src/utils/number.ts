/** Indian locale number formatting (e.g. 1,93,125) */
export function formatNumber(n: number | string): string {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '—';
  return num.toLocaleString('en-IN');
}

/** Format to N decimal places */
export function formatDecimal(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}
