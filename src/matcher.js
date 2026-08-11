// matcher.js — TemplateMatcher з Block-wise MSE Vector Matching.
// Еталони зберігаються в IndexedDB (аналог папки calibration/ у Python).
// Класифікацію виконує сервер (server.py) — цей модуль для тестів і
// резервного/офлайн-режиму; метрика та сама, що на сервері (8×8 блоків).

export const STATE_NAMES = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'OPENED'];

const DB_NAME = 'tongue-tracker';
const DB_VERSION = 1;
const STORE = 'templates';

/**
 * Block-wise MSE Vector Matching: маска ділиться на сітку 8×8 блоків,
 * для кожного обчислюється MSE, результат нормалізовано у [0..1]:
 * dist = sqrt( sum_b (mse_b / 255^2)^2 ) / 8
 */
export function blockwiseMSE(camPixels, tplPixels, size) {
  const b = size / 8;
  let s = 0;
  for (let by = 0; by < size; by += b) {
    for (let bx = 0; bx < size; bx += b) {
      let mse = 0;
      for (let y = by; y < by + b; y++) {
        for (let x = bx; x < bx + b; x++) {
          const i = y * size + x;
          const diff = camPixels[i] - tplPixels[i];
          mse += diff * diff;
        }
      }
      mse /= b * b;
      s += (mse / (255 * 255)) * (mse / (255 * 255));
    }
  }
  return Math.sqrt(s) / 8;
}

/** Синтетичні еталони за замовчуванням (білий фон, чорна зона рота). */
export function syntheticTemplates(size = 64) {
  const mk = (rect) => {
    const t = new Uint8Array(size * size);
    t.fill(255);
    const [x0, y0, x1, y1] = rect;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) t[y * size + x] = 0;
    }
    return t;
  };
  return {
    NEUTRAL: mk([26, 28, 38, 40]),
    OPENED: mk([6, 20, 58, 44]),
    UP: mk([6, 8, 58, 32]),
    DOWN: mk([6, 32, 58, 56]),
    LEFT: mk([6, 20, 32, 44]),
    RIGHT: mk([32, 20, 58, 44]),
  };
}

export class TemplateMatcher {
  constructor(size = 64) {
    this.size = size;
    this.templates = syntheticTemplates(size);
  }

  /** Класифікація за мінімальною евклідовою відстанню векторів. */
  match(camPixels) {
    let best = 'NEUTRAL';
    let minDist = Infinity;
    for (const name of Object.keys(this.templates)) {
      const d = blockwiseMSE(camPixels, this.templates[name], this.size);
      if (d < minDist) {
        minDist = d;
        best = name;
      }
    }
    return { state: best, dist: minDist };
  }

  /** Записує еталон у пам'ять і в IndexedDB. */
  async capture(name, mask) {
    if (!mask || mask.length !== this.size * this.size) return null;
    this.templates[name] = Uint8Array.from(mask);
    await saveTemplateToDB(name, mask);
    return name;
  }
}

// ---------- IndexedDB ----------

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'name' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveTemplateToDB(name, pixels) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ name, pixels: Array.from(pixels), savedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadTemplatesFromDB(matcher) {
  const db = await openDB();
  const all = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  for (const rec of all) {
    if (rec && rec.name && rec.pixels && rec.pixels.length === matcher.size * matcher.size) {
      matcher.templates[rec.name] = Uint8Array.from(rec.pixels);
    }
  }
  return all.map((r) => r.name).filter(Boolean);
}

/** Експорт усіх еталонів у JSON-файл. */
export function exportTemplatesJson(matcher) {
  const data = {};
  for (const [name, pixels] of Object.entries(matcher.templates)) {
    data[name] = Array.from(pixels);
  }
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tongue-templates.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Імпорт еталонів з JSON-файлу. */
export async function importTemplatesJson(matcher, file) {
  const text = await file.text();
  const data = JSON.parse(text);
  for (const [name, arr] of Object.entries(data)) {
    if (arr && arr.length === matcher.size * matcher.size) {
      matcher.templates[name] = Uint8Array.from(arr);
      await saveTemplateToDB(name, matcher.templates[name]);
    }
  }
  return Object.keys(data);
}
