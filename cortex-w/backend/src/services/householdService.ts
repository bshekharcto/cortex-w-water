import { pool } from '../db/pool.js';
import { clientTenantIds } from './tenantScope.js';
import { requireClient } from './clientContext.js';

/**
 * The Households tab: what is asked of the beta API (who the household is, its bills, its photographs) and what comes from
 * Postgres (which meters it has and everything those meters reported). Every value is real or null: nothing is guessed from
 * the text of an id, and no placeholder stands in for a missing field.
 */

const BT = '`';

/**
 * The search box as a beta query. The text goes inside the beta's filter language, so the characters that language is made
 * of are removed first: a search can only ever be a search, never an extra clause.
 */
export function sanitizeSearch(raw: unknown): string {
  return String(raw ?? '').replace(/[`:<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64);
}

/** A 10-digit number is a mobile, anything else with a digit is a consumer id, plain words are a name. */
export function buildHouseholdQuery(raw: unknown): string | undefined {
  const s = sanitizeSearch(raw);
  if (!s) return undefined;
  if (/^\d{10}$/.test(s)) return `${BT}mobile<CT:AN>${s}${BT}`;
  if (/\d/.test(s)) return `${BT}customId<CT:AN>${s}${BT}`;
  return `${BT}name<CT:AN>${s.toUpperCase()}${BT}`;
}

/** The columns the list can be sorted by (the names are the beta's own field names). */
export const HOUSEHOLD_SORT_FIELDS = ['customId', 'name', 'location', 'mobile', 'status', 'registrationDate'] as const;
export type HouseholdSortField = (typeof HOUSEHOLD_SORT_FIELDS)[number];

/** The beta's sort text ("field:ASC"), or undefined for an unknown field: nothing from the request is passed on as it is. */
export function buildSortBy(field: unknown, dir: unknown): string | undefined {
  if (!HOUSEHOLD_SORT_FIELDS.includes(field as HouseholdSortField)) return undefined;
  return `${field}:${String(dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC'}`;
}

/** The query that finds one household by its numeric id or its consumer id. */
export function lookupQuery(idOrCustomId: string): string {
  const id = sanitizeSearch(idOrCustomId);
  return /^\d+$/.test(id) ? `${BT}id<EQ:NU>${id}${BT}` : `${BT}customId<CT:AN>${id}${BT}`;
}

export interface MeterPhoto {
  documentId?: number;
  name: string;
  category: string;
  url: string;
  uploadDate?: string;
}

/** Photographs from the meter's image list and from the attachments of its replacement history, each picture once. */
export function buildMeterPhotos(images: unknown, imeiHistories: unknown): MeterPhoto[] {
  const photos: MeterPhoto[] = [];
  for (const img of Array.isArray(images) ? (images as any[]) : []) {
    if (img?.s3BucketURL) {
      photos.push({ documentId: img.documentId, name: img.name, category: img.category || 'NEW_METER_DOCUMENT', url: img.s3BucketURL, uploadDate: img.uploadDateTime });
    }
  }
  for (const ih of Array.isArray(imeiHistories) ? (imeiHistories as any[]) : []) {
    for (const att of Array.isArray(ih?.attachments) ? ih.attachments : []) {
      if (att?.s3BucketURL && !photos.some((p) => p.url === att.s3BucketURL)) {
        photos.push({ documentId: att.documentId, name: att.name, category: att.category || 'OLD_METER_DOCUMENT', url: att.s3BucketURL, uploadDate: att.uploadDateTime });
      }
    }
  }
  return photos;
}

/** The newest swap where the meter really changed. */
export function pickReplacement(imeiHistories: unknown) {
  const r = (Array.isArray(imeiHistories) ? (imeiHistories as any[]) : []).find((ih) => ih?.oldImeiNumber && ih.oldImeiNumber !== ih.newImeiNumber);
  return r
    ? {
        oldMeterNumber: r.oldImeiNumber,
        oldMeterReading: r.oldMeterReading,
        newMeterNumber: r.newImeiNumber,
        newMeterReading: r.newMeterReading,
        date: r.uninstalledDate ?? null,
        status: r.status ?? null,
      }
    : null;
}

const asNum = (v: unknown): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface HouseholdMeter {
  meterId: string;
  assetId: number;
  siteId: number | null;
  isActive: boolean;
  installedDate: string | null;
  ward: string | null;
  devEui: string | null;
  lastSeen: string | null;
  readingM3: number | null;
  rssi: number | null;
  snr: number | null;
  gatewayId: string | null;
  tz: string;
}

/** The meters this client has linked to the household (the active one with the newest frame first). */
export async function getHouseholdMeters(household: { id?: number | string; customId?: string }): Promise<HouseholdMeter[]> {
  const hid = asNum(household.id);
  const custom = household.customId ?? null;
  if (hid == null && !custom) return [];
  const res = await pool.query(
    `SELECT m.meter_id, m.asset_id, m.site_id, m.is_active, m.installed_date, m.ward, COALESCE(s.tz_sql, 'UTC') AS tz,
            l.dev_eui, l.decoded_at, l.forward_flow_kl, l.rssi, l.snr, l.gateway_id
       FROM meter_metadata m
       LEFT JOIN site_metadata s ON s.site_id = m.site_id
       LEFT JOIN water_meter_latest l ON l.meter_id = m.meter_id
      WHERE ($1::bigint[] IS NULL OR m.tenant_id = ANY($1::bigint[]))
        AND (($2::bigint IS NOT NULL AND m.household_id = $2::bigint) OR ($3::text IS NOT NULL AND m.household_custom_id = $3::text))
      ORDER BY m.is_active DESC, l.decoded_at DESC NULLS LAST, m.meter_id
      LIMIT 20`,
    [clientTenantIds(), hid, custom]
  );
  return res.rows.map((r: any) => ({
    meterId: r.meter_id,
    assetId: Number(r.asset_id),
    siteId: r.site_id != null ? Number(r.site_id) : null,
    isActive: !!r.is_active,
    installedDate: r.installed_date ?? null,
    ward: r.ward ?? null,
    devEui: r.dev_eui ?? null,
    lastSeen: r.decoded_at ? new Date(r.decoded_at).toISOString() : null,
    readingM3: asNum(r.forward_flow_kl), // 1 KL = 1 m3
    rssi: asNum(r.rssi),
    snr: asNum(r.snr),
    gatewayId: r.gateway_id ? String(r.gateway_id).toLowerCase() : null,
    tz: r.tz,
  }));
}

/** The last 10 days that have a reading, oldest first, plus yesterday and the month so far, same rules as Meter 360. */
export async function getMeterReadings(meterId: string, tz: string) {
  const [daily, summary] = await Promise.all([
    pool.query(`SELECT day::text AS day, reading_kl, used_kl FROM water_meter_daily WHERE meter_id = $1 ORDER BY day DESC LIMIT 10`, [meterId]),
    pool.query(
      `WITH t AS (SELECT (NOW() AT TIME ZONE $2)::date AS today)
       SELECT (SELECT w.used_kl FROM water_meter_daily w, t WHERE w.meter_id = $1 AND w.day = t.today - 1) AS yesterday_kl,
              (SELECT SUM(w.used_kl) FROM water_meter_daily w, t WHERE w.meter_id = $1 AND w.day >= date_trunc('month', t.today)::date) AS month_kl`,
      [meterId, tz]
    ),
  ]);
  const readings = [...daily.rows].reverse().map((r: any) => {
    const [, mm, dd] = String(r.day).split('-');
    const usedKl = Number(r.used_kl) || 0;
    return {
      date: String(r.day),
      shortDate: `${MONTHS[Number(mm) - 1] ?? mm} ${dd}`,
      readingM3: Number((Number(r.reading_kl) || 0).toFixed(3)),
      consumptionL: Math.round(usedKl * 1000),
      consumptionM3: Number(usedKl.toFixed(3)),
    };
  });
  const y = asNum(summary.rows[0]?.yesterday_kl);
  const m = asNum(summary.rows[0]?.month_kl);
  return { readings, yesterdayM3: y == null ? null : Number(y.toFixed(3)), monthToDateM3: m == null ? null : Number(m.toFixed(3)) };
}

/** The newest live frame's radio settings, the one thing water_meter_latest does not keep. */
export async function getLastFrame(meterId: string) {
  const res = await pool.query(
    `SELECT time, frequency, dr, adr, f_cnt FROM water_meter_readings_v2 WHERE meter_id = $1 AND is_history = false ORDER BY time DESC LIMIT 1`,
    [meterId]
  );
  const f = res.rows[0];
  return f ? { time: new Date(f.time).toISOString(), frequencyHz: asNum(f.frequency), dataRate: asNum(f.dr), adr: f.adr ?? null, fCnt: asNum(f.f_cnt) } : null;
}

/** The name of a site the client owns, from the sites the beta reported for the caller's token. */
export function siteNameOf(siteId: number | null | undefined): string | null {
  if (siteId == null) return null;
  const s = requireClient().sites.find((x) => x.id === Number(siteId));
  return s ? String(s.name) : null;
}
