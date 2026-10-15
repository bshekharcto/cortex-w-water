import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PagerProps {
  total: number;
  page: number; // zero-based
  pageSize: number;
  sizes: number[];
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

/** "Page size 25 | 1 to 24 of 24 | « ‹ Page 1 of 1 › »" — the footer both tables share. */
export function Pager({ total, page, pageSize, sizes, onPage, onPageSize }: PagerProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="gs-pager">
      <label className="gs-pager-size">
        Page size
        <select
          value={pageSize}
          onChange={(e) => {
            onPageSize(Number(e.target.value));
            onPage(0);
          }}
        >
          {sizes.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
      <span className="gs-pager-range">
        <strong>{from}</strong> to <strong>{to}</strong> of <strong>{total}</strong>
      </span>
      <div className="gs-pager-nav">
        <button className="cw-icon-btn" onClick={() => onPage(0)} disabled={page === 0} aria-label="First page"><ChevronsLeft size={16} /></button>
        <button className="cw-icon-btn" onClick={() => onPage(page - 1)} disabled={page === 0} aria-label="Previous page"><ChevronLeft size={16} /></button>
        <span>Page <strong>{page + 1}</strong> of <strong>{pages}</strong></span>
        <button className="cw-icon-btn" onClick={() => onPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page"><ChevronRight size={16} /></button>
        <button className="cw-icon-btn" onClick={() => onPage(pages - 1)} disabled={page >= pages - 1} aria-label="Last page"><ChevronsRight size={16} /></button>
      </div>
    </div>
  );
}
