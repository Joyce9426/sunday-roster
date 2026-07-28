import { getAll, put, remove } from '../db.js';
import { uid, toast, openModal, confirmDialog, escapeHtml, backButtonHtml, attachBackButton } from '../utils.js';

export async function renderMembers(root) {
  let members = (await getAll('members')).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  let query = '';

  function matchQuery(m) {
    if (!query) return true;
    return m.name.includes(query) || (m.note || '').includes(query);
  }

  function draw() {
    const filtered = members.filter(matchQuery);
    const male = filtered.filter((m) => m.gender === '男');
    const female = filtered.filter((m) => m.gender === '女');

    root.innerHTML = `
      <div class="page-head">
        <div class="page-head-left">
          ${backButtonHtml()}
          <div>
            <h1>人員總表</h1>
            <div class="sub">共 ${members.length} 人（男 ${members.filter(m=>m.gender==='男').length}・女 ${members.filter(m=>m.gender==='女').length}）</div>
          </div>
        </div>
        <button class="btn btn-primary" id="add-member-btn">＋ 新增人員</button>
      </div>

      <div class="card">
        <input type="text" placeholder="搜尋姓名或備註…" id="search-input" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 10px;font-size:.9rem;">
      </div>

      <div class="card">
        <div class="card-title">男（${male.length}）</div>
        ${male.length ? male.map(memberRow).join('') : '<div class="small text-faint">尚無資料</div>'}
      </div>
      <div class="card">
        <div class="card-title">女（${female.length}）</div>
        ${female.length ? female.map(memberRow).join('') : '<div class="small text-faint">尚無資料</div>'}
      </div>
      ${filtered.length === 0 ? `<div class="empty-state"><div class="glyph">◍</div><p>找不到符合的人員</p></div>` : ''}
    `;

    root.querySelector('#add-member-btn').addEventListener('click', () => openMemberModal());
    attachBackButton(root);
    root.querySelector('#search-input').value = query;
    root.querySelector('#search-input').addEventListener('input', (e) => {
      query = e.target.value.trim();
      draw();
      root.querySelector('#search-input').focus();
      const v = root.querySelector('#search-input');
      v.selectionStart = v.selectionEnd = v.value.length;
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
    return `
      <div class="list-row">
        <div class="list-row-main">
          <div class="list-row-title">${escapeHtml(m.name)}</div>
          ${m.note ? `<div class="list-row-meta">${escapeHtml(m.note)}</div>` : ''}
        </div>
        <div class="list-row-actions">
          <button class="icon-btn" data-edit="${m.id}" aria-label="編輯">✎</button>
          <button class="icon-btn" data-delete="${m.id}" aria-label="刪除">🗑</button>
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
          <label>姓名</label>
          <input type="text" id="m-name" value="${isEdit ? escapeHtml(existing.name) : ''}" placeholder="例：王小明">
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
            const name = panel.querySelector('#m-name').value.trim();
            if (!name) { toast('請輸入姓名'); return; }
            const gender = panel.querySelector('input[name=m-gender]:checked').value;
            const note = panel.querySelector('#m-note').value.trim();
            const obj = existing
              ? { ...existing, name, gender, note }
              : { id: uid(), name, gender, note, isActive: true, createdAt: new Date().toISOString() };
            await put('members', obj);
            if (isEdit) {
              members = members.map((x) => (x.id === obj.id ? obj : x));
            } else {
              members.push(obj);
            }
            members.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
            close();
            draw();
            toast(isEdit ? '已更新人員' : '已新增人員');
          },
        },
      ],
    });
  }

  draw();
}
