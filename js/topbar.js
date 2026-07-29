import { getAll, getSettings, saveSettings } from './db.js';
import { refreshCurrentRoute } from './router.js';

export async function renderTopbarSeasonPicker() {
  const el = document.getElementById('topbar-season-picker');
  if (!el) return;
  const seasons = (await getAll('seasons')).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const settings = await getSettings();
  if (seasons.length === 0) {
    el.innerHTML = '';
    return;
  }
  const activeId = settings.activeSeasonId && seasons.some((s) => s.id === settings.activeSeasonId)
    ? settings.activeSeasonId
    : seasons[0].id;
  if (activeId !== settings.activeSeasonId) await saveSettings({ activeSeasonId: activeId });

  el.innerHTML = `<select id="season-picker-select">
    ${seasons.map((s) => `<option value="${s.id}" ${s.id === activeId ? 'selected' : ''}>${s.name}</option>`).join('')}
  </select>`;
  el.querySelector('select').addEventListener('change', async (e) => {
    await saveSettings({ activeSeasonId: e.target.value });
    await refreshCurrentRoute();
  });
}

// Call after any create/edit/delete of a season so the header dropdown reflects it immediately.
export async function refreshTopbar() {
  await renderTopbarSeasonPicker();
}
