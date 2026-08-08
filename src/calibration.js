// calibration.js — калібрування еталонів. Маски надсилаються на сервер,
// який зберігає їх як шаблони (клієнт не тримає еталонів).

import { calibrate } from './server.js';

export class CalibrationUI {
  constructor() {
    this.enabled = false;
    this.captured = new Set();
    // onMessage — колбек для повідомлень користувачу (напр., попередження).
    this.onMessage = (msg) => console.log(msg);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) this.captured.clear();
    return this.enabled;
  }

  isCaptured(name) {
    return this.captured.has(name);
  }

  /** Зберігає поточну маску як еталон на сервері. maskProvider() → Uint8Array 64×64. */
  async capture(name, maskProvider) {
    const mask = maskProvider();
    if (!mask || mask.length === 0 || mask.every((v) => v === 0)) {
      this.onMessage(`Маска порожня. Висуньте язик (або відкрийте рот для OPEN) і повторіть.`);
      return false;
    }
    await calibrate(name, mask);
    this.captured.add(name);
    this.onMessage(`[OK] Еталон '${name}' збережено на сервері.`);
    if (name === 'OPENED') {
      this.enabled = false;
    }
    return true;
  }

  /**
   * Синхронізує вигляд кнопок у DOM.
   * refreshButtons({ calibrate, up, down, left, right, open }) — елементи.
   */
  refreshButtons(els) {
    if (els.calibrate) {
      els.calibrate.textContent = this.enabled ? 'Done' : 'Calibrate';
      els.calibrate.classList.toggle('active', this.enabled);
    }
    const arrows = { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT' };
    for (const [key, name] of Object.entries(arrows)) {
      if (els[key]) els[key].hidden = !this.enabled || this.isCaptured(name);
    }
    if (els.open) {
      const showOpen = this.enabled && this.isCaptured('DOWN') && !this.isCaptured('OPENED');
      els.open.hidden = !showOpen;
    }
  }
}
