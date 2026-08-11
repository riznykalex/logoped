// games/drawing.js — «Малювання по площині» (etch-a-sketch-стиль, без сітки).
// Напрямок задає рух: утримання UP/DOWN/LEFT/RIGHT повільно рухає невеликий
// квадрат-штамп по площині. Штамп залишає слід, колір якого градієнтно
// змінюється за пройденим шляхом (huePerPx °/px). Тап по полю — очистити.

import { CONFIG } from '../config.js';

const DIRS = {
  UP: { dx: 0, dy: -1 },
  DOWN: { dx: 0, dy: 1 },
  LEFT: { dx: -1, dy: 0 },
  RIGHT: { dx: 1, dy: 0 },
};

export class DrawingGame {
  constructor(settings, canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.speed = (settings && settings.speed) || CONFIG.drawing.speed; // px/с
    this.thickness = (settings && settings.thickness) || CONFIG.drawing.thickness; // px
    this.huePerPx = (settings && settings.huePerPx) || CONFIG.drawing.huePerPx; // °/px
    this.half = this.thickness / 2;
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.reset();
    // Тап по полю — очистити малюнок
    if (canvas.addEventListener) canvas.addEventListener('pointerdown', () => {
      if (this.trail.length) this.clear();
    });
  }

  resize() {
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.x = Math.min(this.w, this.x);
    this.y = Math.min(this.h, this.y);
  }

  reset() {
    this.state = 'NEUTRAL';
    this.won = false; // без перемоги — вільне малювання
    this.x = this.w / 2;
    this.y = this.h / 2;
    this.trail = []; // {x, y, hue} — штампи сліду
    this.dist = 0;   // пройдений шлях, px
    this.hue = 0;
    this._stamp();
  }

  /** Очистити малюнок (квадрат залишається на місці). */
  clear() {
    this.trail = [];
    this.dist = 0;
    this.hue = 0;
    this._stamp();
  }

  onState(state) {
    this.state = state;
  }

  /** Рух: напрямок задає швидкість; штамп ставиться кожні ~half px шляху. */
  tick(dt) {
    const d = DIRS[this.state];
    if (!d || !dt || dt <= 0) return;
    const step = this.speed * dt;
    if (step <= 0) return;
    const stampEvery = Math.max(1, Math.round(this.half));
    let remaining = step;
    while (remaining > 0) {
      const s = Math.min(remaining, stampEvery);
      const nx = this.x + d.dx * s;
      const ny = this.y + d.dy * s;
      const cx = Math.max(0, Math.min(this.w, nx));
      const cy = Math.max(0, Math.min(this.h, ny));
      if (cx === this.x && cy === this.y) break; // уперлися в край
      const moved = Math.abs(cx - this.x) + Math.abs(cy - this.y);
      this.x = cx;
      this.y = cy;
      remaining -= s;
      this.dist += moved;
      this.hue = (this.hue + moved * this.huePerPx) % 360;
      this._stamp();
    }
  }

  _stamp() {
    this.trail.push({ x: this.x, y: this.y, hue: this.hue });
    if (this.trail.length > 20000) this.trail.splice(0, this.trail.length - 20000);
  }

  draw() {
    const c = this.ctx;
    const w = this.w;
    const h = this.h;

    c.fillStyle = '#0e0e16';
    c.fillRect(0, 0, w, h);

    // Слід: квадрати-штампи у кольорах градієнта
    for (const t of this.trail) {
      c.fillStyle = `hsl(${t.hue}, 85%, 60%)`;
      c.fillRect(t.x - this.half, t.y - this.half, this.thickness, this.thickness);
    }

    // Поточний квадрат (з рамкою)
    c.fillStyle = `hsl(${this.hue}, 85%, 60%)`;
    c.fillRect(this.x - this.half, this.y - this.half, this.thickness, this.thickness);
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.strokeRect(this.x - this.half, this.y - this.half, this.thickness, this.thickness);

    // Підказка
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font = 'bold 16px system-ui, sans-serif';
    c.fillText('Пройдено: ' + Math.round(this.dist) + ' px', 10, 8);
    c.font = '13px system-ui, sans-serif';
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillText('язик: вгору · вниз · вліво · вправо   —   тап по полю = очистити', 10, 32);
  }
}
