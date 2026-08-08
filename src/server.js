// server.js — клієнт серверної класифікації.
// Template Matching та еталони живуть на сервері; тут лише HTTP-обмін.
// Маска 64×64 (4096 байт) — POST /classify → {state, dist}.

let baseUrl = '';
try {
  baseUrl = localStorage.getItem('tongue.serverUrl') || '';
} catch (e) {
  baseUrl = '';
}

export function getServerUrl() {
  return baseUrl;
}

export function setServerUrl(url) {
  baseUrl = (url || '').trim().replace(/\/+$/, '');
  try {
    if (baseUrl) localStorage.setItem('tongue.serverUrl', baseUrl);
    else localStorage.removeItem('tongue.serverUrl');
  } catch (e) { /* ignore */ }
}

async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('таймаут сервера')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** POST /classify: маска (Uint8Array 4096) → {state, dist}. */
export async function classify(mask) {
  const res = await withTimeout(
    fetch(baseUrl + '/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: mask,
    }),
    3000,
  );
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/** POST /calibrate: зберегти еталон на сервері. */
export async function calibrate(name, mask) {
  const res = await withTimeout(
    fetch(baseUrl + '/calibrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mask: Array.from(mask) }),
    }),
    5000,
  );
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/** GET /templates → список імен еталонів, що є на сервері. */
export async function listTemplates() {
  const res = await withTimeout(fetch(baseUrl + '/templates'), 3000);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  return data.templates || [];
}
