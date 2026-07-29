// ---------------------------------------------------------------------------
// Lightweight password gates. These are NOT real security — the password
// strings live in this client-side file and anyone who opens devtools can
// read them or just skip the check entirely. They're meant purely as a
// casual "keep people from poking around" friction layer, not protection
// against a determined user.
// ---------------------------------------------------------------------------

const APP_PASSWORD = 'admin';
const SETTINGS_PASSWORD = 'setting';
const APP_UNLOCK_KEY = 'sunday-roster:app-unlocked';
const SETTINGS_UNLOCK_KEY = 'sunday-roster:settings-unlocked';

// App-level gate — persists across app restarts (localStorage) so the admin
// only has to enter it once per device, not on every single visit.
export function isAppUnlocked() {
  try { return localStorage.getItem(APP_UNLOCK_KEY) === '1'; } catch (e) { return false; }
}

function setAppUnlocked() {
  try { localStorage.setItem(APP_UNLOCK_KEY, '1'); } catch (e) { /* ignore */ }
}

// Renders a full-screen password prompt into `root`. Calls onUnlock() once
// the correct password is entered.
export function renderAppLockScreen(root, onUnlock) {
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);">
      <div style="width:100%;max-width:320px;text-align:center;">
        <div style="font-size:2rem;margin-bottom:8px;">◈</div>
        <h1 style="font-family:var(--font-display);font-size:1.3rem;margin-bottom:4px;">週日場記</h1>
        <p class="small text-soft" style="margin-bottom:20px;">請輸入密碼以使用此工具</p>
        <input type="password" id="app-lock-input" placeholder="密碼" autocomplete="off"
          style="width:100%;border:1px solid var(--line);border-radius:8px;padding:11px 12px;text-align:center;margin-bottom:12px;box-sizing:border-box;">
        <button class="btn btn-primary btn-block" id="app-lock-submit">進入</button>
        <p class="small text-faint" id="app-lock-error" style="margin-top:10px;min-height:1.2em;"></p>
      </div>
    </div>
  `;
  const input = root.querySelector('#app-lock-input');
  const errorEl = root.querySelector('#app-lock-error');
  function attempt() {
    if (input.value === APP_PASSWORD) {
      setAppUnlocked();
      onUnlock();
    } else {
      errorEl.textContent = '密碼錯誤，請再試一次';
      input.value = '';
      input.focus();
    }
  }
  root.querySelector('#app-lock-submit').addEventListener('click', attempt);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt(); });
  input.focus();
}

// Settings-level gate — only lasts for the current browser session
// (sessionStorage), so re-opening the app fresh asks again even though the
// app-level password is already remembered.
export function isSettingsUnlocked() {
  try { return sessionStorage.getItem(SETTINGS_UNLOCK_KEY) === '1'; } catch (e) { return false; }
}

function setSettingsUnlocked() {
  try { sessionStorage.setItem(SETTINGS_UNLOCK_KEY, '1'); } catch (e) { /* ignore */ }
}

// Renders an in-page password prompt (matches the app's normal page layout,
// keeps the bottom nav visible) into `root`. Calls onUnlock() on success.
export function renderSettingsLockScreen(root, onUnlock) {
  root.innerHTML = `
    <div class="page-head"><h1 style="font-size:1.2rem;">設定</h1></div>
    <div class="card" style="text-align:center;padding:32px 20px;">
      <div style="font-size:1.6rem;margin-bottom:8px;">⚙</div>
      <p class="small text-soft" style="margin-bottom:16px;">請輸入密碼以進入設定頁</p>
      <input type="password" id="settings-lock-input" placeholder="密碼" autocomplete="off"
        style="width:100%;border:1px solid var(--line);border-radius:8px;padding:10px 12px;text-align:center;margin-bottom:12px;box-sizing:border-box;">
      <button class="btn btn-primary btn-block" id="settings-lock-submit">進入</button>
      <p class="small text-faint" id="settings-lock-error" style="margin-top:10px;min-height:1.2em;"></p>
    </div>
  `;
  const input = root.querySelector('#settings-lock-input');
  const errorEl = root.querySelector('#settings-lock-error');
  function attempt() {
    if (input.value === SETTINGS_PASSWORD) {
      setSettingsUnlocked();
      onUnlock();
    } else {
      errorEl.textContent = '密碼錯誤，請再試一次';
      input.value = '';
      input.focus();
    }
  }
  root.querySelector('#settings-lock-submit').addEventListener('click', attempt);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt(); });
  input.focus();
}
