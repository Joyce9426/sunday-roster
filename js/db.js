// ---------- IndexedDB wrapper ----------
const DB_NAME = 'sunday-roster-db';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('seasons')) {
        db.createObjectStore('seasons', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('members')) {
        db.createObjectStore('members', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('seasonPasses')) {
        const s = db.createObjectStore('seasonPasses', { keyPath: 'id' });
        s.createIndex('seasonId', 'seasonId', { unique: false });
        s.createIndex('memberId', 'memberId', { unique: false });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'id' });
        s.createIndex('seasonId', 'seasonId', { unique: false });
      }
      if (!db.objectStoreNames.contains('sessionRosters')) {
        const s = db.createObjectStore('sessionRosters', { keyPath: 'id' });
        s.createIndex('sessionId', 'sessionId', { unique: false });
        s.createIndex('memberId', 'memberId', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
}

function tx(storeNames, mode = 'readonly') {
  return openDb().then((db) => db.transaction(storeNames, mode));
}

export async function getAll(store) {
  const t = await tx([store]);
  return new Promise((resolve, reject) => {
    const req = t.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getById(store, id) {
  const t = await tx([store]);
  return new Promise((resolve, reject) => {
    const req = t.objectStore(store).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getByIndex(store, indexName, value) {
  const t = await tx([store]);
  return new Promise((resolve, reject) => {
    const req = t.objectStore(store).index(indexName).getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function put(store, obj) {
  const t = await tx([store], 'readwrite');
  return new Promise((resolve, reject) => {
    const req = t.objectStore(store).put(obj);
    req.onsuccess = () => resolve(obj);
    req.onerror = () => reject(req.error);
  });
}

export async function putMany(store, objs) {
  const t = await tx([store], 'readwrite');
  return new Promise((resolve, reject) => {
    const os = t.objectStore(store);
    objs.forEach((o) => os.put(o));
    t.oncomplete = () => resolve(objs);
    t.onerror = () => reject(t.error);
  });
}

export async function remove(store, id) {
  const t = await tx([store], 'readwrite');
  return new Promise((resolve, reject) => {
    const req = t.objectStore(store).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function removeMany(store, ids) {
  const t = await tx([store], 'readwrite');
  return new Promise((resolve, reject) => {
    const os = t.objectStore(store);
    ids.forEach((id) => os.delete(id));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function clearStore(store) {
  const t = await tx([store], 'readwrite');
  return new Promise((resolve, reject) => {
    const req = t.objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export const STORES = ['seasons', 'members', 'seasonPasses', 'sessions', 'sessionRosters', 'settings'];

// ---------- Settings helpers ----------
const DEFAULT_PAYMENT_METHODS = ['現金', '轉帳', 'LinePay', '其他'];

export async function getSettings() {
  const s = await getById('settings', 'app');
  if (s) {
    // Backfill fields added in later versions so older settings docs (created
    // before this feature existed) still have sensible defaults.
    let changed = false;
    if (!Array.isArray(s.lineTargets)) { s.lineTargets = []; changed = true; }
    if (typeof s.lineRelayUrl !== 'string') { s.lineRelayUrl = ''; changed = true; }
    if (typeof s.lineRelayApiKey !== 'string') { s.lineRelayApiKey = ''; changed = true; }
    if (changed) await put('settings', s);
    return s;
  }
  const fresh = {
    key: 'app',
    paymentMethods: DEFAULT_PAYMENT_METHODS,
    activeSeasonId: null,
    lineRelayUrl: '',
    lineRelayApiKey: '',
    lineTargets: [],
  };
  await put('settings', fresh);
  return fresh;
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const merged = { ...current, ...patch };
  await put('settings', merged);
  return merged;
}

// ---------- Export / Import ----------
export async function exportAllData() {
  const data = {};
  for (const store of STORES) {
    data[store] = await getAll(store);
  }
  data.__meta = { exportedAt: new Date().toISOString(), version: DB_VERSION };
  return data;
}

export async function importAllData(data) {
  for (const store of STORES) {
    if (!Array.isArray(data[store])) continue;
    await clearStore(store);
    await putMany(store, data[store]);
  }
}
