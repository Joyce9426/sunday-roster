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
        <h1 style="font-family:var(--font-display);font-size:1.3rem;margin-bottom:4px;">隨手場記</h1>
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
      <div style="font-size:1.6rem;margin-bottom:8px;"><svg width="40" height="40" fill="currentColor" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 -15.0 110.0 110.0">
 <path d="m93.906 57.656c-3.9219-0.40625-6.8906-3.7031-6.8906-7.6562s2.9688-7.25 6.8906-7.6562c0.4375-0.03125 0.84375-0.26562 1.1094-0.625 0.25-0.35938 0.35938-0.8125 0.26562-1.2344-1.1719-5.6406-3.3594-10.938-6.5312-15.781-0.23438-0.35938-0.625-0.60938-1.0625-0.6875-0.4375-0.0625-0.89062 0.0625-1.2344 0.34375-3.0469 2.5-7.4688 2.2656-10.281-0.53125-2.7969-2.8125-3.0312-7.2344-0.53125-10.281 0.28125-0.34375 0.40625-0.79688 0.34375-1.2344-0.078125-0.4375-0.32812-0.82812-0.6875-1.0625-4.8438-3.1719-10.141-5.3594-15.781-6.5312-0.4375-0.09375-0.875 0.015625-1.2344 0.26562-0.35938 0.26562-0.59375 0.67188-0.625 1.1094-0.40625 3.9219-3.7031 6.8906-7.6562 6.8906s-7.25-2.9688-7.6562-6.8906c-0.03125-0.4375-0.26562-0.84375-0.625-1.1094-0.35938-0.25-0.8125-0.35938-1.2344-0.26562-5.6406 1.1719-10.938 3.3594-15.781 6.5312-0.35938 0.23438-0.60938 0.625-0.6875 1.0625-0.0625 0.4375 0.0625 0.89062 0.34375 1.2344 2.5 3.0469 2.2656 7.4688-0.53125 10.281-2.8125 2.7969-7.2344 3.0156-10.281 0.53125-0.34375-0.28125-0.79688-0.40625-1.2344-0.34375-0.4375 0.078125-0.82812 0.32812-1.0625 0.6875-3.1719 4.8438-5.3594 10.141-6.5312 15.781-0.09375 0.42188 0.015625 0.875 0.26562 1.2344 0.26562 0.35938 0.67188 0.59375 1.1094 0.625 3.9219 0.40625 6.8906 3.7031 6.8906 7.6562s-2.9688 7.25-6.8906 7.6562c-0.4375 0.03125-0.84375 0.26562-1.1094 0.625-0.25 0.35938-0.35938 0.8125-0.26562 1.2344 1.1719 5.6406 3.3594 10.938 6.5312 15.781 0.23438 0.35938 0.625 0.60938 1.0625 0.6875 0.4375 0.0625 0.89062-0.0625 1.2344-0.34375 3.0469-2.5 7.4688-2.2656 10.281 0.53125 2.7969 2.8125 3.0312 7.2344 0.53125 10.281-0.28125 0.34375-0.40625 0.79688-0.34375 1.2344 0.078125 0.4375 0.32812 0.82812 0.6875 1.0625 4.8438 3.1719 10.141 5.3594 15.781 6.5312 0.42188 0.078125 0.875-0.015625 1.2344-0.26562 0.35938-0.26562 0.59375-0.67188 0.625-1.1094 0.40625-3.9219 3.7031-6.8906 7.6562-6.8906s7.25 2.9688 7.6562 6.8906c0.03125 0.4375 0.26562 0.84375 0.625 1.1094 0.26562 0.1875 0.59375 0.29688 0.92188 0.29688 0.10938 0 0.21875-0.015625 0.3125-0.03125 5.6406-1.1719 10.938-3.3594 15.781-6.5312 0.35938-0.23438 0.60938-0.625 0.6875-1.0625 0.0625-0.4375-0.0625-0.89062-0.34375-1.2344-2.5-3.0469-2.2656-7.4688 0.53125-10.281 2.8125-2.7969 7.2344-3.0312 10.281-0.53125 0.34375 0.28125 0.79688 0.40625 1.2344 0.34375 0.4375-0.078125 0.82812-0.32812 1.0625-0.6875 3.1719-4.8438 5.3594-10.141 6.5312-15.781 0.09375-0.42188-0.015625-0.875-0.26562-1.2344-0.26562-0.35938-0.67188-0.59375-1.1094-0.625zm-43.906 12.656c-11.203 0-20.312-9.1094-20.312-20.312s9.1094-20.312 20.312-20.312 20.312 9.1094 20.312 20.312-9.1094 20.312-20.312 20.312z"/></svg></div>
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
