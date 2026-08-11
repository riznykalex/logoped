// games/flappy.js — «Flappy Bird»: пташка падає під дією гравітації,
// мах крилом — будь-який напрямок язика (UP/DOWN/LEFT/RIGHT): щоразу,
// коли язик виходить із нейтралі в напрямок, пташка підстрибує.
// Зіткнення з трубою або землею — миттєвий автоматичний рестарт.
// Рахунок = пройдені труби. Перемоги немає — гра нескінченна.

export class FlappyGame {
  constructor(settings, canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gravity = (settings && settings.gravity) || 1500; // px/с²
    this.flapVel = (settings && settings.flapVel) || 420;  // імпульс маху, px/с
    this.pipeSpeed = (settings && settings.pipeSpeed) || 140;
    this.gap = (settings && settings.gap) || 170;          // прохід між трубами, px
    this.spacing = (settings && settings.spacing) || 230;  // крок між трубами, px
    this.pipeWidth = (settings && settings.pipeWidth) || 60;
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.reset();
  }

  resize() {
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.groundH = Math.max(70, this.h * 0.12);
  }

  reset() {
    this.state = 'NEUTRAL';
    this.won = false;
    this.groundH = Math.max(70, this.h * 0.12);
    this.bx = Math.max(40, this.w * 0.28);
    this.by = this.h / 2;
    this.vy = 0;
    this.r = Math.max(12, Math.min(this.w, this.h) * 0.03);
    this.score = 0;
    this.pipes = [];
    this.hitFlash = 0;   // короткий червоний спалах при зіткненні
    this.lastWasDir = false;
    this._spawnPipe(this.w + 80);
  }

  _spawnPipe(x) {
    const minTop = this.gap * 0.4 + 10;
    const maxTop = this.h - this.groundH - this.gap - this.gap * 0.4;
    const top = minTop + Math.random() * Math.max(10, maxTop - minTop);
    this.pipes.push({ x, top, scored: false });
  }

  onState(state) {
    const isDir = state === 'UP' || state === 'DOWN' || state === 'LEFT' || state === 'RIGHT';
    // Висхідний фронт: будь-який напрямок язика = мах крилом
    if (isDir && !this.lastWasDir) this.vy = -this.flapVel;
    this.lastWasDir = isDir;
    this.state = state;
  }

  tick(dt) {
    // Гравітація
    this.vy += this.gravity * dt;
    this.by += this.vy * dt;

    // Труби рухаються вліво
    for (const p of this.pipes) p.x -= this.pipeSpeed * dt;
    const last = this.pipes[this.pipes.length - 1];
    if (!last || last.x < this.w - this.spacing) this._spawnPipe(this.w + 20);
    this.pipes = this.pipes.filter((p) => p.x + this.pipeWidth > -20);

    // Рахунок: труба пройдена
    for (const p of this.pipes) {
      if (!p.scored && p.x + this.pipeWidth < this.bx - this.r) {
        p.scored = true;
        this.score += 1;
      }
    }

    // Зіткнення: земля / стеля / труби → миттєвий рестарт
    const groundY = this.h - this.groundH;
    if (this.by + this.r >= groundY || this.by - this.r <= 0) {
      this.reset();
      this.hitFlash = 1;
      return;
    }
    for (const p of this.pipes) {
      if (this._hitPipe(p)) {
        this.reset();
        this.hitFlash = 1;
        return;
      }
    }

    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
  }

  _hitPipe(p) {
    const groundY = this.h - this.groundH;
    const upper = { x: p.x, y: 0, w: this.pipeWidth, h: p.top };
    const lower = { x: p.x, y: p.top + p.gap, w: this.pipeWidth, h: groundY - (p.top + p.gap) };
    return this._circleRect(upper) || this._circleRect(lower);
  }

  _circleRect(rect) {
    const nx = Math.max(rect.x, Math.min(this.bx, rect.x + rect.w));
    const ny = Math.max(rect.y, Math.min(this.by, rect.y + rect.h));
    return Math.hypot(this.bx - nx, this.by - ny) < this.r;
  }

  draw() {
    const c = this.ctx;
    const w = this.w;
    const h = this.h;
    const groundY = h - this.groundH;

    // Небо
    const grad = c.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1c2a4a');
    grad.addColorStop(1, '#3a5a8a');
    c.fillStyle = grad;
    c.fillRect(0, 0, w, h);

    // Труби
    for (const p of this.pipes) {
      this._pipe(p.x, 0, p.top, true);
      this._pipe(p.x, p.top + p.gap, groundY - (p.top + p.gap), false);
    }

    // Земля
    c.fillStyle = '#2a3a1a';
    c.fillRect(0, groundY, w, this.groundH);
    c.fillStyle = '#4caf50';
    c.fillRect(0, groundY, w, 4);

    // Пташка (повертається за швидкістю)
    c.save();
    c.translate(this.bx, this.by);
    c.rotate(Math.max(-0.6, Math.min(1.1, this.vy * 0.002)));
    c.font = `${Math.round(this.r * 2.4)}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('🐤', 0, this.r * 0.1);
    c.restore();

    // Спалах при зіткненні
    if (this.hitFlash > 0) {
      c.fillStyle = 'rgba(255,60,60,' + (0.35 * this.hitFlash).toFixed(3) + ')';
      c.fillRect(0, 0, w, h);
    }

    // Рахунок
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillStyle = '#fff';
    c.font = 'bold 20px system-ui, sans-serif';
    c.fillText('Score: ' + this.score, 10, 8);
  }

  _pipe(x, y, hh, isUpper) {
    const c = this.ctx;
    c.fillStyle = '#3a8a3a';
    c.fillRect(x, y, this.pipeWidth, hh);
    c.fillStyle = '#5ab85a';
    const cap = 22;
    if (isUpper) c.fillRect(x - 4, y + hh - cap, this.pipeWidth + 8, cap);
    else c.fillRect(x - 4, y, this.pipeWidth + 8, cap);
    c.strokeStyle = '#2a5a2a';
    c.lineWidth = 2;
    c.strokeRect(x, y, this.pipeWidth, hh);
  }
}
