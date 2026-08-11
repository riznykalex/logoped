// calibration.js — калібрування еталонів. Маски надсилаються на сервер,
// який зберігає їх як шаблони у профілі користувача (клієнт не тримає еталонів).

import { calibrate } from './server.js';

const ALL_STATES = ['NEUTRAL', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'OPENED'];

export class CalibrationUI {
  constructor() {
    this.captured = new Set();
    // onMessage — колбек для повідомлень користувачу (напр., попередження).
    this.onMessage = (msg) => console.log(msg);
  }

  isCaptured(name) {
    return this.captured.has(name);
  }

  get allCaptured() {
    return ALL_STATES.every((s) => this.captured.has(s));
  }

  /** Зберігає поточну маску як еталон на сервері. maskProvider() → Uint8Array maskSize². */
  async capture(name, maskProvider) {
    const mask = maskProvider();
    if (!mask || mask.length === 0 || mask.every((v) => v === 0)) {
      this.onMessage(`Маска порожня. Висуньте язик (або відкрийте рот для OPEN) і повторіть.`);
      return false;
    }
    await calibrate(name, mask);
    this.captured.add(name);
    this.onMessage(`[OK] Еталон '${name}' збережено на сервері.`);
    return true;
  }
}
