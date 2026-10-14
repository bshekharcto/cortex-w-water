import { getAuthToken } from '@/modules/auth/repository/authTokenStore';
import type { NetGatewaysResponse, NetMeterMapResponse } from '@/services/api/networkApi';

/**
 * A saved copy of the last Network Explorer data, so the page can draw straight away while the fresh data loads.
 *
 * It belongs to ONE user: every snapshot records who it was saved for (the `sub` of the sign-in token), and a copy
 * saved for anyone else is thrown away instead of shown. clearAuthState() also deletes the whole database on logout
 * or an expired session. If IndexedDB is unavailable the page simply loads without a saved copy.
 */

const DB_NAME = 'cortex_w_network_cache';
const STORE = 'snapshots';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// Bump when the shape of the saved data changes: an older copy (e.g. with the live / stale / silent meter statuses) is
// thrown away instead of drawn. v2: meter statuses are connected / disconnected / never. v3: map rows carry the site, and the unpositioned counts.
const SCHEMA = 3;

export interface NetworkSnapshot {
  schema?: number;
  owner: string;
  savedAt: number;
  siteId: string;
  gateways: NetGatewaysResponse;
  map: NetMeterMapResponse;
}

/** Who the current sign-in belongs to (only used to label the cache, never to authorise anything). */
function currentOwner(): string | null {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const id = payload.sub ?? payload.userName;
    return id == null ? null : String(id);
  } catch {
    return null;
  }
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'siteId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function loadSnapshot(siteId: string): Promise<NetworkSnapshot | null> {
  const owner = currentOwner();
  if (!owner) return null;
  const db = await open();
  if (!db) return null;
  try {
    const snap = (await run<NetworkSnapshot>(db, 'readonly', (s) => s.get(siteId))) ?? null;
    if (!snap) return null;
    if (snap.schema !== SCHEMA || snap.owner !== owner || Date.now() - snap.savedAt > MAX_AGE_MS) {
      await run(db, 'readwrite', (s) => s.delete(siteId));
      return null;
    }
    return snap;
  } finally {
    db.close();
  }
}

export async function saveSnapshot(siteId: string, gateways: NetGatewaysResponse, map: NetMeterMapResponse): Promise<void> {
  const owner = currentOwner();
  if (!owner) return;
  const db = await open();
  if (!db) return;
  try {
    await run(db, 'readwrite', (s) => s.put({ schema: SCHEMA, owner, savedAt: Date.now(), siteId, gateways, map } satisfies NetworkSnapshot));
  } finally {
    db.close();
  }
}
