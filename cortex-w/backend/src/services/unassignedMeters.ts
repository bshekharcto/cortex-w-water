import { pool } from '../db/pool.js';
import { config } from '../config/env.js';
import { localDate } from './localDate.js';
import { requireClient } from './clientContext.js';
import { getInventory } from './assetInventory.js';

// Our own synced telemetry (raw_telemetry_packets) and daily rollup, used only
// to ENRICH meters whose membership is decided by cog-core-api's inventory
// (see assetInventory.ts): last-seen time, totalizer, dev_eui and flows.
// Nothing here decides which node a meter belongs to.

export const OTHERS_NAME = 'Others';
export const OTHERS_ID_PREFIX = 'others:';
export interface MeterFact {
  meterId: string;
  gatewayId: string | null;
  siteId: number | null;
  devEui: string | null;
  lastSeen: Date | null;
  totalizerM3: number | null;
  todayM3: number;
  yesterdayM3: number;
  monthM3: number;
}

// A meter that has reported within this window counts as CONNECTED.
const CONNECTED_WINDOW_MS = config.METER_CONNECTED_WINDOW_HOURS * 60 * 60 * 1000;

// Full scan of raw_telemetry_packets takes ~10s, so one result is shared by
// every request inside the TTL window. Failed loads are never cached.
const FACTS_TTL_MS = 5 * 60 * 1000;
// Per client, and only over that client's own meters (client_meter_owner).
const caches = new Map<string, { timestamp: number; facts: MeterFact[] }>();
const inflights = new Map<string, Promise<MeterFact[]>>();

async function queryFacts(key: string): Promise<MeterFact[]> {
  const today = localDate(0);
  const yesterday = localDate(-1);
  const monthStart = `${today.slice(0, 7)}-01`;
  // On the 1st, yesterday falls in the previous month, so the scan must reach
  // back to it even though the month total only counts from monthStart.
  const scanFrom = yesterday < monthStart ? yesterday : monthStart;

  const [telemetry, flows] = await Promise.all([
    pool.query(
      `SELECT p.meter_id, p.gateway_id, p.dev_eui, p.last_seen, p.total, g.site_id
       FROM (
         SELECT meter_id,
                (array_agg(gateway_id ORDER BY decoded_at DESC))[1] AS gateway_id,
                (array_agg(dev_eui ORDER BY decoded_at DESC))[1] AS dev_eui,
                (array_agg(forward_flow_l ORDER BY decoded_at DESC))[1] AS total,
                MAX(decoded_at) AS last_seen
         FROM raw_telemetry_packets
         WHERE meter_id IN (SELECT meter_id FROM client_meter_owner WHERE client_key = $1)
         GROUP BY meter_id
       ) p
       LEFT JOIN gateways g ON g.gateway_id = p.gateway_id`,
      [key]
    ),
    pool.query(
      `SELECT meter_id,
              COALESCE(SUM(total_consumption_kl) FILTER (WHERE summary_date = $1), 0) AS today,
              COALESCE(SUM(total_consumption_kl) FILTER (WHERE summary_date = $2), 0) AS yesterday,
              COALESCE(SUM(total_consumption_kl) FILTER (WHERE summary_date >= $3), 0) AS month
       FROM water_daily_summary
       WHERE summary_date >= $4
         AND meter_id IN (SELECT meter_id FROM client_meter_owner WHERE client_key = $5)
       GROUP BY meter_id`,
      [today, yesterday, monthStart, scanFrom, key]
    ),
  ]);

  const flowByMeter = new Map<string, { today: number; yesterday: number; month: number }>();
  for (const r of flows.rows) {
    flowByMeter.set(r.meter_id, {
      today: Number(r.today),
      yesterday: Number(r.yesterday),
      month: Number(r.month),
    });
  }

  return telemetry.rows.map((r: any) => {
    const f = flowByMeter.get(r.meter_id);
    return {
      meterId: r.meter_id,
      gatewayId: r.gateway_id ?? null,
      siteId: r.site_id ?? null,
      devEui: r.dev_eui ?? null,
      lastSeen: r.last_seen ? new Date(r.last_seen) : null,
      // forward_flow_l already holds the totalizer in m3 (matches end_reading_kl in the daily rollup).
      totalizerM3: r.total != null ? Number(r.total) : null,
      todayM3: f?.today ?? 0,
      yesterdayM3: f?.yesterday ?? 0,
      monthM3: f?.month ?? 0,
    };
  });
}

export async function getMeterFacts(): Promise<MeterFact[]> {
  const key = requireClient().key;
  const cache = caches.get(key);
  const now = Date.now();
  if (cache && now - cache.timestamp < FACTS_TTL_MS) return cache.facts;
  // The ownership table is filled by the inventory refresh; make sure the
  // client's has been, or this would read an empty set as "no telemetry".
  await getInventory();
  let inflight = inflights.get(key);
  if (!inflight) {
    inflight = queryFacts(key)
      .then((facts) => {
        if (facts.length > 0) caches.set(key, { timestamp: Date.now(), facts });
        return facts;
      })
      .finally(() => {
        inflights.delete(key);
      });
    inflights.set(key, inflight);
  }
  try {
    return await inflight;
  } catch (err: any) {
    // Serve the last good snapshot if there is one; with none, throw so flows
    // and status don't silently read as 0 / NEVER_SEEN.
    if (cache) {
      console.warn('[unassignedMeters] Postgres load failed, serving stale telemetry:', err?.message || err);
      return cache.facts;
    }
    throw err;
  }
}

export function connectivityOf(lastSeen: Date | null): 'CONNECTED' | 'DISCONNECTED' | 'NEVER_SEEN' {
  if (!lastSeen) return 'NEVER_SEEN';
  return Date.now() - lastSeen.getTime() <= CONNECTED_WINDOW_MS ? 'CONNECTED' : 'DISCONNECTED';
}
