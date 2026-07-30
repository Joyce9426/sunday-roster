// ---------------------------------------------------------------------------
// 雲端同步引擎。
//
// 資料本身完全以本機 IndexedDB 為主（離線一樣正常讀寫），這個模組只負責在
// 有網路的時候，把「本機自從上次同步後有變動的資料」推上雲端，並把「雲端上
// 其他裝置產生、本機還沒有的變動」拉下來合併。
//
// 衝突處理：以每筆記錄的 updatedAt 做「後寫入者贏」——這件事其實主要是在
// Worker 那邊的資料庫層做的（見 schema.sql 的 ON CONFLICT ... WHERE），這裡
// 拉取合併時也會再做一次同樣的比較，確保本機不會被舊資料蓋過去。
// ---------------------------------------------------------------------------
import { getSettings, saveSettings, getAllRaw, getByIdRaw, putRaw, putManyRaw, applyIncomingSharedSettingsField, sharedFieldTimestampKey, SHARED_SETTINGS_FIELDS } from './db.js';

// These stores sync wholesale — every record, every field.
const SYNCED_STORES = ['seasons', 'members', 'seasonPasses', 'sessions', 'sessionRosters'];

// 'settings' is handled separately (see collectDirtyChanges/pullChanges
// below): only the whitelisted, non-secret fields in SHARED_SETTINGS_FIELDS
// (Worker 網址、常用聊天室、繳費方式) get synced — and each field syncs
// INDEPENDENTLY with its own timestamp/id (id: "shared:<field>"), not
// bundled together under one shared clock. Bundling them was a real bug:
// editing just one field (e.g. adding a LINE target) would, on push, re-send
// a full snapshot of all three fields using this device's current values —
// if another device's edit to a DIFFERENT field had an earlier timestamp,
// that snapshot would silently clobber it. Per-field sync means each field
// only ever competes against edits to that SAME field.
const SETTINGS_ID_PREFIX = 'shared:';

const PUSH_BATCH_SIZE = 200;

export function isSyncConfigured(settings) {
  return Boolean(settings.syncEnabled && settings.syncKey && settings.lineRelayUrl);
}

// Returns a specific, actionable reason why sync isn't configured yet, or
// null if everything's set. Used so the error toast tells you exactly which
// field is missing instead of a generic "not enabled" message that could
// mean any of three different things.
export function syncConfigIssue(settings) {
  if (!settings.syncEnabled) return '尚未啟用雲端同步，請到設定頁勾選「啟用雲端同步」';
  if (!settings.syncKey) return '尚未填寫同步密碼';
  if (!settings.lineRelayUrl) return '尚未填寫 Worker 網址（在「LINE 發送設定」卡片裡）';
  return null;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Scans every synced store for records whose updatedAt is newer than the
// given timestamp — these are the "dirty" records that need to be pushed.
// Also checks the whitelisted subset of settings (see module header).
async function collectDirtyChanges(sinceTimestamp) {
  const changes = [];
  for (const store of SYNCED_STORES) {
    const all = await getAllRaw(store);
    for (const rec of all) {
      const updatedAt = Number(rec.updatedAt) || 0;
      if (updatedAt > sinceTimestamp) {
        changes.push({ store, id: rec.id, data: rec, updatedAt, deleted: Boolean(rec.deleted) });
      }
    }
  }

  const settings = await getSettings();
  for (const field of SHARED_SETTINGS_FIELDS) {
    const fieldUpdatedAt = Number(settings[sharedFieldTimestampKey(field)]) || 0;
    if (fieldUpdatedAt > sinceTimestamp) {
      changes.push({ store: 'settings', id: SETTINGS_ID_PREFIX + field, data: { [field]: settings[field] }, updatedAt: fieldUpdatedAt, deleted: false });
    }
  }

  return changes;
}

export async function pushChanges(settings) {
  const since = settings.lastPushedAt || 0;
  const changes = await collectDirtyChanges(since);
  if (changes.length === 0) return { pushed: 0 };

  let maxUpdatedAt = since;
  for (const batch of chunk(changes, PUSH_BATCH_SIZE)) {
    let res;
    try {
      res = await fetch(`${settings.lineRelayUrl}/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Sync-Key': settings.syncKey },
        body: JSON.stringify({ changes: batch }),
      });
    } catch (err) {
      throw new Error('無法連線到 Worker，請確認網路連線');
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error || ''; } catch (e) { /* ignore */ }
      throw new Error(`推送失敗（${res.status}）${detail ? '：' + detail : ''}`);
    }
    for (const c of batch) if (c.updatedAt > maxUpdatedAt) maxUpdatedAt = c.updatedAt;
  }

  await saveSettings({ lastPushedAt: maxUpdatedAt });
  return { pushed: changes.length };
}

export async function pullChanges(settings) {
  const since = settings.lastPulledAt || 0;
  let res;
  try {
    res = await fetch(`${settings.lineRelayUrl}/sync/pull?since=${since}`, {
      headers: { 'X-Sync-Key': settings.syncKey },
    });
  } catch (err) {
    throw new Error('無法連線到 Worker，請確認網路連線');
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch (e) { /* ignore */ }
    throw new Error(`拉取失敗（${res.status}）${detail ? '：' + detail : ''}`);
  }
  const json = await res.json();
  const records = Array.isArray(json.records) ? json.records : [];

  let maxUpdatedAt = since;
  // Group by store so each store's incoming records get written in one
  // transaction rather than one-at-a-time. 'settings' records are pulled out
  // and handled separately — one per shared field — since each merges into
  // the local settings record rather than being written as its own
  // standalone record.
  const byStore = {};
  const incomingSharedFields = {};
  for (const rec of records) {
    if (rec.store === 'settings' && typeof rec.id === 'string' && rec.id.startsWith(SETTINGS_ID_PREFIX)) {
      const field = rec.id.slice(SETTINGS_ID_PREFIX.length);
      if (SHARED_SETTINGS_FIELDS.includes(field)) {
        const existing = incomingSharedFields[field];
        if (!existing || rec.updatedAt > existing.updatedAt) incomingSharedFields[field] = rec;
      }
    } else if (SYNCED_STORES.includes(rec.store)) {
      (byStore[rec.store] ||= []).push(rec);
    }
    if (rec.updatedAt > maxUpdatedAt) maxUpdatedAt = rec.updatedAt;
  }

  for (const [store, recs] of Object.entries(byStore)) {
    const toWrite = [];
    for (const rec of recs) {
      const local = await getByIdRaw(store, rec.id);
      // Last-write-wins: only apply the incoming record if it's newer than
      // (or the same age as — first time seeing this id — ) what's local.
      if (!local || rec.updatedAt > (Number(local.updatedAt) || 0)) {
        toWrite.push({ ...(rec.data || {}), id: rec.id, deleted: rec.deleted, updatedAt: rec.updatedAt });
      }
    }
    if (toWrite.length) await putManyRaw(store, toWrite);
  }

  for (const [field, rec] of Object.entries(incomingSharedFields)) {
    const currentFieldUpdatedAt = Number((await getSettings())[sharedFieldTimestampKey(field)]) || 0;
    if (rec.updatedAt > currentFieldUpdatedAt) {
      await applyIncomingSharedSettingsField(field, rec.data ? rec.data[field] : undefined, rec.updatedAt);
    }
  }

  await saveSettings({ lastPulledAt: maxUpdatedAt });
  return { pulled: records.length };
}

// Pushes first (so the server has our latest before we ask "what's newer
// than X"), then pulls. Either half failing leaves lastPushedAt/lastPulledAt
// untouched for that half, so the next attempt safely retries from where it
// left off — nothing here needs to be transactional across the two calls.
export async function syncNow() {
  const settings = await getSettings();
  const issue = syncConfigIssue(settings);
  if (issue) {
    throw new Error(issue);
  }
  const pushResult = await pushChanges(settings);
  const settingsAfterPush = await getSettings();
  const pullResult = await pullChanges(settingsAfterPush);
  await saveSettings({ lastSyncedAt: Date.now() });
  return { ...pushResult, ...pullResult };
}

// Fire-and-forget helper for automatic sync triggers (boot, reconnect,
// periodic timer) — swallows errors since these aren't user-initiated
// actions and shouldn't interrupt anything with a toast/error on every
// flaky connection blip.
export async function syncQuietly() {
  try {
    const settings = await getSettings();
    if (!isSyncConfigured(settings)) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    await syncNow();
  } catch (err) {
    console.warn('Background sync failed (will retry later):', err.message);
  }
}
