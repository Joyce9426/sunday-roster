import { getById, getByIndex, getAll, put, remove, putMany } from '../db.js';
import { getSettings } from '../db.js';
import {
  uid, toast, openModal, confirmDialog, escapeHtml, fmtDate, fmtMoney,
  backButtonHtml, attachBackButton, todayStr, isSessionUpcoming, settlementResultHtml,
} from '../utils.js';
import { navigate } from '../router.js';
import { computeSessionStats, computeSeasonStats, computeSeasonPassSettlement } from '../calc.js';
import { sessionSectionsHtml, openAddSessionModal } from '../sessionShared.js';

export async function renderSeasonDetail(root, seasonId) {
  const season = await getById('seasons', seasonId);
  if (!season) { navigate('/seasons'); return; }

  const members = await getAll('members');
  const membersById = Object.fromEntries(members.map((m) => [m.id, m]));
  const settings = await getSettings();

  let sessions = (await getByIndex('sessions', 'seasonId', seasonId)).sort((a, b) => a.date.localeCompare(b.date));
  let seasonPasses = (await getByIndex('seasonPasses', 'seasonId', seasonId));
  let allRosters = [];
  for (const s of sessions) {
    const r = await getByIndex('sessionRosters', 'sessionId', s.id);
    allRosters.push(...r);
  }

  let activeTab = 'passes';
  let selectedPassIds = new Set();

  function rostersFor(sessionId) { return allRosters.filter((r) => r.sessionId === sessionId); }

  // rosterRowsBySessionId for one member (only their seasonPass-sourced rows)
  function memberRosterMap(memberId) {
    const map = {};
    allRosters.forEach((r) => {
      if (r.memberId === memberId && r.sourceType === 'seasonPass') map[r.sessionId] = r;
    });
    return map;
  }

  function buildSettlements() {
    return seasonPasses.map((sp) => {
      const settlement = computeSeasonPassSettlement(sp, sessions, memberRosterMap(sp.memberId));
      return { seasonPass: sp, settlement };
    });
  }

  function buildSessionStats() {
    const out = {};
    sessions.forEach((s) => { out[s.id] = computeSessionStats(s, rostersFor(s.id)); });
    return out;
  }

  function draw() {
    const sessionStatsById = buildSessionStats();
    const settlements = buildSettlements();
    const seasonPassesWithSettlement = settlements.map((x) => ({ ...x.seasonPass, settlement: x.settlement }));
    const seasonStats = computeSeasonStats(sessions, sessionStatsById, seasonPassesWithSettlement);

    root.innerHTML = `
      <div class="page-head">
        <div class="page-head-left">
          ${backButtonHtml()}
          <div>
            <h1>${escapeHtml(season.name)}</h1>
            <div class="sub">${fmtDate(season.startDate)} － ${fmtDate(season.endDate)}　・　共 ${sessions.length} 場</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" id="edit-season-btn">季度設定</button>
      </div>

      <div class="scoreboard">
        <div class="scoreboard-label">季度總覽・已收 / 應收</div>
        <div class="scoreboard-grid">
          <div class="scoreboard-cell"><div class="num mono">$${fmtMoney(seasonStats.received)}</div><div class="cap">已收金額</div></div>
          <div class="scoreboard-cell"><div class="num mono">$${fmtMoney(seasonStats.receivable)}</div><div class="cap">應收金額</div></div>
          <div class="scoreboard-cell"><div class="num mono">$${fmtMoney(seasonStats.expense)}</div><div class="cap">總支出</div></div>
          <div class="scoreboard-cell"><div class="num mono">$${fmtMoney(seasonStats.receivedSurplus)}</div><div class="cap">已收盈餘</div></div>
          <div class="scoreboard-cell"><div class="num mono">$${fmtMoney(seasonStats.receivableSurplus)}</div><div class="cap">應收盈餘</div></div>
          <div class="scoreboard-cell warn"><div class="num mono">$${fmtMoney(seasonStats.refundTotal)}</div><div class="cap">季打退款總額</div></div>
        </div>
      </div>

      <div class="subtabs">
        <button data-tab="passes" class="${activeTab === 'passes' ? 'active' : ''}">季打名單</button>
        <button data-tab="sessions" class="${activeTab === 'sessions' ? 'active' : ''}">場次管理</button>
        <button data-tab="stats" class="${activeTab === 'stats' ? 'active' : ''}">統計與退款結算</button>
      </div>

      <div id="tab-body"></div>
    `;

    attachBackButton(root);
    root.querySelector('#edit-season-btn').addEventListener('click', () => openEditSeasonModal());
    root.querySelectorAll('.subtabs button').forEach((btn) => {
      btn.addEventListener('click', () => { activeTab = btn.dataset.tab; draw(); });
    });

    const tabBody = root.querySelector('#tab-body');
    if (activeTab === 'passes') drawPassesTab(tabBody);
    else if (activeTab === 'sessions') drawSessionsTab(tabBody);
    else drawStatsTab(tabBody, settlements, seasonStats);
  }

  // ---------------- 場次管理 tab ----------------
  function drawSessionsTab(tabBody) {
    tabBody.innerHTML = `
      <div class="flex-between mt-8" style="margin-bottom:10px;">
        <div class="small text-soft">共 ${sessions.length} 場</div>
        <button class="btn btn-primary btn-sm" id="add-session-btn">＋ 新增場次</button>
      </div>
      ${sessionSectionsHtml(sessions, rostersFor)}
    `;
    tabBody.querySelector('#add-session-btn').addEventListener('click', () => {
      const lastSession = sessions[sessions.length - 1];
      openAddSessionModal({
        ongoingSeasons: [season],
        defaultSeasonId: season.id,
        showSeasonSelect: false,
        lastSession,
        onCreated: async (session, rosterRows) => {
          sessions.push(session);
          sessions.sort((a, b) => a.date.localeCompare(b.date));
          allRosters.push(...rosterRows);
          draw();
        },
      });
    });
    tabBody.querySelectorAll('[data-open-session]').forEach((el) => {
      el.addEventListener('click', () => navigate(`/sessions/${el.dataset.openSession}`));
    });
    tabBody.querySelectorAll('[data-delete-session]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const s = sessions.find((x) => x.id === btn.dataset.deleteSession);
        confirmDialog(`確定要刪除 ${fmtDate(s.date)} 這場場次嗎？名單與紀錄將一併刪除。`, async () => {
          const rosters = rostersFor(s.id);
          await Promise.all(rosters.map((r) => remove('sessionRosters', r.id)));
          await remove('sessions', s.id);
          sessions = sessions.filter((x) => x.id !== s.id);
          allRosters = allRosters.filter((r) => r.sessionId !== s.id);
          draw();
        });
      });
    });
  }

  // ---------------- 季打名單 tab ----------------
  function drawPassesTab(tabBody) {
    const rows = seasonPasses
      .map((sp) => ({ sp, member: membersById[sp.memberId] }))
      .filter((x) => x.member)
      .sort((a, b) => a.member.name.localeCompare(b.member.name, 'zh-Hant'));

    tabBody.innerHTML = `
      <div class="flex-between mt-8" style="margin-bottom:10px;">
        <div class="small text-soft">共 ${rows.length} 位季打</div>
        <button class="btn btn-primary btn-sm" id="add-pass-btn">＋ 加入季打</button>
      </div>
      ${selectedPassIds.size ? `
        <div class="batch-bar">
          已選取 <strong>${selectedPassIds.size}</strong> 位
          <button class="btn btn-sm" id="batch-payment-btn">批量設定繳費狀態／方式</button>
          <button class="btn btn-sm" id="clear-select-btn">取消選取</button>
        </div>
      ` : ''}
      ${rows.length === 0 ? `
        <div class="empty-state"><div class="glyph">◍</div><p>本季尚未設定季打名單</p></div>
      ` : `<div class="card"><table class="roster"><thead><tr>
            <th style="width:28px;"><input type="checkbox" id="select-all-passes"></th>
            <th>姓名</th><th>預收金額</th><th>繳費狀態</th><th>方式</th><th></th>
          </tr></thead><tbody>
            ${rows.map(passRow).join('')}
          </tbody></table></div>`}
    `;

    tabBody.querySelector('#add-pass-btn').addEventListener('click', () => openAddPassModal());
    const selectAll = tabBody.querySelector('#select-all-passes');
    if (selectAll) {
      selectAll.checked = rows.length > 0 && selectedPassIds.size === rows.length;
      selectAll.addEventListener('change', () => {
        if (selectAll.checked) rows.forEach((r) => selectedPassIds.add(r.sp.id));
        else selectedPassIds.clear();
        drawPassesTab(tabBody);
      });
    }
    tabBody.querySelectorAll('[data-select-pass]').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) selectedPassIds.add(cb.dataset.selectPass);
        else selectedPassIds.delete(cb.dataset.selectPass);
        drawPassesTab(tabBody);
      });
    });
    const clearBtn = tabBody.querySelector('#clear-select-btn');
    if (clearBtn) clearBtn.addEventListener('click', () => { selectedPassIds.clear(); drawPassesTab(tabBody); });
    const batchBtn = tabBody.querySelector('#batch-payment-btn');
    if (batchBtn) batchBtn.addEventListener('click', () => openBatchPassPaymentModal(tabBody));

    tabBody.querySelectorAll('[data-open-member]').forEach((el) => {
      el.addEventListener('click', () => {
        const sp = seasonPasses.find((x) => x.id === el.dataset.openMember);
        openMemberAttendanceModal(sp);
      });
    });
    tabBody.querySelectorAll('[data-edit-pass]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sp = seasonPasses.find((x) => x.id === btn.dataset.editPass);
        openEditPassModal(sp);
      });
    });
    tabBody.querySelectorAll('[data-remove-pass]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sp = seasonPasses.find((x) => x.id === btn.dataset.removePass);
        const m = membersById[sp.memberId];
        confirmDialog(`確定要將「${escapeHtml(m?.name || '')}」移出本季季打名單嗎？已建立場次的歷史名單不會被回溯修改。`, async () => {
          await remove('seasonPasses', sp.id);
          seasonPasses = seasonPasses.filter((x) => x.id !== sp.id);
          selectedPassIds.delete(sp.id);
          drawPassesTab(tabBody);
          toast('已移出季打名單');
        });
      });
    });
  }

  function passRow({ sp, member }) {
    return `
      <tr>
        <td><input type="checkbox" data-select-pass="${sp.id}" ${selectedPassIds.has(sp.id) ? 'checked' : ''}></td>
        <td class="roster-name" data-open-member="${sp.id}" style="cursor:pointer;">${escapeHtml(member.name)}<span class="gender-tag">${member.gender}</span></td>
        <td class="mono">$${fmtMoney(sp.prepaidAmount)}</td>
        <td>${sp.paymentStatus === '已繳' ? '<span class="badge badge-green">已繳</span>' : '<span class="badge badge-gray">未繳</span>'}</td>
        <td class="small text-soft">${sp.paymentMethod || '－'}</td>
        <td class="text-right">
          <button class="icon-btn" data-edit-pass="${sp.id}" aria-label="編輯">✎</button>
          <button class="icon-btn" data-remove-pass="${sp.id}" aria-label="移出">✕</button>
        </td>
      </tr>
    `;
  }

  // Point 9: multi-select add. Point 10: auto-add newly joined members (出席) to every
  // session in this season that hasn't happened yet (date >= today) — history is untouched.
  function openAddPassModal() {
    const existingMemberIds = new Set(seasonPasses.map((sp) => sp.memberId));
    const candidates = members.filter((m) => !existingMemberIds.has(m.id)).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));

    openModal({
      title: '加入季打名單',
      bodyHtml: `
        <div class="field">
          <label>選擇人員（可多選）</label>
          <div class="stack" id="candidate-list" style="max-height:240px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;padding:8px;">
            ${candidates.length === 0 ? '<div class="small text-faint">沒有可加入的人員了</div>' : candidates.map((m) => `
              <label style="display:flex;align-items:center;gap:8px;padding:4px 2px;">
                <input type="checkbox" value="${m.id}" class="candidate-checkbox">
                <span>${escapeHtml(m.name)}<span class="gender-tag">${m.gender}</span></span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="field">
          <label>找不到人？直接新增一位</label>
          <div class="field-row">
            <input type="text" id="new-member-name" placeholder="姓名" style="flex:2;">
            <div class="radio-group" id="new-gender-group" style="flex:1;">
              <label class="radio-chip checked"><input type="radio" name="new-gender" value="男" checked>男</label>
              <label class="radio-chip"><input type="radio" name="new-gender" value="女">女</label>
            </div>
          </div>
        </div>
        <div class="field">
          <label>本季預收金額（每人）</label>
          <input type="number" id="pass-prepaid" value="${season.seasonPassFee || 0}">
          <div class="field-hint">預設帶入季度設定中的整季預收金額，套用於本次選取的所有人。</div>
        </div>
      `,
      onMount: (panel) => {
        panel.querySelectorAll('#new-gender-group .radio-chip').forEach((chip) => {
          chip.addEventListener('click', () => {
            panel.querySelectorAll('#new-gender-group .radio-chip').forEach((c) => c.classList.remove('checked'));
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
            const prepaidAmount = Number(panel.querySelector('#pass-prepaid').value) || 0;
            const memberIds = [...panel.querySelectorAll('.candidate-checkbox:checked')].map((cb) => cb.value);
            const newName = panel.querySelector('#new-member-name').value.trim();
            if (newName) {
              const gender = panel.querySelector('input[name=new-gender]:checked').value;
              const newMember = { id: uid(), name: newName, gender, note: '', isActive: true, createdAt: new Date().toISOString() };
              await put('members', newMember);
              members.push(newMember);
              membersById[newMember.id] = newMember;
              memberIds.push(newMember.id);
            }
            if (memberIds.length === 0) { toast('請至少選擇一位人員'); return; }

            const today = todayStr();
            const upcomingSessions = sessions.filter((s) => isSessionUpcoming(s, today));
            const newPasses = [];
            const newRosterRows = [];
            for (const memberId of memberIds) {
              const sp = {
                id: uid(), seasonId, memberId,
                joinedFromSessionDate: today,
                prepaidAmount,
                paymentStatus: '未繳',
                paymentMethod: '',
                createdAt: new Date().toISOString(),
              };
              newPasses.push(sp);
              upcomingSessions.forEach((s) => {
                newRosterRows.push({
                  id: uid(), sessionId: s.id, memberId, sourceType: 'seasonPass',
                  attendance: '出席', feeAmount: 0, paymentMethod: '', createdAt: new Date().toISOString(),
                });
              });
            }
            await putMany('seasonPasses', newPasses);
            if (newRosterRows.length) await putMany('sessionRosters', newRosterRows);
            seasonPasses.push(...newPasses);
            allRosters.push(...newRosterRows);
            close();
            draw();
            toast(`已加入 ${newPasses.length} 位季打，並自動加入 ${upcomingSessions.length} 場尚未開打的場次`);
          },
        },
      ],
    });
  }

  function openEditPassModal(sp) {
    const member = membersById[sp.memberId];
    openModal({
      title: `編輯季打・${escapeHtml(member?.name || '')}`,
      bodyHtml: `
        <div class="field"><label>本季預收金額</label><input type="number" id="edit-prepaid" value="${sp.prepaidAmount}"></div>
        <div class="field">
          <label>繳費狀態</label>
          <div class="radio-group" id="edit-status-group">
            <label class="radio-chip ${sp.paymentStatus === '已繳' ? 'checked' : ''}"><input type="radio" name="edit-status" value="已繳" ${sp.paymentStatus === '已繳' ? 'checked' : ''}>已繳</label>
            <label class="radio-chip ${sp.paymentStatus !== '已繳' ? 'checked' : ''}"><input type="radio" name="edit-status" value="未繳" ${sp.paymentStatus !== '已繳' ? 'checked' : ''}>未繳</label>
          </div>
        </div>
        <div class="field">
          <label>繳費方式</label>
          <select id="edit-method" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 10px;">
            <option value="">－ 未指定 －</option>
            ${settings.paymentMethods.map((m) => `<option value="${m}" ${sp.paymentMethod === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
      `,
      onMount: (panel) => {
        panel.querySelectorAll('#edit-status-group .radio-chip').forEach((chip) => {
          chip.addEventListener('click', () => {
            panel.querySelectorAll('#edit-status-group .radio-chip').forEach((c) => c.classList.remove('checked'));
            chip.classList.add('checked');
          });
        });
      },
      actions: [
        { label: '取消', onClick: (close) => close() },
        {
          label: '儲存',
          primary: true,
          onClick: async (close, panel) => {
            const updated = {
              ...sp,
              prepaidAmount: Number(panel.querySelector('#edit-prepaid').value) || 0,
              paymentStatus: panel.querySelector('input[name=edit-status]:checked').value,
              paymentMethod: panel.querySelector('#edit-method').value,
            };
            await put('seasonPasses', updated);
            seasonPasses = seasonPasses.map((x) => (x.id === sp.id ? updated : x));
            close();
            draw();
            toast('已更新');
          },
        },
      ],
    });
  }

  function openBatchPassPaymentModal(tabBody) {
    openModal({
      title: `批量設定繳費（${selectedPassIds.size} 位）`,
      bodyHtml: `
        <div class="field">
          <label>繳費狀態</label>
          <div class="radio-group" id="batch-status-group">
            <label class="radio-chip checked"><input type="radio" name="batch-status" value="已繳" checked>已繳</label>
            <label class="radio-chip"><input type="radio" name="batch-status" value="未繳">未繳</label>
          </div>
        </div>
        <div class="field">
          <label>繳費方式</label>
          <select id="batch-method" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 10px;">
            <option value="">－ 不變更 －</option>
            ${settings.paymentMethods.map((m) => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
      `,
      onMount: (panel) => {
        panel.querySelectorAll('#batch-status-group .radio-chip').forEach((chip) => {
          chip.addEventListener('click', () => {
            panel.querySelectorAll('#batch-status-group .radio-chip').forEach((c) => c.classList.remove('checked'));
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
            const status = panel.querySelector('input[name=batch-status]:checked').value;
            const method = panel.querySelector('#batch-method').value;
            const updates = seasonPasses
              .filter((sp) => selectedPassIds.has(sp.id))
              .map((sp) => ({ ...sp, paymentStatus: status, ...(method ? { paymentMethod: method } : {}) }));
            await putMany('seasonPasses', updates);
            seasonPasses = seasonPasses.map((sp) => updates.find((u) => u.id === sp.id) || sp);
            selectedPassIds.clear();
            close();
            draw();
            toast('已批量更新繳費狀態');
          },
        },
      ],
    });
  }

  // Point 12/15 — click a season-pass member's name: see attendance across every session,
  // total leave count, batch-adjust multiple sessions at once (syncs straight back into that
  // session's own 季打管理 state), all changes save immediately.
  function openMemberAttendanceModal(sp) {
    const member = membersById[sp.memberId];
    let selectedSessionIds = new Set();

    function currentSettlement() {
      return computeSeasonPassSettlement(sp, sessions, memberRosterMap(sp.memberId));
    }

    function bodyHtml() {
      const settlement = currentSettlement();
      const leaveCount = settlement.rows.filter((r) => r.attendance === '請假').length;
      return `
        <div class="small text-soft" style="margin-bottom:8px;">共 ${sessions.length} 場・請假 ${leaveCount} 場</div>
        ${selectedSessionIds.size ? `
          <div class="batch-bar" style="margin-bottom:8px;">
            已選取 <strong>${selectedSessionIds.size}</strong> 場
            <button class="btn btn-sm" data-batch-attendance="出席">設為出席</button>
            <button class="btn btn-sm" data-batch-attendance="請假">設為請假</button>
            <button class="btn btn-sm" id="modal-clear-select">取消選取</button>
          </div>
        ` : ''}
        <div class="stack">
          <label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="modal-select-all"><span class="small text-soft">全選</span></label>
          ${settlement.rows.map((r) => `
            <div class="flex-between">
              <label style="display:flex;align-items:center;gap:8px;">
                <input type="checkbox" class="modal-session-checkbox" value="${r.sessionId}" ${selectedSessionIds.has(r.sessionId) ? 'checked' : ''}>
                <span class="small">${fmtDate(r.date)}</span>
              </label>
              <select class="inline-select" data-attendance-session="${r.sessionId}">
                <option value="出席" ${r.attendance === '出席' ? 'selected' : ''}>出席</option>
                <option value="請假" ${r.attendance === '請假' ? 'selected' : ''}>請假</option>
              </select>
            </div>
          `).join('')}
        </div>
        <div class="divider"></div>
        <div class="flex-between small">
          <span class="text-soft">預收 $${fmtMoney(settlement.prepaidAmount)}　應付 $${fmtMoney(settlement.actualTotalDue)}</span>
          ${settlementResultHtml(settlement)}
        </div>
      `;
    }

    const modal = openModal({
      title: `${escapeHtml(member?.name || '')}・本季出席紀錄`,
      bodyHtml: bodyHtml(),
      actions: [{ label: '關閉', primary: true, onClick: (close) => close() }],
    });

    async function setAttendance(sessionId, value) {
      const existing = allRosters.find((r) => r.sessionId === sessionId && r.memberId === sp.memberId && r.sourceType === 'seasonPass');
      if (existing) {
        const updated = { ...existing, attendance: value };
        await put('sessionRosters', updated);
        allRosters = allRosters.map((r) => (r.id === existing.id ? updated : r));
      } else {
        const created = {
          id: uid(), sessionId, memberId: sp.memberId, sourceType: 'seasonPass',
          attendance: value, feeAmount: 0, paymentMethod: '', createdAt: new Date().toISOString(),
        };
        await put('sessionRosters', created);
        allRosters.push(created);
      }
    }

    function rerender(panel) {
      panel.querySelector('.modal-body').innerHTML = bodyHtml();
      bindEvents(panel);
      draw();
    }

    function bindEvents(panel) {
      panel.querySelectorAll('[data-attendance-session]').forEach((sel) => {
        sel.addEventListener('change', async () => {
          await setAttendance(sel.dataset.attendanceSession, sel.value);
          rerender(panel);
        });
      });
      const selectAll = panel.querySelector('#modal-select-all');
      if (selectAll) {
        selectAll.checked = sessions.length > 0 && selectedSessionIds.size === sessions.length;
        selectAll.addEventListener('change', () => {
          if (selectAll.checked) sessions.forEach((s) => selectedSessionIds.add(s.id));
          else selectedSessionIds.clear();
          rerender(panel);
        });
      }
      panel.querySelectorAll('.modal-session-checkbox').forEach((cb) => {
        cb.addEventListener('change', () => {
          if (cb.checked) selectedSessionIds.add(cb.value);
          else selectedSessionIds.delete(cb.value);
          rerender(panel);
        });
      });
      const clearBtn = panel.querySelector('#modal-clear-select');
      if (clearBtn) clearBtn.addEventListener('click', () => { selectedSessionIds.clear(); rerender(panel); });
      panel.querySelectorAll('[data-batch-attendance]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const value = btn.dataset.batchAttendance;
          for (const sessionId of selectedSessionIds) {
            await setAttendance(sessionId, value);
          }
          selectedSessionIds.clear();
          rerender(panel);
          toast(`已批量設定為${value}`);
        });
      });
    }
    bindEvents(modal.panel);
  }

  // ---------------- 統計與退款結算 tab ----------------
  function drawStatsTab(tabBody, settlements, seasonStats) {
    const methodEntries = Object.entries(seasonStats.byMethod);
    tabBody.innerHTML = `
      <div class="card">
        <div class="card-title">依繳費方式加總（已收）</div>
        ${methodEntries.length ? `
          <div class="stack">
            ${methodEntries.map(([k, v]) => `<div class="flex-between"><span>${escapeHtml(k)}</span><span class="mono">$${fmtMoney(v)}</span></div>`).join('')}
          </div>
        ` : '<div class="small text-faint">尚無已收款項</div>'}
      </div>

      <div class="card">
        <div class="card-title">季打退款 / 補收結算</div>
        <div class="small text-faint mt-8" style="margin-bottom:8px;">退費以「－」顯示，需要補繳則以「＋」標紅顯示，金額相符不顯示正負號。</div>
        ${settlements.length === 0 ? '<div class="small text-faint">本季尚無季打名單</div>' : `
          <table class="roster">
            <thead><tr><th>姓名</th><th>預收</th><th>應付總額</th><th>結果</th><th>狀態</th></tr></thead>
            <tbody>
              ${settlements.map((x) => settlementRow(x)).join('')}
            </tbody>
          </table>
        `}
      </div>
    `;

    tabBody.querySelectorAll('[data-toggle-refund]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sp = seasonPasses.find((x) => x.id === btn.dataset.toggleRefund);
        const updated = { ...sp, refundStatus: sp.refundStatus === '已結清' ? '未結清' : '已結清' };
        await put('seasonPasses', updated);
        seasonPasses = seasonPasses.map((x) => (x.id === sp.id ? updated : x));
        draw();
      });
    });
  }

  function settlementRow({ seasonPass, settlement }) {
    const member = membersById[seasonPass.memberId];
    const needsAction = settlement.isMakeup || settlement.refundAmount > 0;
    const status = seasonPass.refundStatus === '已結清' ? '已結清' : '未結清';
    return `
      <tr>
        <td class="roster-name">${escapeHtml(member?.name || '')}</td>
        <td class="mono">$${fmtMoney(settlement.prepaidAmount)}</td>
        <td class="mono">$${fmtMoney(settlement.actualTotalDue)}</td>
        <td>${settlementResultHtml(settlement)}</td>
        <td>
          ${needsAction ? `<button class="btn btn-sm ${status === '已結清' ? '' : 'btn-primary'}" data-toggle-refund="${seasonPass.id}">${status}</button>` : '<span class="small text-faint">－</span>'}
        </td>
      </tr>
    `;
  }

  function openEditSeasonModal() {
    openModal({
      title: '季度設定',
      bodyHtml: `
        <div class="field-row">
          <div class="field"><label>起始日期</label><input type="date" id="edit-start" value="${season.startDate}"></div>
          <div class="field"><label>結束日期</label><input type="date" id="edit-end" value="${season.endDate}"></div>
        </div>
        <div class="field"><label>季度名稱</label><input type="text" id="edit-name" value="${escapeHtml(season.name)}"></div>
        <div class="field"><label>預計場次數</label><input type="number" id="edit-count" value="${season.estimatedSessionCount}"></div>
        <div class="field"><label>季打整季預收金額（每人）</label><input type="number" id="edit-fee" value="${season.seasonPassFee}"></div>
      `,
      actions: [
        { label: '取消', onClick: (close) => close() },
        {
          label: '儲存',
          primary: true,
          onClick: async (close, panel) => {
            const updated = {
              ...season,
              startDate: panel.querySelector('#edit-start').value,
              endDate: panel.querySelector('#edit-end').value,
              name: panel.querySelector('#edit-name').value.trim() || season.name,
              estimatedSessionCount: Number(panel.querySelector('#edit-count').value) || 0,
              seasonPassFee: Number(panel.querySelector('#edit-fee').value) || 0,
            };
            await put('seasons', updated);
            Object.assign(season, updated);
            close();
            draw();
            toast('已更新季度設定');
          },
        },
      ],
    });
  }

  draw();
}
