export interface ScopeNode {
  id: string;
  name: string;
}

// A generic drill-down path from the root: [] = root/global view,
// [a] = inside node a, [a, b] = inside node b (a child of a), etc.
// Depth-agnostic — supports however many real levels cog-core-api has,
// now or after it adds more.
export interface DashboardScope {
  path: ScopeNode[];
}

export function currentNodeId(scope: DashboardScope): string | null {
  return scope.path.length > 0 ? scope.path[scope.path.length - 1].id : null;
}

export function parentNodeId(scope: DashboardScope): string | null {
  return scope.path.length > 1 ? scope.path[scope.path.length - 2].id : null;
}
