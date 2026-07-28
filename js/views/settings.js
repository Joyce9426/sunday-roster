import { getSettings, saveSettings, exportAllData, importAllData } from '../db.js';
import { toast, confirmDialog, escapeHtml, backButtonHtml, attachBackButton, todayStr } from '../utils.js';

export async function renderSettings(root) {
  let settings = await getSettings();

  function draw() {
    root.innerHTML = `
      <div class="page-head">
        <div class="page-head-left">
          ${backButtonHtml()}
          <div>
            <h1>設定</h1>
            <div class="sub">繳費方式、資料備份</div>
          </div>
        </div>
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
          <input type="text" id="new-method-input" placeholder="新增繳費方式…" style="flex:1;border:1px solid var(--line);border-radius:8px;padding:8px 10px;">
          <button class="btn" id="add-method-btn">新增</button>
        </div>
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

    attachBackButton(root);
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

    root.querySelector('#export-btn').addEventListener('click', async () => {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = todayStr();
      a.href = url;
      a.download = `週日場記_備份_${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('已匯出備份');
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
