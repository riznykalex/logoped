// settings.js — кастомні повзунки (HTML <input type="range">).
// Діапазони й значення за замовчуванням — з config.js (CONFIG.sliders).

import { CONFIG } from './config.js';

export class SettingsUI {
  constructor(inputs) {
    // inputs: { contrast: <input>, brightness: <input>, light: <input>, shadow: <input> }
    this.inputs = inputs;
    this.values = {};
    this.onChange = null;
    for (const [key, el] of Object.entries(inputs)) {
      if (!el) continue;
      const spec = CONFIG.sliders[key];
      if (spec) {
        el.min = spec.min;
        el.max = spec.max;
        el.step = spec.step;
        el.value = spec.default;
      }
      this.values[key] = parseFloat(el.value);
      el.addEventListener('input', () => {
        this.values[key] = parseFloat(el.value);
        this.updateLabels();
        if (this.onChange) this.onChange(key, this.values[key]);
      });
    }
    this.updateLabels();
  }

  /** Геометрична шкала Light: кожні +50 подвоюють силу (100 -> 1.0). */
  get lightStrength() {
    const lb = this.values.light;
    if (lb <= 0) return 0;
    return Math.min(1, Math.pow(2, (lb - 100) / 50));
  }

  /** Множник contrast для convertScaleAbs (1.0–3.0). */
  get contrast() {
    return this.values.contrast;
  }

  /** Зсув яскравості (−100…+100). */
  get brightness() {
    return this.values.brightness;
  }

  /** Коефіцієнт порогу тіні (0.0–1.0). */
  get shadow() {
    return this.values.shadow / 100;
  }

  updateLabels() {
    const fmt = (el, text) => {
      if (el && el.parentElement) {
        const span = el.parentElement.querySelector('output');
        if (span) span.textContent = text;
      }
    };
    fmt(this.inputs.contrast, this.values.contrast.toFixed(1));
    fmt(this.inputs.brightness, String(Math.round(this.values.brightness)));
    fmt(this.inputs.light, String(Math.round(this.values.light)));
    fmt(this.inputs.shadow, (this.values.shadow / 100).toFixed(2));
  }
}
