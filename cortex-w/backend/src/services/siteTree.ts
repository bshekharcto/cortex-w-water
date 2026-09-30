import { proxyUpstream } from './upstreamProxy.js';
import { getAuthToken } from '../routes/gis.js';

// Real site/zone/DMA hierarchy, sourced entirely from cog-core-api's
// GET /api/site/ (note the trailing slash — /api/site without it is 405,
// /api/sites doesn't exist upstream at all: 500). This single endpoint
// returns every node at every level with a parentSite pointer, so the tree
// is built generically from that graph — no hardcoded level count, no
// hardcoded site IDs. If the API ever introduces a 4th+ level, it just
// shows up in this same response and walks naturally.
export interface SiteNode {
  id: number;
  name: string;
  level: number;
  parentId: number | null;
  parentName: string | null;
}

interface CachedTree {
  timestamp: number;
  byId: Map<number, SiteNode>;
  childrenOf: Map<number, SiteNode[]>;
  roots: SiteNode[];
}

let cache: CachedTree | null = null;
// Site hierarchy changes far less often than telemetry — a longer TTL than
// the per-site dma-report cache is appropriate.
const TREE_CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchSiteTree(authHeader?: string): Promise<CachedTree> {
  const now = Date.now();
  if (cache && now - cache.timestamp < TREE_CACHE_TTL_MS) {
    return cache;
  }

  const token = await getAuthToken(authHeader);
  const headers: Record<string, string> = token ? { Authorization: token } : {};
  const upstream = await proxyUpstream('GET', '/api/site/', { headers }).catch(
    () => ({ status: 500, data: null })
  );
  const rows = Array.isArray(upstream.data) ? (upstream.data as any[]) : [];

  const byId = new Map<number, SiteNode>();
  for (const r of rows) {
    if (typeof r.id !== 'number') continue;
    byId.set(r.id, {
      id: r.id,
      name: r.name,
      level: r.level,
      parentId: r.parentSite && r.parentSite !== 0 ? r.parentSite : null,
      parentName: r.parentName ?? null,
    });
  }

  const childrenOf = new Map<number, SiteNode[]>();
  for (const node of byId.values()) {
    const key = node.parentId ?? 0;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(node);
  }

  const result: CachedTree = {
    timestamp: now,
    byId,
    childrenOf,
    roots: childrenOf.get(0) || [],
  };

  // Never cache a failed/empty fetch — keep retrying rather than freezing
  // in an empty tree.
  if (byId.size > 0) cache = result;
  return result;
}

export async function getRoots(authHeader?: string): Promise<SiteNode[]> {
  const tree = await fetchSiteTree(authHeader);
  return tree.roots;
}

export async function getNode(id: number, authHeader?: string): Promise<SiteNode | null> {
  const tree = await fetchSiteTree(authHeader);
  return tree.byId.get(id) || null;
}

export async function hasStructuralChildren(id: number, authHeader?: string): Promise<boolean> {
  const tree = await fetchSiteTree(authHeader);
  return (tree.childrenOf.get(id) || []).length > 0;
}

/** Root-to-node chain (inclusive), for breadcrumb resolution on a fresh page load / deep link. */
export async function getAncestorChain(id: number, authHeader?: string): Promise<SiteNode[]> {
  const tree = await fetchSiteTree(authHeader);
  const chain: SiteNode[] = [];
  let current: SiteNode | undefined = tree.byId.get(id);
  while (current) {
    chain.unshift(current);
    current = current.parentId != null ? tree.byId.get(current.parentId) : undefined;
  }
  return chain;
}
