// games/feeding.js — «Годування»: герой сидить у центрі, їжа їде з краю
// екрана до центру. Треба навести язик у напрямку їжі й утримати holdMs —
// герой ловить. Їжа, що дійшла до центру, зникає без покарання.
// UP/DOWN/LEFT/RIGHT — напрямок; NEUTRAL — пауза (не ловить).

const FOOD_EMOJI = ['🍎', '🍌', '🍒', '🍓', '🍉', '🍇', '🍊', '🍍', '🍑', '🥕', '🥝'];
const HERO_EMOJI = '🐸';

const DIRS = {
  UP: { dx: 0, dy: -1 },
  DOWN: { dx: 0, dy: 1 },
  LEFT: { dx: -1, dy: 0 },
  RIGHT: { dx: 1, dy: 0 },
};
const DIR_NAMES = Object.keys(DIRS);

export class FeedingGame {
  constructor(settings, canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.speed = (settings && settings.speed) || 45;       // швидкість їжі px/с
    this.holdMs = (settings && settings.holdMs) || 400;    // утримання напрямку
    this.spawnPauseMs = (settings && settings.spawnPauseMs) || 800;
    this.celebrationMs = (settings && settings.celebrationMs) || 1200;
    this.winScore = (settings && settings.winScore) || 10;
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.reset();
  }

  resize() {
    this.w = this.canvas.width;
    this.h = this.canvas.height;
  }

  reset() {
    this.score = 0;
    this.won = false;
    this.state = 'NEUTRAL';
    this.holdLeft = 0;          // скільки вже утримується правильний напрямок (мс)
    this.celebrationLeft = 0;   // святкова анімація (мс)
    this.spawnPauseLeft = 0;    // пауза перед наступною їжею (мс)
    this.food = null;
    this.lastDir = null;        // щоб напрямок не повторювався двічі
    this._spawn();
  }

  /** Напрямок, відмінний від попереднього — тренуємо всі сторони рівномірно. */
  _pickDir() {
    const opts = DIR_NAMES.filter((d) => d !== this.lastDir);
    const d = opts[Math.floor(Math.random() * opts.length)];
    this.lastDir = d;
    return d;
  }

  /** Їжа з'являється на краю поля (з протилежного боку від напрямку руху). */
  _spawn() {
    const dir = this._pickDir();
    const m = 16;
    let x = this.w / 2;
    let y = this.h / 2;
    if (dir === 'LEFT') x = this.w - m;
    if (dir === 'RIGHT') x = m;
    if (dir === 'UP') y = this.h - m;
    if (dir === 'DOWN') y = m;
    this.food = {
      x, y, dir,
      emoji: FOOD_EMOJI[Math.floor(Math.random() * FOOD_EMOJI.length)],
    };
    this.holdLeft = 0;
  }

  _catch() {
    this.score += 1;
    this.food = null;
    this.holdLeft = 0;
    if (this.score >= this.winScore) {
      this.won = true;
    } else {
      this.celebrationLeft = this.celebrationMs;
    }
  }

  onState(state) {
    if (this.won) return;
    this.state = state;
  }

  tick(dt) {
    if (this.won) return;
    const ms = dt * 1000;

    if (this.celebrationLeft > 0) {
      this.celebrationLeft -= ms;
      if (this.celebrationLeft <= 0) this.spawnPauseLeft = this.spawnPauseMs;
      return;
    }
    if (this.spawnPauseLeft > 0) {
      this.spawnPauseLeft -= ms;
      if (this.spawnPauseLeft <= 0) this._spawn();
      return;
    }
    if (!this.food) return;

    // Рух їжі до центру
    const d = DIRS[this.food.dir];
    this.food.x += d.dx * this.speed * dt;
    this.food.y += d.dy * this.speed * dt;

    // Утримання правильного напрямку
    if (this.state === this.food.dir) {
      this.holdLeft += ms;
    } else {
      this.holdLeft = 0;
    }
    if (this.holdLeft >= this.holdMs) {
      this._catch();
      return;
    }

    // Їжа дійшла до центру — зникла (не караємо)
    const cx = this.w / 2;
    const cy = this.h / 2;
    const dist = Math.hypot(this.food.x - cx, this.food.y - cy);
    if (dist < 20) {
      this.food = null;
      this.holdLeft = 0;
      this.spawnPauseLeft = this.spawnPauseMs;
    }
  }

  draw() {
    const c = this.ctx;
    const w = this.w;
    const h = this.h;
    const cx = w / 2;
    const cy = h / 2;

    c.fillStyle = '#12121c';
    c.fillRect(0, 0, w, h);

    // Герой у центрі
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const heroSize = Math.min(w, h) * 0.16;
    c.font = `${Math.round(heroSize)}px system-ui, sans-serif`;
    c.fillText(HERO_EMOJI, cx, cy + heroSize * 0.06);

    // Підказка напрямку, звідки їде їжа
    if (this.food) {
      const d = DIRS[this.food.dir];
      const ax = cx + d.dx * heroSize * 0.9;
      const ay = cy + d.dy * heroSize * 0.9;
      c.save();
      c.translate(ax, ay);
      c.rotate(Math.atan2(d.dy, d.dx));
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.beginPath();
      c.moveTo(heroSize * 0.5, 0);
      c.lineTo(-heroSize * 0.3, -heroSize * 0.28);
      c.lineTo(-heroSize * 0.3, heroSize * 0.28);
      c.closePath();
      c.fill();
      c.restore();

      // Прогрес утримання — кільце навколо героя
      if (this.holdLeft > 0) {
        c.beginPath();
        c.arc(cx, cy, heroSize * 0.75, -Math.PI / 2, -Math.PI / 2 + (this.holdLeft / this.holdMs) * Math.PI * 2);
        c.strokeStyle = '#4caf50';
        c.lineWidth = 6;
        c.stroke();
      }
    }

    // Їжа
    if (this.food) {
      const fs = Math.min(w, h) * 0.09;
      c.font = `${Math.round(fs)}px system-ui, sans-serif`;
      c.fillText(this.food.emoji, this.food.x, this.food.y + fs * 0.06);
    }

    // Святкові зірочки після улову
    if (this.celebrationLeft > 0) {
      const t = 1 - this.celebrationLeft / this.celebrationMs; // 0..1
      c.fillStyle = '#ffc800';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = heroSize * 0.9 + t * heroSize * 1.4;
        const sx = cx + Math.cos(a) * r;
        const sy = cy + Math.sin(a) * r;
        c.font = `${Math.round(heroSize * 0.4)}px system-ui, sans-serif`;
        c.fillText('⭐', sx, sy);
      }
    }

    // Рахунок
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillStyle = '#fff';
    c.font = 'bold 20px system-ui, sans-serif';
    c.fillText('Score: ' + this.score + ' / ' + this.winScore, 10, 8);
  }
}
