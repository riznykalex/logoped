// tracker.js — головний конвеєр (аналог TongueTracker у Python) +
// HoldFilter для стабілізації стану. Класифікація винесена на сервер:
// тут лише будується маска 64×64, яку надсилає main.js через server.js.

import { applyContrastBrightness, buildStateMask, fitToSquare } from './mask.js';
import { normalizeFaceLighting } from './lighting.js';
import { CONFIG } from './config.js';

export class HoldFilter {
  /**
   * Мінімальний час утримання стану перед підтвердженням.
   * holdMs у мілісекундах (300–600 мс за ТЗ).
   */
  constructor(holdMs = 400) {
    this.holdMs = holdMs;
    this.candidate = null;
    this.since = 0;
    this.confirmed = 'NEUTRAL';
  }

  update(state, now) {
    if (state !== this.candidate) {
      this.candidate = state;
      this.since = now;
    }
    if (now - this.since >= this.holdMs) {
      this.confirmed = this.candidate;
    }
    return this.confirmed;
  }

  reset() {
    this.candidate = null;
    this.confirmed = 'NEUTRAL';
  }
}

export class TongueTracker {
  constructor(settings) {
    this.settings = settings;
    this.last = {
      state: 'NEUTRAL',
      dist: 0,
      thr: 0,
      cx: -1,
      faceDetected: false,
      mouthClosed: false,
      normalized: new Uint8Array(CONFIG.tracker.maskSize * CONFIG.tracker.maskSize),
      roiRect: null,
      lipRect: null,
      mouthRect: null,
    };
  }

  /**
   * Обробляє кадр: contrast/brightness → lighting → маска → 64×64.
   * Класифікацію виконує сервер (main.js → server.js.classify), сюди
   * повертається лише маска для надсилання та метрики для відображення.
   * imageData — ImageData повного кадру; landmarks — НОРМАЛІЗОВАНІ точки
   * {x,y} у координатному просторі цього кадру.
   * Повертає { last, lit }.
   */
  process(imageData, landmarks) {
    const last = this.last;
    const s = this.settings;

    const adjusted = applyContrastBrightness(imageData, s.contrast, s.brightness);
    const lit = normalizeFaceLighting(adjusted, landmarks, s.lightStrength);

    const maskInfo = buildStateMask(lit, landmarks, s);
    last.thr = maskInfo.thr;
    last.mouthClosed = maskInfo.mouthClosed;
    last.roiRect = maskInfo.roiRect;
    last.lipRect = maskInfo.lipRect;
    last.mouthRect = maskInfo.mouthRect;

    if (maskInfo.mouthClosed || maskInfo.maskW === 0 || maskInfo.maskH === 0) {
      // Рот закритий — маску не оновлюємо (як у Python), сервер не питаємо
      return { last, lit };
    }

    const normalized = fitToSquare(maskInfo.mask, maskInfo.maskW, maskInfo.maskH, CONFIG.tracker.maskSize);
    last.normalized = normalized;

    // Центр темряви патерну по X (~32 = центр, менше = зліва, більше = справа)
    let sum = 0;
    let n = 0;
    for (let i = 0; i < normalized.length; i++) {
      if (normalized[i] < 100) {
        sum += i % 64;
        n++;
      }
    }
    last.cx = n ? sum / n : -1;

    return { last, lit };
  }
}
