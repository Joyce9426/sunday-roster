// ---------- Minimal hash router ----------
const routes = [];

export function route(pattern, handler) {
  // pattern like '/seasons/:id'
  const paramNames = [];
  const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => {
    paramNames.push(m.slice(1));
    return '([^/]+)';
  }) + '$');
  routes.push({ regex, paramNames, handler });
}

export function navigate(path) {
  window.location.hash = '#' + path;
}

async function resolve() {
  const hash = window.location.hash.replace(/^#/, '') || '/dashboard';
  const path = hash.split('?')[0];
  for (const r of routes) {
    const m = path.match(r.regex);
    if (m) {
      const params = {};
      r.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
      updateActiveTab(path);
      await r.handler(params);
      return;
    }
  }
  // fallback
  navigate('/dashboard');
}

function updateActiveTab(path) {
  const root = path.split('/')[1] || 'dashboard';
  document.querySelectorAll('#main-nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === root);
  });
}

export function startRouter() {
  window.addEventListener('hashchange', resolve);
  resolve();
}

export function refreshCurrentRoute() {
  resolve();
}
