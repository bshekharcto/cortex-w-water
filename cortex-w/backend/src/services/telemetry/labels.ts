/** Short display name for a gateway, from the last three characters of its ID (no real alias is available yet). */
export function getGatewayAlias(id: string): string {
  if (!id) return 'GW-UNK';
  return `GW-${id.slice(-3).toUpperCase()}`;
}
