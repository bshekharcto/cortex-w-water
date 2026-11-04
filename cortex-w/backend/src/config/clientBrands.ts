// How each client (customer organisation) is shown on the Dashboard: its name and, optionally, its logo.
// The upstream site list carries only a numeric clientId, so the display name is kept here. A client missing from this
// table is shown as "Client <id>" with no logo; set CLIENT_BRANDS (JSON, same shape) to add or override entries without a
// code change. `logo` is a path under the frontend's /public (e.g. "/clients/watco.png") or an https URL; a client without
// one is shown with the default logo (/clients/default.svg).
export interface ClientBrand {
  name: string;
  logo?: string;
  /** True when this client has no billing in the app: no Billing page, no bills in the other pages, no billing API. */
  hideBilling?: boolean;
}

const DEFAULT_BRANDS: Record<number, ClientBrand> = {
  91: { name: 'WATCO', logo: '/clients/watco.png', hideBilling: true },
  101: { name: 'Ayodhya Nagar Nigam' },
};

function loadBrands(): Record<number, ClientBrand> {
  const raw = process.env.CLIENT_BRANDS;
  if (!raw) return DEFAULT_BRANDS;
  try {
    return { ...DEFAULT_BRANDS, ...JSON.parse(raw) };
  } catch {
    console.warn('[clientBrands] CLIENT_BRANDS is not valid JSON; using the defaults');
    return DEFAULT_BRANDS;
  }
}

const brands = loadBrands();

/** The name and logo for a set of client ids (a user can belong to several clients). */
export const DEFAULT_LOGO = '/clients/default.svg';

export function brandFor(clientIds: number[]): { name: string; logo: string | null } {
  if (clientIds.length === 0) return { name: '', logo: null };
  const found = clientIds.map((id) => brands[id] ?? { name: `Client ${id}` });
  return { name: found.map((b) => b.name).join(' · '), logo: found.length === 1 ? found[0].logo ?? DEFAULT_LOGO : DEFAULT_LOGO };
}

/** True when any of the client ids is one that has billing switched off. */
export function hidesBilling(clientIds: number[]): boolean {
  return clientIds.some((id) => brands[id]?.hideBilling === true);
}
