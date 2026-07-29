import { route, startRouter } from './router.js';
import { getById } from './db.js';
import { renderTopbarSeasonPicker } from './topbar.js';
import { isAppUnlocked, renderAppLockScreen } from './authGate.js';
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

async function registerSW() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (e) {
      console.warn('Service worker registration failed', e);
    }
  }
}

async function startApp() {
  await renderTopbarSeasonPicker();
  startRouter();
  registerSW();
}

(function boot() {
  if (!isAppUnlocked()) {
    const topbar = document.querySelector('.topbar');
    const tabbar = document.querySelector('.tabbar');
    if (topbar) topbar.style.display = 'none';
    if (tabbar) tabbar.style.display = 'none';
    renderAppLockScreen(viewRoot, () => {
      if (topbar) topbar.style.display = '';
      if (tabbar) tabbar.style.display = '';
      startApp();
    });
    return;
  }
  startApp();
})();
