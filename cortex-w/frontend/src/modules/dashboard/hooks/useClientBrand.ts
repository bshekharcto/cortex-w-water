import { useEffect, useState } from 'react';
import { fetchClientBrand, type ClientBrandInfo } from '../services/dashboardDataService';

let cached: ClientBrandInfo | null = null;

/** The signed-in client's name and logo, asked for once and kept for the session. Null until it is known. */
export function useClientBrand(): ClientBrandInfo | null {
  const [brand, setBrand] = useState<ClientBrandInfo | null>(cached);
  useEffect(() => {
    if (cached) return;
    let live = true;
    fetchClientBrand().then((b) => {
      if (!live || !b) return;
      cached = b;
      setBrand(b);
    });
    return () => {
      live = false;
    };
  }, []);
  return brand;
}
