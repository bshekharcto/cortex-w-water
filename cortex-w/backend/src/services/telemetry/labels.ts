/** Short display name for a gateway, from the last four characters of its ID (no real alias is available yet). */
export function getGatewayAlias(id: string): string {
  if (!id) return 'GW-UNK';
  return `GW-${id.slice(-4).toUpperCase()}`;
}
