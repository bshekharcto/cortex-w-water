import { useState } from 'react';
import { useClientBrand } from '@/modules/dashboard/hooks/useClientBrand';

const DEFAULT_LOGO = '/clients/default.svg';

const initials = (name: string) =>
  name
    .split(/[\s·]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/**
 * The client's round logo at any size. A client without a logo of its own gets the default one; a logo that fails to load
 * falls back to the default, then to the client's initials.
 */
export function ClientLogo({ size }: { size: number }) {
  const brand = useClientBrand();
  const [failed, setFailed] = useState<string[]>([]);
  const wanted = brand?.logo || DEFAULT_LOGO;
  const src = !failed.includes(wanted) ? wanted : !failed.includes(DEFAULT_LOGO) ? DEFAULT_LOGO : null;
  return (
    <div className="cw-client-logo" style={{ width: size, height: size }}>
      {src ? (
        <img src={src} alt={brand?.name ? `${brand.name} logo` : 'Client logo'} onError={() => setFailed((f) => [...f, src])} />
      ) : (
        <span style={{ fontSize: Math.round(size * 0.32) }}>{brand?.name ? initials(brand.name) : ''}</span>
      )}
    </div>
  );
}

/** The top of the side panel: the client's logo and, beside it, the client's name (the product name is not repeated here). */
export function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  const brand = useClientBrand();
  return (
    <div className="cw-sidebar-brand cw-sidebar-brand--client" title={brand?.name || undefined}>
      <ClientLogo size={collapsed ? 44 : 54} />
      {!collapsed && brand?.name && <div className="cw-client-name">{brand.name}</div>}
    </div>
  );
}
