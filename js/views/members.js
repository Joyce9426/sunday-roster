import { getAll, put, putMany, remove } from '../db.js';
import { navigate } from '../router.js';
import { toast, openModal, confirmDialog, escapeHtml, parseNamesInput, backButtonHtml, attachBackButton, EDIT_ICON_SVG, resolveMembersByNames, fmtDateOnly } from '../utils.js';

const STAR_ICON_SVG = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 2.5l2.9 6.6 7.1.6-5.4 4.7 1.7 6.9L12 17.6l-6.3 3.7 1.7-6.9-5.4-4.7 7.1-.6z" fill="currentColor"/></svg>';
const STAR_OUTLINE_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2.5l2.9 6.6 7.1.6-5.4 4.7 1.7 6.9L12 17.6l-6.3 3.7 1.7-6.9-5.4-4.7 7.1-.6z"/></svg>';

const SEARCH_ICON_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const CHEVRON_DOWN_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEVRON_RIGHT_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export async function renderMembers(root) {
  let members = (await getAll('members')).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  let query = '';
  let searchOpen = false;
  let expandedMemberId = null;

  // Point: 搜尋時要能同時列出每位成員出現過的場次（含候補），因此把
  // sessions / seasons / sessionRosters 一次讀進來，用 memberId 分組，
  // 之後展開某個人時直接查表即可，不用每次都重新掃描整個資料庫。
  const [allSessions, allSeasons, allRosters] = await Promise.all([
    getAll('sessions'),
    getAll('seasons'),
    getAll('sessionRosters'),
  ]);
  const sessionsById = Object.fromEntries(allSessions.map((s) => [s.id, s]));
  const seasonsById = Object.fromEntries(allSeasons.map((s) => [s.id, s]));
  const rostersByMemberId = allRosters.reduce((acc, r) => {
    (acc[r.memberId] ||= []).push(r);
    return acc;
  }, {});

  function sessionHistoryFor(memberId) {
    const rows = rostersByMemberId[memberId] || [];
    return rows
      .map((r) => ({ roster: r, session: sessionsById[r.sessionId] }))
      .filter((x) => x.session)
      .map((x) => ({
        sessionId: x.session.id,
        date: x.session.date,
        seasonName: seasonsById[x.session.seasonId]?.name || '',
        isWaitlist: x.roster.sourceType === 'waitlist',
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function matchQuery(m) {
    if (!query) return true;
    return m.name.includes(query) || (m.note || '').includes(query);
  }

  function draw() {
    // Point 2: 常用 (favorite) members sort first within each group.
    const byFavoriteThenName = (a, b) => (Boolean(b.isFavorite) - Boolean(a.isFavorite)) || a.name.localeCompare(b.name, 'zh-Hant');
    const filtered = members.filter(matchQuery);
    const male = filtered.filter((m) => m.gender === '男').sort(byFavoriteThenName);
    const female = filtered.filter((m) => m.gender === '女').sort(byFavoriteThenName);
    // Safety net: a member whose gender is missing/invalid (undefined, '', a
    // typo, etc.) used to match neither group above and simply vanish from
    // this page — invisible even to search, with no way to find or delete it
    // through the UI. Anyone who doesn't cleanly match 男/女 now shows up
    // here instead, so nothing can silently disappear.
    const other = filtered.filter((m) => m.gender !== '男' && m.gender !== '女');

    root.innerHTML = `
      <div class="page-head page-head-sticky flex-wrap-head">
        <div class="page-head-left">
          ${backButtonHtml()}
          <div style="min-width:0;">
            <h1 class="h1-nowrap">人員名單</h1>
            <div class="sub">共 ${members.length} 人（男 ${members.filter(m=>m.gender==='男').length}・女 ${members.filter(m=>m.gender==='女').length}）</div>
          </div>
        </div>
        <div class="flex gap-8">
          <button class="icon-action-btn" id="toggle-search-btn" aria-label="搜尋">${SEARCH_ICON_SVG}</button>
          <button class="btn btn-primary btn-sm" id="add-member-btn">＋ 新增</button>
        </div>
        ${searchOpen ? `
          <div style="width:100%;margin-top:8px;">
            <input type="text" placeholder="搜尋姓名或備註…" id="search-input" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 10px;box-sizing:border-box;">
          </div>
        ` : ''}
      </div>

      <div class="card">
        <div class="card-title">男（${male.length}）</div>
        ${male.length ? male.map(memberRow).join('') : '<div class="small text-faint">尚無資料</div>'}
      </div>
      <div class="card">
        <div class="card-title">女（${female.length}）</div>
        ${female.length ? female.map(memberRow).join('') : '<div class="small text-faint">尚無資料</div>'}
      </div>
      ${other.length ? `
        <div class="card">
          <div class="card-title">其他（${other.length}）</div>
          ${other.map(memberRow).join('')}
        </div>
      ` : ''}
      ${filtered.length === 0 ? `<div class="empty-state"><div class="glyph">◍</div><p>找不到符合的人員</p></div>` : ''}
    `;

    attachBackButton(root);
    root.querySelector('#add-member-btn').addEventListener('click', () => openMemberModal());
    root.querySelector('#toggle-search-btn').addEventListener('click', () => {
      searchOpen = !searchOpen;
      if (!searchOpen) { query = ''; expandedMemberId = null; }
      draw();
      if (searchOpen) root.querySelector('#search-input')?.focus();
    });
    const searchInput = root.querySelector('#search-input');
    if (searchInput) {
      searchInput.value = query;
      searchInput.focus();
      searchInput.selectionStart = searchInput.selectionEnd = searchInput.value.length;
      searchInput.addEventListener('input', (e) => {
        query = e.target.value.trim();
        expandedMemberId = null;
        draw();
        const v = root.querySelector('#search-input');
        v.focus();
        v.selectionStart = v.selectionEnd = v.value.length;
      });
    }

    root.querySelectorAll('[data-toggle-history]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.toggleHistory;
        expandedMemberId = expandedMemberId === id ? null : id;
        draw();
      });
    });
    root.querySelectorAll('[data-goto-session]').forEach((el) => {
      el.addEventListener('click', () => navigate(`/sessions/${el.dataset.gotoSession}`));
    });

    root.querySelectorAll('[data-toggle-favorite]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const m = members.find((x) => x.id === btn.dataset.toggleFavorite);
        const updated = { ...m, isFavorite: !m.isFavorite };
        await put('members', updated);
        members = members.map((x) => (x.id === m.id ? updated : x));
        draw();
      });
    });
    root.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = members.find((x) => x.id === btn.dataset.edit);
        openMemberModal(m);
      });
    });
    root.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = members.find((x) => x.id === btn.dataset.delete);
        confirmDialog(`確定要刪除「${escapeHtml(m.name)}」嗎？此動作無法復原。`, async () => {
          await remove('members', m.id);
          members = members.filter((x) => x.id !== m.id);
          draw();
          toast('已刪除人員');
        });
      });
    });
  }

  function memberRow(m) {
    // Point: 只有在搜尋開啟且有輸入文字時才顯示「出現過幾場」與展開場次紀錄，
    // 避免平常瀏覽整份名單時每一列都多長一截。
    const showHistoryToggle = searchOpen && query;
    const history = showHistoryToggle ? sessionHistoryFor(m.id) : [];
    const waitlistCount = history.filter((h) => h.isWaitlist).length;
    const isExpanded = expandedMemberId === m.id;

    return `
      <div class="list-row" style="flex-wrap:wrap;">
        <div class="list-row-main">
          <div class="list-row-title">${escapeHtml(m.name)}</div>
          ${m.note ? `<div class="list-row-meta">${escapeHtml(m.note)}</div>` : ''}
          ${showHistoryToggle ? `
            <button class="link-btn" data-toggle-history="${m.id}" style="border:none;background:none;padding:0;margin-top:2px;font-size:.85rem;color:var(--court-blue);display:inline-flex;align-items:center;gap:4px;cursor:pointer;">
              ${isExpanded ? CHEVRON_DOWN_SVG : CHEVRON_RIGHT_SVG}
              出現過 ${history.length} 場${waitlistCount ? `（含候補 ${waitlistCount} 場）` : ''}
            </button>
          ` : ''}
        </div>
        <div class="list-row-actions">
          <button class="icon-btn ${m.isFavorite ? 'icon-btn-active' : ''}" data-toggle-favorite="${m.id}" aria-label="常用">${m.isFavorite ? STAR_ICON_SVG : STAR_OUTLINE_SVG}</button>
          <button class="icon-btn" data-edit="${m.id}" aria-label="編輯">${EDIT_ICON_SVG}</button>
          <button class="icon-btn" data-delete="${m.id}" aria-label="刪除">✕</button>
        </div>
        ${showHistoryToggle && isExpanded ? `
          <div style="width:100%;margin-top:8px;border-top:1px solid var(--line);padding-top:8px;">
            ${history.length ? history.map((h) => `
              <div class="list-row" data-goto-session="${h.sessionId}" style="cursor:pointer;padding:6px 0;">
                <div class="list-row-main">
                  <div class="list-row-title" style="font-size:.9rem;display:flex;align-items:center;gap:6px;">
                    ${fmtDateOnly(h.date)}
                    ${h.isWaitlist ? `<span class="badge" style="font-size:.72rem;padding:1px 7px;border-radius:20px;background:var(--gold-tint);color:var(--gold);">候補</span>` : ''}
                  </div>
                  ${h.seasonName ? `<div class="list-row-meta">${escapeHtml(h.seasonName)}</div>` : ''}
                </div>
              </div>
            `).join('') : `<div class="small text-faint">尚無場次紀錄</div>`}
          </div>
        ` : ''}
      </div>
    `;
  }

  function openMemberModal(existing) {
    const isEdit = !!existing;
    openModal({
      title: isEdit ? '編輯人員' : '新增人員',
      bodyHtml: `
        <div class="field">
          <label>${isEdit ? '姓名' : '手動輸入'}</label>
          <input type="text" id="m-name" value="${isEdit ? escapeHtml(existing.name) : ''}">
        </div>
        <div class="field">
          <label>性別</label>
          <div class="radio-group" id="m-gender-group">
            <label class="radio-chip ${(!isEdit || existing.gender === '男') ? 'checked' : ''}">
              <input type="radio" name="m-gender" value="男" ${(!isEdit || existing.gender === '男') ? 'checked' : ''}> 男
            </label>
            <label class="radio-chip ${isEdit && existing.gender === '女' ? 'checked' : ''}">
              <input type="radio" name="m-gender" value="女" ${isEdit && existing.gender === '女' ? 'checked' : ''}> 女
            </label>
          </div>
        </div>
        <div class="field">
          <label>備註（選填）</label>
          <input type="text" id="m-note" value="${isEdit ? escapeHtml(existing.note || '') : ''}" placeholder="聯絡方式等">
        </div>
      `,
      onMount: (panel) => {
        panel.querySelectorAll('#m-gender-group .radio-chip').forEach((chip) => {
          chip.addEventListener('click', () => {
            panel.querySelectorAll('#m-gender-group .radio-chip').forEach((c) => c.classList.remove('checked'));
            chip.classList.add('checked');
          });
        });
        panel.querySelector('#m-name').focus();
      },
      actions: [
        { label: '取消', onClick: (close) => close() },
        {
          label: isEdit ? '儲存' : '新增',
          primary: true,
          onClick: async (close, panel) => {
            const rawName = panel.querySelector('#m-name').value.trim();
            if (!rawName) { toast('請輸入姓名'); return; }
            const gender = panel.querySelector('input[name=m-gender]:checked').value;
            const note = panel.querySelector('#m-note').value.trim();

            if (isEdit) {
              const obj = { ...existing, name: rawName, gender, note };
              await put('members', obj);
              members = members.map((x) => (x.id === obj.id ? obj : x));
              members.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
              close();
              draw();
              toast('已更新人員');
              return;
            }

            const names = parseNamesInput(rawName);
            if (names.length === 0) { toast('請輸入姓名'); return; }
            const { newMembers: created, resolvedIds } = resolveMembersByNames(names, gender, members);
            const newMembers = created.map((nm) => ({ ...nm, note }));
            if (newMembers.length) await putMany('members', newMembers);
            members.push(...newMembers);
            members.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
            close();
            draw();
            const reusedCount = resolvedIds.length - newMembers.length;
            toast(reusedCount > 0
              ? `已新增 ${newMembers.length} 位、沿用 ${reusedCount} 位既有人員`
              : (names.length > 1 ? `已新增 ${names.length} 位人員` : '已新增人員'));
          },
        },
      ],
    });
  }

  draw();
}
