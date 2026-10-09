import { requireClient } from './clientContext.js';

/**
 * Meters of the signed-in client only. water_meter_readings_v2 has no owner column, so ownership is looked up in the
 * meter_metadata mirror (tenant_id = the MySQL client id, the same id the upstream reports for the client's sites).
 * Bind clientTenantIds() as parameter $n: null (demo mode, no upstream to scope by) switches the filter off.
 */
export function clientTenantIds(): number[] | null {
  const ctx = requireClient();
  return ctx.unscoped ? null : ctx.clientIds;
}

/** SQL for "AND this meter belongs to the signed-in client", with the tenant ids bound as parameter `n`. */
export function ownedMeterSql(n: number): string {
  return `AND ($${n}::bigint[] IS NULL OR meter_id IN (SELECT meter_id FROM meter_metadata WHERE tenant_id = ANY($${n}::bigint[])))`;
}
