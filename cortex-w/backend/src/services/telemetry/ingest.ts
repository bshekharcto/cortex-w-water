import { pool } from '../../db/pool.js';
import { proxyUpstream } from '../upstreamProxy.js';
import { getAuthToken } from '../../routes/gis.js';

const inflightIngests = new Map<string, Promise<number>>();

/**
 * Ingests one date into PostgreSQL. Concurrent calls for the same date share a single run, so two
 * people pressing Refresh (or a refresh during a scheduled sync) never run duplicate long inserts.
 */
export function ingestDateIntoPostgres(date: string): Promise<number> {
  const running = inflightIngests.get(date);
  if (running) return running;
  const run = ingestDateUnlocked(date).finally(() => inflightIngests.delete(date));
  inflightIngests.set(date, run);
  return run;
}

async function ingestDateUnlocked(date: string): Promise<number> {
  const token = await getAuthToken();
  let insertedTotal = 0;
  let cursor: string | undefined = undefined;
  let hasMore = true;
  let page = 0;
  const maxPages = 6; // up to 3000 records per day

  while (hasMore && page < maxPages) {
    const payload: { page: number; size: number; cursor?: string } = { page, size: 500 };
    if (cursor) payload.cursor = cursor;

    try {
      const upstreamRes = await proxyUpstream(
        'POST',
        `/api/water/raw-data/cursor?fromDate=${date}&endDate=${date}&rawReport=true`,
        {
          body: payload,
          headers: { Authorization: token },
        }
      );

      if (upstreamRes.status !== 200 || !upstreamRes.data) break;

      const resData = upstreamRes.data as {
        content?: any[];
        nextCursor?: string;
        hasMore?: boolean;
      };

      const items = resData.content || [];
      if (items.length === 0) break;

      // Multi-row batch insert for ultra-fast ingestion
      const validItems = items.filter(item => item.meterId && item.gatewayId && item.decodedAt);
      if (validItems.length > 0) {
        const valuePlaceholders: string[] = [];
        const values: any[] = [];
        let pIdx = 1;

        for (const item of validItems) {
          valuePlaceholders.push(
            `($${pIdx}, $${pIdx+1}, $${pIdx+2}, $${pIdx+3}, $${pIdx+4}, $${pIdx+5}, $${pIdx+6}, $${pIdx+7}, $${pIdx+8}, $${pIdx+9}, $${pIdx+10}, $${pIdx+11}, $${pIdx+12}, $${pIdx+13}, $${pIdx+14}, $${pIdx+15}, $${pIdx+16}, $${pIdx+17}, $${pIdx+18}, $${pIdx+19}, $${pIdx+20}, $${pIdx+21}, $${pIdx+22})`
          );
          // Missing upstream values are stored as NULL — never invented. The one exception is
          // fcnt: it is part of the dedupe key (uq_packet), and NULLs never conflict, so a missing
          // fcnt is stored as -1 and mapped back to null when read.
          values.push(
            item.meterId,
            item.gatewayId,
            item.devEui ?? null,
            item.decodedAt,
            date,
            item.forwardFlowL ?? null,
            item.reverseFlow ?? null,
            item.batteryVoltage ?? null,
            item.batteryStatus ?? null,
            item.batteryHealth ?? null,
            item.valveHealth ?? null,
            item.valveClosed ?? null,
            item.checksumStatus ?? null,
            item.statusByte ?? null,
            item.rssi ?? null,
            item.snr ?? null,
            item.fcnt ?? -1,
            item.fport ?? null,
            item.frequency ?? null,
            item.dr ?? null,
            item.adr ?? null,
            item.confirmed ?? null,
            item.meterTimestamp || item.decodedAt
          );
          pIdx += 23;
        }

        try {
          await pool.query(
            `INSERT INTO raw_telemetry_packets (
              meter_id, gateway_id, dev_eui, decoded_at, date_key,
              forward_flow_l, reverse_flow, battery_voltage, battery_status,
              battery_health, valve_health, valve_closed, checksum_status,
              status_byte, rssi, snr, fcnt, fport, frequency, dr, adr, confirmed, meter_timestamp
            ) VALUES ${valuePlaceholders.join(', ')}
            ON CONFLICT (meter_id, gateway_id, decoded_at, fcnt) DO NOTHING`,
            values
          );
          insertedTotal += validItems.length;
        } catch (dbErr: any) {
          console.warn('[telemetryDb] Batch insert warning:', dbErr.message);
        }
      }

      if (resData.hasMore && resData.nextCursor && resData.nextCursor !== cursor) {
        cursor = resData.nextCursor;
        page++;
      } else {
        hasMore = false;
      }
    } catch (err: any) {
      console.error(`[telemetryDb] Error ingesting date ${date}:`, err.message);
      break;
    }
  }

  return insertedTotal;
}
