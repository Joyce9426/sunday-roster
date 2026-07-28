import { getAll, getByIndex, getSettings, getById } from '../db.js';
import { fmtDate, fmtMoney, escapeHtml, todayStr, backButtonHtml, attachBackButton, settlementResultHtml } from '../utils.js';
import { navigate } from '../router.js';
import { computeSessionStats, computeSeasonStats, computeSeasonPassSettlement } from '../calc.js';

export async function renderDashboard(root) {
  const seasons = await getAll('seasons');
  if (seasons.length === 0) {
    root.innerHTML = `
      <div class="page-head"><div class="page-head-left">${backButtonHtml()}<h1 style="font-size:1.2rem;">總覽</h1></div></div>
      <div class="empty-state">
        <div class="glyph">◈</div>
        <p>歡迎使用週日場記</p>
        <p>先建立第一個季度，開始管理你的週日場次吧</p>
      </div>
      <button class="btn btn-primary btn-block" id="go-seasons">前往季度管理</button>
    `;
    attachBackButton(root);
    root.querySelector('#go-seasons').addEventListener('click', () => navigate('/seasons'));
    return;
  }

  const settings = await getSettings();
  const season = (settings.activeSeasonId && await getById('seasons', settings.activeSeasonId))
    || seasons.sort((a, b) => b.startDate.localeCompare(a.startDate))[0];

  const members = await getAll('members');
  const membersById = Object.fromEntries(members.map((m) => [m.id, m]));

  const sessions = (await getByIndex('sessions', 'seasonId', season.id)).sort((a, b) => a.date.localeCompare(b.date));
  const seasonPasses = await getByIndex('seasonPasses', 'seasonId', season.id);

  let allRosters = [];
  for (const s of sessions) {
    const r = await getByIndex('sessionRosters', 'sessionId', s.id);
    allRosters.push(...r);
  }
  const sessionStatsById = {};
  sessions.forEach((s) => { sessionStatsById[s.id] = computeSessionStats(s, allRosters.filter((r) => r.sessionId === s.id)); });

  const settlements = seasonPasses.map((sp) => {
    const rosterMap = {};
    allRosters.forEach((r) => {
      if (r.memberId === sp.memberId && r.sourceType === 'seasonPass') rosterMap[r.sessionId] = r;
    });
    return { seasonPass: sp, settlement: computeSeasonPassSettlement(sp, sessions, rosterMap) };
  });
  const seasonPassesWithSettlement = settlements.map((x) => ({ ...x.seasonPass, settlement: x.settlement }));
  const seasonStats = computeSeasonStats(sessions, sessionStatsById, seasonPassesWithSettlement);

  const today = todayStr();
  const upcoming = sessions.filter((s) => s.date >= today).slice(0, 3);
  const needsAction = settlements.filter((x) => (x.settlement.isMakeup || x.settlement.refundAmount > 0) && x.seasonPass.refundStatus !== '已結清');

  root.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        ${backButtonHtml()}
        <div>
          <h1>${escapeHtml(season.name)}</h1>
          <div class="sub">${fmtDate(season.startDate)} － ${fmtDate(season.endDate)}</div>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" id="go-season-detail">查看季度</button>
    </div>

    <div class="scoreboard">
      <div class="scoreboard-label">本季速覽</div>
      <div class="scoreboard-grid">
        <div class="scoreboard-cell"><div class="num mono">$${fmtMoney(seasonStats.received)}</div><div class="cap">已收金額</div></div>
        <div class="scoreboard-cell"><div class="num mono">$${fmtMoney(seasonStats.receivable)}</div><div class="cap">應收金額</div></div>
        <div class="scoreboard-cell"><div class="num mono">$${fmtMoney(seasonStats.receivedSurplus)}</div><div class="cap">已收盈餘</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">即將到來的場次</div>
      ${upcoming.length ? upcoming.map((s) => {
        const st = sessionStatsById[s.id];
        return `<div class="list-row" data-open-session="${s.id}" style="cursor:pointer;">
          <div class="list-row-main">
            <div class="list-row-title">${fmtDate(s.date)}${s.timeSlot ? `・${escapeHtml(s.timeSlot)}` : ''}</div>
            <div class="list-row-meta">出席 ${st.attendeeCount} 人・已收 $${fmtMoney(st.received)} / 應收 $${fmtMoney(st.receivable)}</div>
          </div>
        </div>`;
      }).join('') : '<div class="small text-faint">本季近期沒有安排場次</div>'}
    </div>

    ${needsAction.length ? `
      <div class="card">
        <div class="card-title">季打應退款／應補收提醒</div>
        <div class="stack">
          ${needsAction.map((x) => {
            const m = membersById[x.seasonPass.memberId];
            return `<div class="flex-between">
              <span>${escapeHtml(m?.name || '')}</span>
              ${settlementResultHtml(x.settlement)}
            </div>`;
          }).join('')}
        </div>
      </div>
    ` : ''}
  `;

  root.querySelector('#go-season-detail').addEventListener('click', () => navigate(`/seasons/${season.id}`));
  attachBackButton(root);
  root.querySelectorAll('[data-open-session]').forEach((el) => {
    el.addEventListener('click', () => navigate(`/sessions/${el.dataset.openSession}`));
  });
}
