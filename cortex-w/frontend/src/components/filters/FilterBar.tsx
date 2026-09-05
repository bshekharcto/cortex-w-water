import { Search, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';

interface FilterBarProps {
  children?: ReactNode;
  onReset?: () => void;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
}

/**
 * Shared filter container (spec 5.3). Each page passes its own relevant
 * controls as children; this provides the search + reset chrome.
 * Don't render irrelevant controls — pages decide what goes here.
 */
export function FilterBar({ children, onReset, searchValue, onSearchChange, searchPlaceholder }: FilterBarProps) {
  return (
    <div className="cw-filter-bar">
      {onSearchChange && (
        <div className="cw-filter-search">
          <Search size={15} className="cw-filter-search-icon" />
          <input
            className="cw-filter-search-input"
            placeholder={searchPlaceholder ?? 'Search…'}
            value={searchValue ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      )}
      <div className="cw-filter-controls">{children}</div>
      {onReset && (
        <button className="cw-filter-reset" onClick={onReset}>
          <RotateCcw size={14} /> Reset
        </button>
      )}
    </div>
  );
}
