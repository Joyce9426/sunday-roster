import { getById, getByIndex, getAll, put, remove, putMany, getSettings } from '../db.js';
import { uid, toast, openModal, confirmDialog, escapeHtml, fmtDate, fmtMoney, backButtonHtml, attachBackButton } from '../utils.js';
import { navigate } from '../router.js';
import { computeSessionStats, sessionPerPersonShare, seasonPassDivisorOf } from '../calc.js';
import { SESSION_DEFAULTS } from '../constants.js';

export async function renderSessionDetail(root, seasonId, sessionId) {
  const season = await getById('seasons', seasonId);
  let session = await getById('sessions', sessionId);
  if (!season || !session) { navigate('/sessions'); return; }

  const settings = await getSettings();
  const members = await getAll('members');
  const membersById = Object.fromEntries(members.map((m) => [m.id, m]));
  let rosters = await getByIndex('sessionRosters', 'sessionId', sessionId);
  let seasonPasses = await getByIndex('seasonPasses', 'seasonId', seasonId);

  let activeTab = 'roster';
  let selectedCasualIds = new Set();

  function draw() {
    const stats = computeSessionStats(session, rosters);
    const divisor = seasonPassDivisorOf(session);
    const share = sessionPerPersonShare(session);

    root.innerHTML = `
      <div class="page-head">
        <div class="page-head-left">
          ${backButtonHtml()}
          <div>
            <h1>${fmtDate(session.date)}</h1>
            <div class="sub">${escapeHtml(season.name)}${session.timeSlot ? `・${escapeHtml(session.timeSlot)}` : ''}${session.venue ? `・${escapeHtml(session.venue)}` : ''}</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" id="edit-session-btn">場次設定</button>
      </div>

      <div class="scoreboard">
        <div class="scoreboard-label">本場次統計</div>
        <div class="scoreboard-grid">
          <div class="scoreboard-cell"><div class="num mono">$${fmtMoney(stats.received)}</div><div class="cap">臨打已收</div></div>
          <div class="scoreboard-cell"><div class="num mono">$${fmtMoney(stats.receivable)}</div><div class="cap">臨打應收</div></div>
          <div class="scoreboard-cell"><div class="num mono">$${fmtMoney(stats.seasonPassIncome)}</div><div class="cap">季打已收</div></div>
          <div class="scoreboard-cell"><div class="num mono">$${fmtMoney(stats.expense)}</div><div class="cap">總支出</div></div>
          <div class="scoreboard-cell"><div class="num mono">$${fmtMoney(stats.receivedSurplus)}</div><div class="cap">已收盈餘</div></div>
          <div class="scoreboard-cell"><div class="num mono">$${fmtMoney(stats.receivableSurplus)}</div><div class="cap">應收盈餘</div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">冷氣與支出</div>
        <div class="small text-soft">
          冷氣狀態：<strong>${session.acUsed}</strong>　場地費 $${fmtMoney(session.venueCost)}　冷氣費 $${fmtMoney(session.acCost)}　其他 $${fmtMoney(session.otherCost)}
        </div>
        <div class="small text-faint mt-8">季打該場次應付金額＝(場地費＋冷氣費) ÷ ${divisor}（本場分攤人數）＝ $${fmtMoney(share)}／人</div>
      </div>

      <div class="subtabs">
        <button data-tab="roster" class="${activeTab === 'roster' ? 'active' : ''}">人員名單</button>
        <button data-tab="seasonpass" class="${activeTab === 'seasonpass' ? 'active' : ''}">季打管理</button>
      </div>

      <div id="tab-body"></div>
    `;

    attachBackButton(root);
    root.querySelector('#edit-session-btn').addEventListener('click', () => openEditSessionModal());
    root.querySelectorAll('.subtabs button').forEach((btn) => {
      btn.addEventListener('click', () => { activeTab = btn.dataset.tab; draw(); });
    });

    const tabBody = root.querySelector('#tab-body');
    if (activeTab === 'roster') drawRosterTab(tabBody, stats);
    else drawSeasonPassTab(tabBody);
  }

  // ---------------- 人員名單 tab ----------------
  function drawRosterTab(tabBody, stats) {
    // A season-pass member counts as attending (visible here) unless explicitly marked 請假.
    const leaveMemberIds = new Set(
      rosters.filter((r) => r.sourceType === 'seasonPass' && r.attendance === '請假').map((r) => r.memberId)
    );
    const seasonPassAttendingMemberIds = seasonPasses.map((sp) => sp.memberId).filter((id) => !leaveMemberIds.has(id));
    const casualRows = rosters.filter((r) => r.sourceType === 'casual');

    const visibleRows = [
      ...seasonPassAttendingMemberIds.map((memberId) => ({ sourceType: 'seasonPass', memberId, m: membersById[memberId] })),
      ...casualRows.map((r) => ({ ...r, m: membersById[r.memberId] })),
    ].filter((x) => x.m);
    const male = visibleRows.filter((x) => x.m.gender === '男');
    const female = visibleRows.filter((x) => x.m.gender === '女');
    const methodEntries = Object.entries(stats.byMethod);

    tabBody.innerHTML = `
      <div class="flex-between mt-8" style="margin-bottom:10px;">
        <div class="small text-soft">季打出席 ${stats.seasonPassAttendingCount} 人・臨打 ${stats.casualCount} 人</div>
        <button class="btn btn-primary btn-sm" id="add-casual-btn">＋ 加入臨打</button>
      </div>

      ${selectedCasualIds.size ? `
        <div class="batch-bar">
          已選取 <strong>${selectedCasualIds.size}</strong> 位臨打
          <button class="btn btn-sm" id="batch-fee-btn">批量調整費用</button>
          <button class="btn btn-sm" id="batch-method-btn">批量設定繳費方式</button>
          <button class="btn btn-sm" id="clear-select-btn">取消選取</button>
        </div>
      ` : ''}

      <div class="card">
        <table class="roster">
          <thead><tr>
            <th style="width:24px;"></th><th>姓名</th><th>費用</th><th>繳費方式</th><th></th>
          </tr></thead>
          <tbody>
            <tr><td colspan="5" class="roster-group-head">男（${male.length}）</td></tr>
            ${male.length ? male.map(rosterRow).join('') : blankRow()}
            <tr><td colspan="5" class="roster-group-head">女（${female.length}）</td></tr>
            ${female.length ? female.map(rosterRow).join('') : blankRow()}
          </tbody>
        </table>
      </div>

      <div class="card">
        <div class="card-title">依付款方式加總（已繳）</div>
        ${methodEntries.length ? `
          <div class="stack">
            ${methodEntries.map(([k, v]) => `<div class="flex-between"><span>${escapeHtml(k)}</span><span class="mono">$${fmtMoney(v)}</span></div>`).join('')}
            <div class="flex-between" style="border-top:1px solid var(--line);margin-top:4px;padding-top:6px;"><strong>合計已收（臨打）</strong><strong class="mono">$${fmtMoney(stats.received)}</strong></div>
          </div>
        ` : '<div class="small text-faint">尚無已繳款項</div>'}
      </div>
    `;

    tabBody.querySelector('#add-casual-btn').addEventListener('click', () => openAddCasualModal());
    tabBody.querySelectorAll('[data-select-casual]').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) selectedCasualIds.add(cb.dataset.selectCasual);
        else selectedCasualIds.delete(cb.dataset.selectCasual);
        draw();
      });
    });
    const clearBtn = tabBody.querySelector('#clear-select-btn');
    if (clearBtn) clearBtn.addEventListener('click', () => { selectedCasualIds.clear(); draw(); });
    const batchFeeBtn = tabBody.querySelector('#batch-fee-btn');
    if (batchFeeBtn) batchFeeBtn.addEventListener('click', () => openBatchFeeModal());
    const batchMethodBtn = tabBody.querySelector('#batch-method-btn');
    if (batchMethodBtn) batchMethodBtn.addEventListener('click', () => openBatchMethodModal());

    tabBody.querySelectorAll('[data-fee]').forEach((input) => {
      input.addEventListener('change', async () => {
        const r = rosters.find((x) => x.id === input.dataset.fee);
        const updated = { ...r, feeAmount: Number(input.value) || 0 };
        await put('sessionRosters', updated);
        rosters = rosters.map((x) => (x.id === r.id ? updated : x));
        draw();
      });
    });
    tabBody.querySelectorAll('[data-method]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const r = rosters.find((x) => x.id === sel.dataset.method);
        const updated = { ...r, paymentMethod: sel.value };
        await put('sessionRosters', updated);
        rosters = rosters.map((x) => (x.id === r.id ? updated : x));
        draw();
      });
    });
    tabBody.querySelectorAll('[data-remove-roster]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = rosters.find((x) => x.id === btn.dataset.removeRoster);
        const m = membersById[r.memberId];
        confirmDialog(`將「${escapeHtml(m.name)}」自本場次名單移除？`, async () => {
          await remove('sessionRosters', r.id);
          rosters = rosters.filter((x) => x.id !== r.id);
          selectedCasualIds.delete(r.id);
          draw();
        });
      });
    });
  }

  function blankRow() {
    return `<tr><td colspan="5" class="small text-faint" style="padding:8px;">尚無人員</td></tr>`;
  }

  function rosterRow(row) {
    const isSeasonPass = row.sourceType === 'seasonPass';
    const m = row.m;
    const nameCellHtml = isSeasonPass
      ? `${escapeHtml(m.name)}<span class="badge badge-blue">季打</span>`
      : `${escapeHtml(m.name)}<span class="badge badge-gray">臨打</span>`;
    if (isSeasonPass) {
      return `
        <tr>
          <td></td>
          <td class="roster-name">${nameCellHtml}</td>
          <td><span class="badge badge-gold">已預繳</span></td>
          <td>－</td>
          <td></td>
        </tr>
      `;
    }
    const r = row;
    return `
      <tr>
        <td><input type="checkbox" data-select-casual="${r.id}" ${selectedCasualIds.has(r.id) ? 'checked' : ''}></td>
        <td class="roster-name">${nameCellHtml}</td>
        <td><input type="number" class="fee-input" data-fee="${r.id}" value="${r.feeAmount}"></td>
        <td>
          <select class="inline-select" data-method="${r.id}">
            <option value="" ${!r.paymentMethod ? 'selected' : ''}>－</option>
            ${settings.paymentMethods.map((pm) => `<option value="${pm}" ${r.paymentMethod === pm ? 'selected' : ''}>${pm}</option>`).join('')}
          </select>
        </td>
        <td><button class="icon-btn" data-remove-roster="${r.id}" aria-label="移除">✕</button></td>
      </tr>
    `;
  }

  function openAddCasualModal() {
    const existingIds = new Set(rosters.filter((r) => r.sourceType === 'casual').map((r) => r.memberId));
    const candidates = members.filter((m) => !existingIds.has(m.id)).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    openModal({
      title: '加入臨打',
      bodyHtml: `
        <div class="field">
          <label>選擇人員</label>
          <select id="casual-member-select" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 10px;">
            <option value="">－ 選擇既有人員 －</option>
            ${candidates.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}（${m.gender}）</option>`).join('')}
            <option value="__new__">＋ 新增人員…</option>
          </select>
        </div>
        <div id="new-casual-fields" class="hidden">
          <div class="field"><label>姓名</label><input type="text" id="new-casual-name"></div>
          <div class="field">
            <label>性別</label>
            <div class="radio-group" id="new-casual-gender-group">
              <label class="radio-chip checked"><input type="radio" name="new-casual-gender" value="男" checked>男</label>
              <label class="radio-chip"><input type="radio" name="new-casual-gender" value="女">女</label>
            </div>
          </div>
        </div>
        <div class="field"><label>本場次費用</label><input type="number" id="casual-fee" value="${session.baseFeePerPerson}"></div>
      `,
      onMount: (panel) => {
        const select = panel.querySelector('#casual-member-select');
        const newFields = panel.querySelector('#new-casual-fields');
        select.addEventListener('change', () => newFields.classList.toggle('hidden', select.value !== '__new__'));
        panel.querySelectorAll('#new-casual-gender-group .radio-chip').forEach((chip) => {
          chip.addEventListener('click', () => {
            panel.querySelectorAll('#new-casual-gender-group .radio-chip').forEach((c) => c.classList.remove('checked'));
            chip.classList.add('checked');
          });
        });
      },
      actions: [
        { label: '取消', onClick: (close) => close() },
        {
          label: '加入',
          primary: true,
          onClick: async (close, panel) => {
            const select = panel.querySelector('#casual-member-select');
            let memberId = select.value;
            if (!memberId) { toast('請選擇人員'); return; }
            if (memberId === '__new__') {
              const name = panel.querySelector('#new-casual-name').value.trim();
              if (!name) { toast('請輸入姓名'); return; }
              const gender = panel.querySelector('input[name=new-casual-gender]:checked').value;
              const newMember = { id: uid(), name, gender, note: '', isActive: true, createdAt: new Date().toISOString() };
              await put('members', newMember);
              members.push(newMember);
              membersById[newMember.id] = newMember;
              memberId = newMember.id;
            }
            const roster = {
              id: uid(),
              sessionId,
              memberId,
              sourceType: 'casual',
              attendance: '出席',
              feeAmount: Number(panel.querySelector('#casual-fee').value) || 0,
              paymentMethod: '',
              createdAt: new Date().toISOString(),
            };
            await put('sessionRosters', roster);
            rosters.push(roster);
            close();
            draw();
            toast('已加入臨打');
          },
        },
      ],
    });
  }

  function openBatchFeeModal() {
    openModal({
      title: `批量調整費用（${selectedCasualIds.size} 位）`,
      bodyHtml: `
        <div class="field">
          <label>調整方式</label>
          <div class="radio-group" id="mode-group">
            <label class="radio-chip checked"><input type="radio" name="mode" value="set" checked>設為固定金額</label>
            <label class="radio-chip"><input type="radio" name="mode" value="delta">整體調整（±）</label>
          </div>
        </div>
        <div class="field"><label>金額</label><input type="number" id="batch-fee-value" value="0"></div>
      `,
      onMount: (panel) => {
        panel.querySelectorAll('#mode-group .radio-chip').forEach((chip) => {
          chip.addEventListener('click', () => {
            panel.querySelectorAll('#mode-group .radio-chip').forEach((c) => c.classList.remove('checked'));
            chip.classList.add('checked');
          });
        });
      },
      actions: [
        { label: '取消', onClick: (close) => close() },
        {
          label: '套用',
          primary: true,
          onClick: async (close, panel) => {
            const mode = panel.querySelector('input[name=mode]:checked').value;
            const value = Number(panel.querySelector('#batch-fee-value').value) || 0;
            const updates = rosters
              .filter((r) => selectedCasualIds.has(r.id))
              .map((r) => ({ ...r, feeAmount: mode === 'set' ? value : Math.max(0, (Number(r.feeAmount) || 0) + value) }));
            await putMany('sessionRosters', updates);
            rosters = rosters.map((r) => updates.find((u) => u.id === r.id) || r);
            selectedCasualIds.clear();
            close();
            draw();
            toast('已批量調整費用');
          },
        },
      ],
    });
  }

  function openBatchMethodModal() {
    openModal({
      title: `批量設定繳費方式（${selectedCasualIds.size} 位）`,
      bodyHtml: `
        <div class="field">
          <label>繳費方式</label>
          <select id="batch-method" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 10px;">
            <option value="">－（設為未繳）</option>
            ${settings.paymentMethods.map((m) => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
      `,
      actions: [
        { label: '取消', onClick: (close) => close() },
        {
          label: '套用',
          primary: true,
          onClick: async (close, panel) => {
            const method = panel.querySelector('#batch-method').value;
            const updates = rosters
              .filter((r) => selectedCasualIds.has(r.id))
              .map((r) => ({ ...r, paymentMethod: method }));
            await putMany('sessionRosters', updates);
            rosters = rosters.map((r) => updates.find((u) => u.id === r.id) || r);
            selectedCasualIds.clear();
            close();
            draw();
            toast('已批量設定繳費方式');
          },
        },
      ],
    });
  }

  // ---------------- 季打管理 tab ----------------
  // Point 11: only two states — 出席 (default) / 請假. Point 12: grouped by gender.
  function drawSeasonPassTab(tabBody) {
    const rows = seasonPasses
      .map((sp) => ({ sp, member: membersById[sp.memberId], roster: rosters.find((r) => r.memberId === sp.memberId && r.sourceType === 'seasonPass') }))
      .filter((x) => x.member)
      .sort((a, b) => a.member.name.localeCompare(b.member.name, 'zh-Hant'));
    const male = rows.filter((x) => x.member.gender === '男');
    const female = rows.filter((x) => x.member.gender === '女');

    tabBody.innerHTML = `
      <div class="small text-soft mt-8" style="margin-bottom:10px;">預設為出席。設定「請假」會從人員名單移除，並在季度結算時視為當場退費。</div>
      ${rows.length === 0 ? `
        <div class="empty-state"><div class="glyph">◍</div><p>本季尚未設定季打名單</p></div>
      ` : `<div class="card"><table class="roster">
            <thead><tr><th colspan="2">男（${male.length}）</th></tr></thead>
            <tbody>${male.length ? male.map(seasonPassRow).join('') : blankSpRow()}</tbody>
            <thead><tr><th colspan="2">女（${female.length}）</th></tr></thead>
            <tbody>${female.length ? female.map(seasonPassRow).join('') : blankSpRow()}</tbody>
          </table></div>`}
    `;

    tabBody.querySelectorAll('[data-sp-attendance]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const memberId = sel.dataset.spAttendance;
        const value = sel.value;
        const existing = rosters.find((r) => r.memberId === memberId && r.sourceType === 'seasonPass');
        if (existing) {
          const updated = { ...existing, attendance: value };
          await put('sessionRosters', updated);
          rosters = rosters.map((r) => (r.id === existing.id ? updated : r));
        } else {
          const created = {
            id: uid(), sessionId, memberId, sourceType: 'seasonPass',
            attendance: value, feeAmount: 0, paymentMethod: '', createdAt: new Date().toISOString(),
          };
          await put('sessionRosters', created);
          rosters.push(created);
        }
        draw();
      });
    });
  }

  function blankSpRow() {
    return `<tr><td colspan="2" class="small text-faint" style="padding:8px;">尚無人員</td></tr>`;
  }

  function seasonPassRow({ sp, member, roster }) {
    const state = roster ? roster.attendance : '出席';
    return `
      <tr>
        <td class="roster-name">${escapeHtml(member.name)}</td>
        <td>
          <select class="inline-select" data-sp-attendance="${sp.memberId}">
            <option value="出席" ${state === '出席' ? 'selected' : ''}>出席</option>
            <option value="請假" ${state === '請假' ? 'selected' : ''}>請假</option>
          </select>
        </td>
      </tr>
    `;
  }

  function openEditSessionModal() {
    openModal({
      title: '場次設定',
      bodyHtml: `
        <div class="field-row">
          <div class="field"><label>日期</label><input type="date" id="e-date" value="${session.date}"></div>
          <div class="field"><label>時段</label><input type="text" id="e-time" value="${escapeHtml(session.timeSlot || '')}"></div>
        </div>
        <div class="field"><label>場地</label><input type="text" id="e-venue" value="${escapeHtml(session.venue || '')}"></div>
        <div class="field">
          <label>冷氣使用狀態</label>
          <div class="radio-group" id="e-ac-group">
            ${['未使用', '使用', '部分使用'].map((v) => `<label class="radio-chip ${session.acUsed === v ? 'checked' : ''}"><input type="radio" name="e-ac" value="${v}" ${session.acUsed === v ? 'checked' : ''}>${v}</label>`).join('')}
          </div>
        </div>
        <div class="field-row">
          <div class="field"><label>場地費</label><input type="number" id="e-venue-cost" value="${session.venueCost}"></div>
          <div class="field"><label>冷氣費</label><input type="number" id="e-ac-cost" value="${session.acCost}" ${session.acUsed === '未使用' ? 'disabled' : ''}></div>
        </div>
        <div class="field-row">
          <div class="field"><label>其他支出</label><input type="number" id="e-other-cost" value="${session.otherCost}"></div>
          <div class="field"><label>臨打預設收費</label><input type="number" id="e-base-fee" value="${session.baseFeePerPerson}"></div>
        </div>
        <div class="field">
          <label>場地分攤人數</label>
          <input type="number" id="e-divisor" value="${seasonPassDivisorOf(session)}">
          <div class="field-hint">用於計算季打本場次應付金額：(場地費＋冷氣費) ÷ 此人數。只影響這一場。</div>
        </div>
      `,
      onMount: (panel) => {
        panel.querySelectorAll('#e-ac-group .radio-chip').forEach((chip) => {
          chip.addEventListener('click', () => {
            panel.querySelectorAll('#e-ac-group .radio-chip').forEach((c) => c.classList.remove('checked'));
            chip.classList.add('checked');
            const val = chip.querySelector('input').value;
            const acCostInput = panel.querySelector('#e-ac-cost');
            acCostInput.disabled = val === '未使用';
            if (val === '未使用') acCostInput.value = 0;
          });
        });
      },
      actions: [
        { label: '取消', onClick: (close) => close() },
        {
          label: '儲存',
          primary: true,
          onClick: async (close, panel) => {
            const acUsed = panel.querySelector('input[name=e-ac]:checked').value;
            const updated = {
              ...session,
              date: panel.querySelector('#e-date').value,
              timeSlot: panel.querySelector('#e-time').value.trim(),
              venue: panel.querySelector('#e-venue').value.trim(),
              acUsed,
              venueCost: Number(panel.querySelector('#e-venue-cost').value) || 0,
              acCost: acUsed === '未使用' ? 0 : (Number(panel.querySelector('#e-ac-cost').value) || 0),
              otherCost: Number(panel.querySelector('#e-other-cost').value) || 0,
              baseFeePerPerson: Number(panel.querySelector('#e-base-fee').value) || 0,
              seasonPassDivisor: Number(panel.querySelector('#e-divisor').value) || SESSION_DEFAULTS.seasonPassDivisor,
            };
            await put('sessions', updated);
            session = updated;
            close();
            draw();
            toast('已更新場次設定');
          },
        },
      ],
    });
  }

  draw();
}
