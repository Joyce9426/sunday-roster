import { getAll, put, putMany, remove, getByIndex, removeMany } from '../db.js';
import {
  uid, toast, openModal, confirmDialog, escapeHtml, fmtDate, suggestSeasonName,
  countSundaysBetween, listSundaysBetween, todayStr, addDays, backButtonHtml, attachBackButton,
  isSeasonOngoing,
} from '../utils.js';
import { navigate } from '../router.js';
import { SESSION_DEFAULTS } from '../constants.js';

export async function renderSeasonsList(root) {
  let seasons = await getAll('seasons');
  const allSessions = await getAll('sessions');
  const allPasses = await getAll('seasonPasses');

  function countsFor(seasonId) {
    return {
      sessions: allSessions.filter((s) => s.seasonId === seasonId).length,
      passes: allPasses.filter((p) => p.seasonId === seasonId).length,
    };
  }

  function draw() {
    const today = todayStr();
    const ongoing = seasons.filter((s) => isSeasonOngoing(s, today)).sort((a, b) => b.startDate.localeCompare(a.startDate));
    const completed = seasons.filter((s) => !isSeasonOngoing(s, today)).sort((a, b) => b.endDate.localeCompare(a.endDate));

    root.innerHTML = `
      <div class="page-head">
        <div class="page-head-left">
          ${backButtonHtml()}
          <div>
            <h1>季度管理</h1>
            <div class="sub">以三個月為一季，管理場次與季打名單</div>
          </div>
        </div>
        <button class="btn btn-primary" id="add-season-btn">＋ 新增季度</button>
      </div>

      ${seasons.length === 0 ? `
        <div class="empty-state">
          <div class="glyph">◷</div>
          <p>還沒有任何季度</p>
          <p>建立第一季，開始管理你的週日場次吧</p>
        </div>
      ` : `
        <div class="section-eyebrow">進行中</div>
        ${ongoing.length ? `<div class="card">${ongoing.map(seasonRow).join('')}</div>` : `<div class="card small text-faint">目前沒有進行中的季度</div>`}

        <div class="section-eyebrow mt-16">已結束</div>
        ${completed.length ? `<div class="card">${completed.map(seasonRow).join('')}</div>` : `<div class="card small text-faint">尚無已結束的季度</div>`}
      `}
    `;

    attachBackButton(root);
    root.querySelector('#add-season-btn').addEventListener('click', () => openSeasonModal());
    root.querySelectorAll('[data-open]').forEach((el) => {
      el.addEventListener('click', () => navigate(`/seasons/${el.dataset.open}`));
    });
    root.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const s = seasons.find((x) => x.id === btn.dataset.edit);
        openSeasonModal(s);
      });
    });
    root.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const s = seasons.find((x) => x.id === btn.dataset.delete);
        const c = countsFor(s.id);
        confirmDialog(
          `確定要刪除「${escapeHtml(s.name)}」嗎？此季共有 ${c.sessions} 個場次、${c.passes} 位季打，將一併刪除且無法復原。`,
          async () => {
            const sessions = allSessions.filter((x) => x.seasonId === s.id);
            for (const sess of sessions) {
              const rosters = await getByIndex('sessionRosters', 'sessionId', sess.id);
              await removeMany('sessionRosters', rosters.map((r) => r.id));
            }
            await removeMany('sessions', sessions.map((x) => x.id));
            const passes = allPasses.filter((x) => x.seasonId === s.id);
            await removeMany('seasonPasses', passes.map((x) => x.id));
            await remove('seasons', s.id);
            seasons = seasons.filter((x) => x.id !== s.id);
            draw();
            toast('已刪除季度');
          }
        );
      });
    });
  }

  function seasonRow(s) {
    const c = countsFor(s.id);
    return `
      <div class="list-row" data-open="${s.id}" style="cursor:pointer;">
        <div class="list-row-main">
          <div class="list-row-title">${escapeHtml(s.name)}</div>
          <div class="list-row-meta">${fmtDate(s.startDate)} － ${fmtDate(s.endDate)}　・　場次 ${c.sessions}　・　季打 ${c.passes} 人</div>
        </div>
        <div class="list-row-actions">
          <button class="icon-btn" data-edit="${s.id}" aria-label="編輯">✎</button>
          <button class="icon-btn" data-delete="${s.id}" aria-label="刪除">🗑</button>
        </div>
      </div>
    `;
  }

  function openSeasonModal(existing) {
    const isEdit = !!existing;
    const defaultStart = todayStr();
    const defaultEnd = addDays(defaultStart, 89);

    openModal({
      title: isEdit ? '編輯季度' : '新增季度',
      bodyHtml: `
        <div class="field-row">
          <div class="field">
            <label>起始日期</label>
            <input type="date" id="s-start" value="${isEdit ? existing.startDate : defaultStart}">
          </div>
          <div class="field">
            <label>結束日期</label>
            <input type="date" id="s-end" value="${isEdit ? existing.endDate : defaultEnd}">
          </div>
        </div>
        <div class="field">
          <label>季度名稱</label>
          <input type="text" id="s-name" value="${isEdit ? escapeHtml(existing.name) : suggestSeasonName(defaultStart)}">
        </div>
        <div class="field">
          <label>預計場次數（依週日自動推算，可手動調整）</label>
          <input type="number" id="s-count" value="${isEdit ? existing.estimatedSessionCount : countSundaysBetween(defaultStart, defaultEnd)}">
        </div>
        <div class="field">
          <label>季打整季預收金額（每人）</label>
          <input type="number" id="s-fee" value="${isEdit ? existing.seasonPassFee : ''}" placeholder="例：1300">
          <div class="field-hint">新增季打人員時，會直接帶入這個金額作為預收金額。</div>
        </div>
        ${!isEdit ? `<div class="field-hint">建立後會自動依起訖日期產生每個禮拜日的場次（套用預設時段／場地／冷氣／費用）。</div>` : ''}
      `,
      onMount: (panel) => {
        const startEl = panel.querySelector('#s-start');
        const endEl = panel.querySelector('#s-end');
        const nameEl = panel.querySelector('#s-name');
        const countEl = panel.querySelector('#s-count');
        let nameTouched = isEdit;
        let countTouched = isEdit;
        nameEl.addEventListener('input', () => { nameTouched = true; });
        countEl.addEventListener('input', () => { countTouched = true; });
        function recalc() {
          if (!nameTouched) nameEl.value = suggestSeasonName(startEl.value);
          if (!countTouched) countEl.value = countSundaysBetween(startEl.value, endEl.value);
        }
        startEl.addEventListener('change', recalc);
        endEl.addEventListener('change', recalc);
      },
      actions: [
        { label: '取消', onClick: (close) => close() },
        {
          label: isEdit ? '儲存' : '新增',
          primary: true,
          onClick: async (close, panel) => {
            const startDate = panel.querySelector('#s-start').value;
            const endDate = panel.querySelector('#s-end').value;
            const name = panel.querySelector('#s-name').value.trim();
            const estimatedSessionCount = Number(panel.querySelector('#s-count').value) || 0;
            const seasonPassFee = Number(panel.querySelector('#s-fee').value) || 0;
            if (!name || !startDate || !endDate) { toast('請完整填寫季度資訊'); return; }
            const obj = existing
              ? { ...existing, name, startDate, endDate, estimatedSessionCount, seasonPassFee }
              : { id: uid(), name, startDate, endDate, estimatedSessionCount, seasonPassFee, createdAt: new Date().toISOString() };
            await put('seasons', obj);

            if (!isEdit) {
              const sundayDates = listSundaysBetween(startDate, endDate);
              const newSessions = sundayDates.map((date) => ({
                id: uid(),
                seasonId: obj.id,
                date,
                timeSlot: SESSION_DEFAULTS.timeSlot,
                venue: SESSION_DEFAULTS.venue,
                acUsed: SESSION_DEFAULTS.acUsed,
                venueCost: SESSION_DEFAULTS.venueCost,
                acCost: SESSION_DEFAULTS.acCost,
                otherCost: SESSION_DEFAULTS.otherCost,
                baseFeePerPerson: SESSION_DEFAULTS.baseFeePerPerson,
                seasonPassDivisor: SESSION_DEFAULTS.seasonPassDivisor,
                status: '未開始',
                createdAt: new Date().toISOString(),
              }));
              if (newSessions.length) await putMany('sessions', newSessions);
            }

            close();
            if (isEdit) {
              seasons = seasons.map((x) => (x.id === obj.id ? obj : x));
              draw();
              toast('已更新季度');
            } else {
              toast('已建立季度，並自動產生所有週日場次');
              navigate(`/seasons/${obj.id}`);
            }
          },
        },
      ],
    });
  }

  draw();
}
