// server.js — клієнт серверної класифікації.
// Template Matching та еталони живуть на сервері; тут лише HTTP-обмін.
// Маска 64×64 (4096 байт) — POST /classify → {state, dist}.
// Профіль: X-User-Id — ключ профілю (localStorage), еталони в calibration/<ключ>/.

let baseUrl = '';
try {
  baseUrl = localStorage.getItem('tongue.serverUrl') || '';
} catch (e) {
  baseUrl = '';
}

let profileName = '';
let profileCustom = false;
try {
  profileName = localStorage.getItem('tongue.profileKey') || '';
  profileCustom = localStorage.getItem('tongue.profileCustom') === '1';
} catch (e) {
  profileName = '';
}

/** Лише ASCII-символи, безпечні для HTTP-заголовка та імені папки. */
function sanitizeProfile(name) {
  return String(name || '').trim().replace(/[^A-Za-z0-9\-_.]/g, '_').slice(0, 32);
}

/** Стабільний ASCII-ключ з довільного імені (для кирилиці тощо). */
function hashKey(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return 'p_' + (h >>> 0).toString(36);
}

/** Ключ профілю для X-User-Id: ASCII-ключ імені або автогенерований (localStorage). */
export function getProfileKey() {
  if (profileCustom) {
    const s = sanitizeProfile(profileName);
    if (s && /[A-Za-z]/.test(profileName)) return s;
    return hashKey(profileName);
  }
  let k = '';
  try {
    k = localStorage.getItem('tongue.autoKey') || '';
    if (!k) {
      k = 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('tongue.autoKey', k);
    }
  } catch (e) {
    k = 'u_' + Math.random().toString(36).slice(2);
  }
  return k;
}

/** Ім'я профілю, задане користувачем (порожнє — автопрофіль цього браузера). */
export function getProfileName() {
  return profileCustom ? profileName : '';
}

/** Задати ім'я профілю; порожнє — повернутися до автопрофілю браузера. */
export function setProfileName(name) {
  const v = String(name || '').trim().slice(0, 32);
  try {
    if (v) {
      profileName = v;
      profileCustom = true;
      localStorage.setItem('tongue.profileKey', v);
      localStorage.setItem('tongue.profileCustom', '1');
    } else {
      profileName = '';
      profileCustom = false;
      localStorage.removeItem('tongue.profileKey');
      localStorage.removeItem('tongue.profileCustom');
    }
  } catch (e) { /* ignore */ }
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
      headers: { 'Content-Type': 'application/octet-stream', 'X-User-Id': getProfileKey() },
      body: mask,
    }),
    3000,
  );
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/** POST /calibrate: зберегти еталон на сервері (у свій профіль). */
export async function calibrate(name, mask) {
  const res = await withTimeout(
    fetch(baseUrl + '/calibrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': getProfileKey() },
      body: JSON.stringify({ name, mask: Array.from(mask) }),
    }),
    5000,
  );
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/** GET /templates → {templates, calibrated} для поточного профілю. */
export async function listTemplates() {
  const res = await withTimeout(
    fetch(baseUrl + '/templates', { headers: { 'X-User-Id': getProfileKey() } }),
    3000,
  );
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
