export interface SiteOption {
  id: string;
  name: string;
  parentId?: string | null;
}

export interface SiteTree {
  byId: Map<string, SiteOption>;
  childrenOf: Map<string, string[]>;
  parentOf: Map<string, string>;
  roots: string[];
}

/** The tree of the sites the user may see. "ALL" is not a site. A site whose parent is not in the list is a root. */
export function buildSiteTree(sites: SiteOption[]): SiteTree {
  const options = sites.filter((s) => s.id !== 'ALL');
  const byId = new Map(options.map((o) => [o.id, o]));
  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string>();
  const roots: string[] = [];
  for (const o of options) {
    const parent = o.parentId && byId.has(o.parentId) && o.parentId !== o.id ? o.parentId : null;
    if (parent) {
      parentOf.set(o.id, parent);
      if (!childrenOf.has(parent)) childrenOf.set(parent, []);
      childrenOf.get(parent)!.push(o.id);
    } else {
      roots.push(o.id);
    }
  }
  return { byId, childrenOf, parentOf, roots };
}

export function descendantsOf(tree: SiteTree, id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  const stack = [...(tree.childrenOf.get(id) ?? [])];
  while (stack.length) {
    const next = stack.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    stack.push(...(tree.childrenOf.get(next) ?? []));
  }
  return out;
}

export function ancestorsOf(tree: SiteTree, id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let current = tree.parentOf.get(id);
  while (current && !seen.has(current)) {
    out.push(current);
    seen.add(current);
    current = tree.parentOf.get(current);
  }
  return out;
}

/** 'ALL' (or nothing) -> nothing checked; "a,b" -> a and b and everything below them. Unknown ids are ignored. */
export function checkedFromValue(tree: SiteTree, value: string): Set<string> {
  const set = new Set<string>();
  if (!value || value === 'ALL') return set;
  for (const id of value.split(',')) {
    if (!tree.byId.has(id)) continue;
    set.add(id);
    descendantsOf(tree, id).forEach((d) => set.add(d));
  }
  return set;
}

/**
 * Click on a check box. Checking a site checks everything below it. Unchecking a site unchecks everything below it and the
 * sites above it (they no longer cover all of it). A parent is NOT checked just because all its children are: it may
 * have meters of its own that the user did not choose, so it is checked only by clicking it (it shows a partial mark
 * until then).
 */
export function toggleChecked(tree: SiteTree, checked: Set<string>, id: string): Set<string> {
  const next = new Set(checked);
  if (next.has(id)) {
    next.delete(id);
    descendantsOf(tree, id).forEach((d) => next.delete(d));
    ancestorsOf(tree, id).forEach((a) => next.delete(a));
  } else {
    next.add(id);
    descendantsOf(tree, id).forEach((d) => next.add(d));
  }
  return next;
}

/** The checked sites that have no checked site above them: their children are implied. */
export function topChecked(tree: SiteTree, checked: Set<string>): string[] {
  return [...checked].filter((id) => !ancestorsOf(tree, id).some((a) => checked.has(a)));
}

/** What the filter sends: 'ALL' when nothing is checked, else the top checked ids separated by commas. */
export function valueFromChecked(tree: SiteTree, checked: Set<string>): string {
  const top = topChecked(tree, checked);
  return top.length === 0 ? 'ALL' : top.join(',');
}

/** Neither checked nor unchecked: some site below it is checked, but it is not. */
export function isPartlyChecked(tree: SiteTree, checked: Set<string>, id: string): boolean {
  return !checked.has(id) && descendantsOf(tree, id).some((d) => checked.has(d));
}

/** A search: the sites whose name matches, what is below them, and the branches above them (which must be open). */
export function searchSites(tree: SiteTree, query: string): { show: Set<string>; forceOpen: Set<string> } | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const show = new Set<string>();
  const forceOpen = new Set<string>();
  for (const o of tree.byId.values()) {
    if (!o.name.toLowerCase().includes(q)) continue;
    show.add(o.id);
    descendantsOf(tree, o.id).forEach((d) => show.add(d));
    ancestorsOf(tree, o.id).forEach((a) => {
      show.add(a);
      forceOpen.add(a);
    });
  }
  return { show, forceOpen };
}
