import { getSettings, saveSettings, exportAllData, importAllData } from '../db.js';
import { toast, confirmDialog, escapeHtml, todayStr, uid } from '../utils.js';
import { navigate } from '../router.js';
import { isSettingsUnlocked, renderSettingsLockScreen } from '../authGate.js';

export async function renderSettings(root) {
  if (!isSettingsUnlocked()) {
    renderSettingsLockScreen(root, () => renderSettingsUnlocked(root));
    return;
  }
  await renderSettingsUnlocked(root);
}

async function renderSettingsUnlocked(root) {
  let settings = await getSettings();

  function draw() {
    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>設定</h1>
          <div class="sub">繳費方式、資料備份</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">人員管理</div>
        <p class="small text-soft">新增、編輯、刪除人員總表。</p>
        <button class="btn btn-primary btn-sm" id="go-members-btn">前往人員總表</button>
      </div>

      <div class="card">
        <div class="card-title">繳費方式清單</div>
        <div class="stack" id="method-list">
          ${settings.paymentMethods.map((m, i) => `
            <div class="flex-between" data-method-row="${i}">
              <span>${escapeHtml(m)}</span>
              <button class="icon-btn" data-remove-method="${i}" aria-label="移除">✕</button>
            </div>
          `).join('')}
        </div>
        <div class="flex gap-8 mt-16">
          <input type="text" id="new-method-input" placeholder="新增繳費方式…" style="flex:1;min-width:0;border:1px solid var(--line);border-radius:8px;padding:8px 10px;box-sizing:border-box;">
          <button class="btn" id="add-method-btn">新增</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">LINE 發送設定</div>
        <p class="small text-soft">設定你自己架設的 Cloudflare Worker 中介，用來把場次名單發送到 LINE。</p>
        <div class="field">
          <label>Worker 網址</label>
          <input type="text" id="line-relay-url" value="${escapeHtml(settings.lineRelayUrl || '')}" placeholder="https://xxx.workers.dev">
        </div>
        <div class="field">
          <label>通關密語（X-Api-Key）</label>
          <input type="text" id="line-relay-key" value="${escapeHtml(settings.lineRelayApiKey || '')}">
        </div>
        <button class="btn btn-primary btn-sm" id="save-line-config-btn">儲存設定</button>

        <div class="divider"></div>

        <div class="card-title" style="margin-bottom:6px;">常用聊天室</div>
        <p class="small text-soft" style="margin-top:0;">發送場次名單時，會從這份清單裡選擇要送到哪個聊天室。</p>
        ${settings.lineTargets.length ? `
          <div class="stack">
            ${settings.lineTargets.map((t) => `
              <div class="flex-between">
                <div style="min-width:0;overflow-wrap:anywhere;">
                  <div style="font-weight:600;">${escapeHtml(t.name)}</div>
                  <div class="small text-faint">${escapeHtml(t.groupId)}</div>
                </div>
                <button class="icon-btn" data-remove-target="${t.id}" aria-label="移除">✕</button>
              </div>
            `).join('')}
          </div>
        ` : '<div class="small text-faint">尚未建立任何常用聊天室</div>'}
        <div class="field mt-16">
          <label>名稱</label>
          <input type="text" id="new-target-name" placeholder="例：羽球群">
        </div>
        <div class="field">
          <label>Group ID</label>
          <input type="text" id="new-target-id" placeholder="Cxxxxxxxx...">
        </div>
        <button class="btn" id="add-target-btn">＋ 新增聊天室</button>
      </div>

      <div class="card">
        <div class="card-title">資料備份</div>
        <p class="small text-soft">目前所有資料僅儲存在本機裝置。建議定期匯出備份，以防清除瀏覽器資料或更換裝置時遺失紀錄。</p>
        <div class="flex gap-8 mt-8">
          <button class="btn btn-primary" id="export-btn">匯出 JSON 備份</button>
          <button class="btn" id="import-btn">匯入 JSON 備份</button>
        </div>
        <input type="file" id="import-file" accept="application/json" class="hidden">
      </div>

      <div class="card">
        <div class="card-title">關於</div>
        <p class="small text-soft">週日場記・場次人員管理　v1.0<br>單機使用，資料只存在此裝置的瀏覽器中。</p>
      </div>
    `;

    root.querySelector('#go-members-btn').addEventListener('click', () => navigate('/members'));

    root.querySelectorAll('[data-remove-method]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.removeMethod);
        const removed = settings.paymentMethods[idx];
        confirmDialog(`移除繳費方式「${escapeHtml(removed)}」？已使用此方式的紀錄不會被更動。`, async () => {
          settings.paymentMethods = settings.paymentMethods.filter((_, i) => i !== idx);
          await saveSettings({ paymentMethods: settings.paymentMethods });
          draw();
          toast('已移除');
        });
      });
    });

    root.querySelector('#add-method-btn').addEventListener('click', async () => {
      const input = root.querySelector('#new-method-input');
      const val = input.value.trim();
      if (!val) return;
      if (settings.paymentMethods.includes(val)) { toast('此方式已存在'); return; }
      settings.paymentMethods = [...settings.paymentMethods, val];
      await saveSettings({ paymentMethods: settings.paymentMethods });
      draw();
      toast('已新增繳費方式');
    });

    root.querySelector('#save-line-config-btn').addEventListener('click', async () => {
      const lineRelayUrl = root.querySelector('#line-relay-url').value.trim();
      const lineRelayApiKey = root.querySelector('#line-relay-key').value.trim();
      settings.lineRelayUrl = lineRelayUrl;
      settings.lineRelayApiKey = lineRelayApiKey;
      await saveSettings({ lineRelayUrl, lineRelayApiKey });
      toast('已儲存 LINE 發送設定');
    });

    root.querySelector('#add-target-btn').addEventListener('click', async () => {
      const nameInput = root.querySelector('#new-target-name');
      const idInput = root.querySelector('#new-target-id');
      const name = nameInput.value.trim();
      const groupId = idInput.value.trim();
      if (!name || !groupId) { toast('請輸入名稱與 Group ID'); return; }
      const target = { id: uid(), name, groupId };
      settings.lineTargets = [...settings.lineTargets, target];
      await saveSettings({ lineTargets: settings.lineTargets });
      draw();
      toast('已新增常用聊天室');
    });

    root.querySelectorAll('[data-remove-target]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = settings.lineTargets.find((x) => x.id === btn.dataset.removeTarget);
        confirmDialog(`確定要移除「${escapeHtml(t?.name || '')}」這個常用聊天室嗎？`, async () => {
          settings.lineTargets = settings.lineTargets.filter((x) => x.id !== btn.dataset.removeTarget);
          await saveSettings({ lineTargets: settings.lineTargets });
          draw();
          toast('已移除');
        });
      });
    });

    root.querySelector('#export-btn').addEventListener('click', async () => {
      const data = await exportAllData();
      const stamp = todayStr();
      const filename = `週日場記_備份_${stamp}.json`;
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });

      // iOS home-screen (standalone) PWAs don't have Safari's real download manager behind
      // an <a download> click — the browser reports "download complete" but no file ever
      // lands in Files. The share sheet DOES work correctly there, so try it first and only
      // fall back to the classic download link for browsers that can't share files.
      let sharedSuccessfully = false;
      if (typeof navigator.canShare === 'function' && typeof navigator.share === 'function') {
        try {
          const file = new File([blob], filename, { type: 'application/json' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: filename });
            sharedSuccessfully = true;
            toast('請在分享面板選擇「儲存至檔案」完成備份');
          }
        } catch (err) {
          if (err && err.name === 'AbortError') { sharedSuccessfully = true; } // user just cancelled the sheet
        }
      }

      if (!sharedSuccessfully) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast('已匯出備份');
      }
    });

    root.querySelector('#import-btn').addEventListener('click', () => {
      root.querySelector('#import-file').click();
    });
    root.querySelector('#import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      confirmDialog('匯入將完全覆蓋目前本機的所有資料，確定要繼續嗎？', async () => {
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          await importAllData(data);
          toast('匯入完成，重新載入中…');
          setTimeout(() => window.location.reload(), 600);
        } catch (err) {
          toast('匯入失敗：檔案格式錯誤');
        }
      });
    });
  }

  draw();
}
