import { getAll, put, putMany, remove } from '../db.js';
import { uid, toast, openModal, confirmDialog, escapeHtml, parseNamesInput, backButtonHtml, attachBackButton, EDIT_ICON_SVG } from '../utils.js';

const SEARCH_ICON_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

export async function renderMembers(root) {
  let members = (await getAll('members')).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  let query = '';
  let searchOpen = false;

  function matchQuery(m) {
    if (!query) return true;
    return m.name.includes(query) || (m.note || '').includes(query);
  }

  function draw() {
    const filtered = members.filter(matchQuery);
    const male = filtered.filter((m) => m.gender === '男');
    const female = filtered.filter((m) => m.gender === '女');
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
      if (!searchOpen) query = '';
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
        draw();
        const v = root.querySelector('#search-input');
        v.focus();
        v.selectionStart = v.selectionEnd = v.value.length;
      });
    }

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
    return `
      <div class="list-row">
        <div class="list-row-main">
          <div class="list-row-title">${escapeHtml(m.name)}</div>
          ${m.note ? `<div class="list-row-meta">${escapeHtml(m.note)}</div>` : ''}
        </div>
        <div class="list-row-actions">
          <button class="icon-btn" data-edit="${m.id}" aria-label="編輯">${EDIT_ICON_SVG}</button>
          <button class="icon-btn" data-delete="${m.id}" aria-label="刪除">✕</button>
        </div>
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
            const newMembers = names.map((name) => ({
              id: uid(), name, gender, note, isActive: true, createdAt: new Date().toISOString(),
            }));
            await putMany('members', newMembers);
            members.push(...newMembers);
            members.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
            close();
            draw();
            toast(names.length > 1 ? `已新增 ${names.length} 位人員` : '已新增人員');
          },
        },
      ],
    });
  }

  draw();
}
