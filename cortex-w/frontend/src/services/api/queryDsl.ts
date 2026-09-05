/**
 * Builds the upstream query-string DSL (spec 27), e.g.
 *   customId<CT:AN>H0012
 *   status<IN:AN>[SUCCESSFUL,MISSING]
 * Used by billing's meter search (POST /api/asset/query) and any other
 * list endpoint that accepts this filter grammar. Kept in one place so no
 * page re-implements string concatenation for it.
 */
export type DslOperator = 'CT' | 'EQ' | 'IN' | 'NIN' | 'NOTNULL' | 'ISNULL';

export function dslClause(field: string, op: DslOperator, value: string | number | Array<string | number>): string {
  const rendered = Array.isArray(value) ? `[${value.join(',')}]` : String(value);
  return `${field}<${op}:AN>${rendered}`;
}

export function dslQuery(clauses: string[]): string {
  return clauses.join('|');
}
