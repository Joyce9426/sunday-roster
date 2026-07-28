// ---------- General utilities ----------

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

export function nowIso() {
  return new Date().toISOString();
}

export function fmtMoney(n) {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString('zh-Hant-TW');
}

// Format a Date object as a local yyyy-mm-dd string WITHOUT going through
// toISOString() (which converts to UTC first and shifts the date back by
// one day for any timezone ahead of UTC, e.g. UTC+8 — this was the root
// cause of Sundays showing up as Saturdays for auto-generated sessions).
export function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}/${mm}/${dd}（${weekday}）`;
}

export function todayStr() {
  return toDateStr(new Date());
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

// Count Sundays (inclusive) between two date strings (yyyy-mm-dd)
export function countSundaysBetween(startStr, endStr) {
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  if (isNaN(start) || isNaN(end) || start > end) return 0;
  let count = 0;
  const d = new Date(start);
  // move to first Sunday on/after start
  const offset = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + offset);
  while (d <= end) {
    count++;
    d.setDate(d.getDate() + 7);
  }
  return count;
}

// Suggest a season name from date range, e.g. 2026-Q3
export function suggestSeasonName(startStr) {
  if (!startStr) return '';
  const d = new Date(startStr + 'T00:00:00');
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}

// List every Sunday (inclusive) between two date strings (yyyy-mm-dd)
export function listSundaysBetween(startStr, endStr) {
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  if (isNaN(start) || isNaN(end) || start > end) return [];
  const dates = [];
  const d = new Date(start);
  const offset = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + offset);
  while (d <= end) {
    dates.push(toDateStr(d));
    d.setDate(d.getDate() + 7);
  }
  return dates;
}

// ---------- Season / session status ----------
export function isSeasonOngoing(season, today = todayStr()) {
  return season.startDate <= today && today <= season.endDate;
}

export function isSessionUpcoming(session, today = todayStr()) {
  return session.date >= today;
}

// ---------- Settlement result formatting (退款 = "-", 補繳 = "+" in red, 0 = no sign) ----------
export function settlementResultHtml(settlement) {
  if (settlement.isMakeup) {
    return `<span class="amount-makeup">＋$${fmtMoney(settlement.makeupAmount)}</span>`;
  }
  if (settlement.refundAmount > 0) {
    return `<span class="amount-refund">－$${fmtMoney(settlement.refundAmount)}</span>`;
  }
  return `<span class="text-faint small">$0</span>`;
}

// ---------- Back button ----------
export function backButtonHtml() {
  return `<button class="back-btn" id="page-back-btn" aria-label="返回上一頁" type="button">
    <svg viewBox="0 0 24 24" width="20" height="20"><path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>`;
}

export function attachBackButton(root) {
  const btn = root.querySelector('#page-back-btn');
  if (btn) btn.addEventListener('click', () => window.history.back());
}

// ---------- Toast ----------
export function toast(msg) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 250);
  }, 1800);
}

// ---------- Modal ----------
// opts: { title, bodyHtml, onMount(panelEl), actions: [{label, primary, danger, onClick(closeFn)}] }
export function openModal(opts) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const panel = document.createElement('div');
  panel.className = 'modal-panel';
  panel.innerHTML = `
    <div class="modal-head">
      <h2 style="font-size:1.05rem;">${opts.title || ''}</h2>
      <button class="icon-btn" data-close aria-label="關閉">✕</button>
    </div>
    <div class="modal-body">${opts.bodyHtml || ''}</div>
    <div class="modal-actions" data-actions></div>
  `;
  backdrop.appendChild(panel);
  root.appendChild(backdrop);

  const close = () => { root.innerHTML = ''; };

  panel.querySelector('[data-close]').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  const actionsRoot = panel.querySelector('[data-actions]');
  (opts.actions || []).forEach((a) => {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : '');
    btn.textContent = a.label;
    btn.addEventListener('click', () => a.onClick(close, panel));
    actionsRoot.appendChild(btn);
  });

  if (opts.onMount) opts.onMount(panel, close);
  return { close, panel };
}

export function confirmDialog(message, onConfirm, opts = {}) {
  openModal({
    title: opts.title || '請確認',
    bodyHtml: `<p class="small text-soft">${message}</p>`,
    actions: [
      { label: '取消', onClick: (close) => close() },
      { label: opts.confirmLabel || '確定', danger: opts.danger !== false, onClick: (close) => { onConfirm(); close(); } },
    ],
  });
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
