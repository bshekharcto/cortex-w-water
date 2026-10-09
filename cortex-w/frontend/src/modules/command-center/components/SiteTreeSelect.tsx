import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import {
  ancestorsOf,
  buildSiteTree,
  checkedFromValue,
  isPartlyChecked,
  searchSites,
  toggleChecked,
  topChecked,
  valueFromChecked,
} from './siteTreeLogic';
import type { SiteOption } from './siteTreeLogic';

interface Props {
  sites: SiteOption[];
  /** 'ALL', or the ids of the chosen sites separated by commas */
  value: string;
  onChange: (value: string) => void;
}

// The site filter as a tree: arrows open and close the children, every site has a check box, and checking a site checks
// everything below it (a parent shows as checked once all its children are). Nothing is applied until "Apply now".
export function SiteTreeSelect({ sites, value, onChange }: Props) {
  const tree = useMemo(() => buildSiteTree(sites), [sites]);
  const applied = useMemo(() => checkedFromValue(tree, value), [tree, value]);

  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement | null>(null);

  const openPanel = () => {
    setPending(new Set(applied));
    // show the chosen sites: open the branches above them
    const opened = new Set<string>();
    applied.forEach((id) => ancestorsOf(tree, id).forEach((a) => opened.add(a)));
    setExpanded(opened);
    setQuery('');
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const search = useMemo(() => searchSites(tree, query), [tree, query]);

  const buttonText = (() => {
    const top = topChecked(tree, applied);
    if (top.length === 0) return 'All Sites';
    const first = tree.byId.get(top[0])?.name ?? 'Sites';
    return top.length === 1 ? first : `${first} +${top.length - 1}`;
  })();

  const renderNode = (id: string, depth: number): JSX.Element | null => {
    if (search && !search.show.has(id)) return null;
    const node = tree.byId.get(id)!;
    const kids = tree.childrenOf.get(id) ?? [];
    const isOpen = search ? search.forceOpen.has(id) || expanded.has(id) : expanded.has(id);
    const checked = pending.has(id);
    const partly = isPartlyChecked(tree, pending, id);

    return (
      <div key={id} role="treeitem" aria-expanded={kids.length ? isOpen : undefined} aria-selected={checked}>
        <div className={`cc-sitetree-row ${checked ? 'cc-sitetree-row--checked' : ''}`} style={{ paddingLeft: 8 + depth * 18 }}>
          {kids.length > 0 ? (
            <button
              type="button"
              className="cc-sitetree-arrow"
              aria-label={isOpen ? `Close ${node.name}` : `Open ${node.name}`}
              onClick={() => toggleExpanded(id)}
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="cc-sitetree-arrow" />
          )}
          <label className="cc-sitetree-label">
            <input
              type="checkbox"
              checked={checked}
              ref={(el) => {
                if (el) el.indeterminate = partly;
              }}
              onChange={() => setPending((prev) => toggleChecked(tree, prev, id))}
            />
            <span>{node.name}</span>
          </label>
        </div>
        {kids.length > 0 && isOpen && <div role="group">{kids.map((k) => renderNode(k, depth + 1))}</div>}
      </div>
    );
  };

  const chips = [...pending].map((id) => tree.byId.get(id)).filter(Boolean) as SiteOption[];
  const rootsToShow = tree.roots.filter((r) => !search || search.show.has(r));

  return (
    <div className="cc-sitetree" ref={root}>
      <button type="button" className="cc-site-selector cc-sitetree-button" onClick={() => (open ? setOpen(false) : openPanel())}>
        <span>{buttonText}</span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="cc-sitetree-panel" role="dialog" aria-label="Choose sites">
          <div className="cc-sitetree-head">
            <span className="cc-sitetree-title">Site</span>
            <button type="button" className="cc-sitetree-link" onClick={() => setPending(new Set())}>
              Reset
            </button>
          </div>

          {chips.length > 0 && (
            <div className="cc-sitetree-chips">
              {chips.map((c) => (
                <span key={c.id} className="cc-sitetree-chip">
                  {c.name}
                </span>
              ))}
            </div>
          )}

          <div className="cc-sitetree-search">
            <Search size={14} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sites..."
              aria-label="Search sites"
            />
            {query && (
              <button type="button" className="cc-sitetree-clear" aria-label="Clear search" onClick={() => setQuery('')}>
                <X size={14} />
              </button>
            )}
          </div>

          <div className="cc-sitetree-list" role="tree" aria-multiselectable="true">
            {rootsToShow.length === 0 ? (
              <div className="cc-sitetree-empty">{tree.byId.size === 0 ? 'No sites available.' : 'No site matches.'}</div>
            ) : (
              rootsToShow.map((r) => renderNode(r, 0))
            )}
          </div>

          <div className="cc-sitetree-foot">
            <button
              type="button"
              className="cc-sitetree-reset"
              onClick={() => {
                onChange('ALL');
                setOpen(false);
              }}
            >
              Reset all
            </button>
            <button
              type="button"
              className="cc-sitetree-apply"
              onClick={() => {
                onChange(valueFromChecked(tree, pending));
                setOpen(false);
              }}
            >
              Apply now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
