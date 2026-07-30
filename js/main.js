import { route, startRouter, refreshCurrentRoute } from './router.js';
import { getById } from './db.js';
import { renderTopbarSeasonPicker } from './topbar.js';
import { isAppUnlocked, renderAppLockScreen } from './authGate.js';
import { syncNow } from './sync.js';
import { toast } from './utils.js';
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
  setupSyncButton();
}

function setupSyncButton() {
  const btn = document.getElementById('topbar-sync-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (btn.classList.contains('syncing')) return;
    btn.classList.add('syncing');
    try {
      const result = await syncNow();
      toast(`同步完成（推送 ${result.pushed} 筆、拉取 ${result.pulled} 筆）`);
      // Re-render whatever page is currently open (and the header's season
      // dropdown) so newly pulled data shows up immediately, instead of only
      // appearing after the user navigates away and back.
      await renderTopbarSeasonPicker();
      await refreshCurrentRoute();
    } catch (err) {
      toast(err.message || '同步失敗');
    } finally {
      btn.classList.remove('syncing');
    }
  });
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
