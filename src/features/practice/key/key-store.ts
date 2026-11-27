// Document lifetime, not React lifetime: a tab-only key survives client-side navigation.
export const KEY_SLOT = "echo.gemini.remembered";
let secret: string | null = null;
let ready = false;
let lifetime = new AbortController();
const listeners = new Set<() => void>();
export const subscribeKey = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const keySnapshot = () => ready ? !!secret : null;
export const serverKeySnapshot = (): boolean | null => null;
function replace(value: string | null) {
  lifetime.abort(); lifetime = new AbortController(); secret = value;
  listeners.forEach(fn => fn());
}
export function initializeKey() {
  if (ready) return;
  ready = true;
  try { secret = window.localStorage.getItem(KEY_SLOT)?.trim() || null; } catch { secret = null; }
  window.addEventListener("storage", event => {
    if ((event.key === KEY_SLOT || event.key === null) && event.newValue === null && secret) replace(null);
  });
  listeners.forEach(fn => fn());
}
export function activateKey(key: string, remember: boolean) {
  let warning = "";
  if (remember) { try { window.localStorage.setItem(KEY_SLOT, key); } catch { warning = "Couldn't remember the key in this browser."; } }
  replace(key);
  return warning;
}
export function removeKey() {
  try { window.localStorage.removeItem(KEY_SLOT); } catch { /* The in-memory key is removed even if storage is inaccessible. */ }
  replace(null);
}
export function credential() {
  return secret ? { key: secret, signal: lifetime.signal } : null;
}
