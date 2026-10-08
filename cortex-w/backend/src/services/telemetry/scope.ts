import { requireClient } from '../clientContext.js';
import { getInventory } from '../assetInventory.js';

/**
 * raw_telemetry_packets has no owner column and is shared by every client, so EVERY read of it is
 * restricted to the signed-in client's own meters (client_meter_owner, filled by the inventory refresh).
 * `n` is the SQL parameter position that carries the client key.
 */
export const ownedMeters = (n: number, col = 'meter_id') =>
  `${col} IN (SELECT meter_id FROM client_meter_owner WHERE client_key = $${n})`;

/** The signed-in client's key to bind for ownedMeters(), after making sure its ownership rows exist. */
export async function clientKey(): Promise<string> {
  await getInventory();
  return requireClient().key;
}
