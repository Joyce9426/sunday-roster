import { route, startRouter } from './router.js';
import { getAll, getById, getSettings, saveSettings } from './db.js';
import { renderDashboard } from './views/dashboard.js';
import { renderSeasonsList } from './views/seasons.js';
import { renderSeasonDetail } from './views/seasonDetail.js';
import { renderSessionsList } from './views/sessions.js';
import { renderSessionDetail } from './views/sessionDetail.js';
import { renderMembers } from './views/members.js';
import { renderSettings } from './views/settings.js';

const viewRoot = document.getElementById('view-root');

route('/dashboard', async () => {
  viewRoot.innerHTML = '';
  await renderDashboard(viewRoot);
});
route('/seasons', async () => {
  viewRoot.innerHTML = '';
  await renderSeasonsList(viewRoot);
});
route('/seasons/:seasonId', async ({ seasonId }) => {
  viewRoot.innerHTML = '';
  await renderSeasonDetail(viewRoot, seasonId);
});
route('/sessions', async () => {
  viewRoot.innerHTML = '';
  await renderSessionsList(viewRoot);
});
route('/sessions/:sessionId', async ({ sessionId }) => {
  viewRoot.innerHTML = '';
  const session = await getById('sessions', sessionId);
  if (!session) { window.location.hash = '#/sessions'; return; }
  await renderSessionDetail(viewRoot, session.seasonId, sessionId);
});
route('/seasons/:seasonId/sessions/:sessionId', async ({ seasonId, sessionId }) => {
  viewRoot.innerHTML = '';
  await renderSessionDetail(viewRoot, seasonId, sessionId);
});
route('/members', async () => {
  viewRoot.innerHTML = '';
  await renderMembers(viewRoot);
});
route('/settings', async () => {
  viewRoot.innerHTML = '';
  await renderSettings(viewRoot);
});

async function renderTopbarSeasonPicker() {
  const el = document.getElementById('topbar-season-picker');
  const seasons = (await getAll('seasons')).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const settings = await getSettings();
  if (seasons.length === 0) {
    el.innerHTML = '';
    return;
  }
  const activeId = settings.activeSeasonId && seasons.some(s => s.id === settings.activeSeasonId)
    ? settings.activeSeasonId
    : seasons[0].id;
  if (activeId !== settings.activeSeasonId) await saveSettings({ activeSeasonId: activeId });

  el.innerHTML = `<select id="season-picker-select">
    ${seasons.map((s) => `<option value="${s.id}" ${s.id === activeId ? 'selected' : ''}>${s.name}</option>`).join('')}
  </select>`;
  el.querySelector('select').addEventListener('change', async (e) => {
    await saveSettings({ activeSeasonId: e.target.value });
    if (window.location.hash.startsWith('#/dashboard') || window.location.hash === '') {
      window.dispatchEvent(new Event('hashchange'));
    }
  });
}

export async function refreshTopbar() {
  await renderTopbarSeasonPicker();
}

async function registerSW() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (e) {
      console.warn('Service worker registration failed', e);
    }
  }
}

(async function boot() {
  await renderTopbarSeasonPicker();
  startRouter();
  registerSW();
})();
