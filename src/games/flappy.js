// games/flappy.js — «Flappy Bird» (полегшений): пташка ширяє низько над
// землею і НЕ падає, коли язик у нейтралі. Керування:
//   UP    — летіти вгору
//   DOWN  — летіти вниз
//   LEFT  — гальмувати (швидкість труб падає майже до зупинки)
//   RIGHT — прискорювати (рух уперед)
// Гра починається повільно (startSpeed) і природно прискорюється за кожну
// пройдену трубу. Зіткнення з трубою — миттєвий автоматичний рестарт.
// Земля/стеля не вбивають — позиція обмежена. Перемоги немає — гра нескінченна.

export class FlappyGame {
  constructor(settings, canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.startSpeed = (settings && settings.startSpeed) || 55; // повільний старт, px/с
    this.maxSpeed = (settings && settings.maxSpeed) || 160;
    this.minSpeed = (settings && settings.minSpeed) || 8;      // LEFT майже зупиняє
    this.accel = (settings && settings.accel) || 90;          // RIGHT, px/с²
    this.decel = (settings && settings.decel) || 140;         // LEFT, px/с²
    this.rampPerPipe = (settings && settings.rampPerPipe) || 3; // пришвидшення за трубу
    this.climbSpeed = (settings && settings.climbSpeed) || 170; // вертикаль UP/DOWN, px/с
    this.hoverAbove = (settings && settings.hoverAbove) || 70;  // висота ширяння над землею
    this.spring = (settings && settings.spring) || 9;           // повернення до ширяння, 1/с
    this.damp = (settings && settings.damp) || 0.92;            // гасіння коливань
    this.gap = (settings && settings.gap) || 200;               // прохід між трубами, px
    this.spacing = (settings && settings.spacing) || 240;       // крок між трубами, px
    this.pipeWidth = (settings && settings.pipeWidth) || 60;
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.reset();
  }

  resize() {
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.groundH = Math.max(70, this.h * 0.12);
    this.hoverY = this.h - this.groundH - this.hoverAbove;
    this.by = this.hoverY;
  }

  reset() {
    this.state = 'NEUTRAL';
    this.won = false;
    this.groundH = Math.max(70, this.h * 0.12);
    this.hoverY = this.h - this.groundH - this.hoverAbove;
    this.bx = Math.max(40, this.w * 0.28);
    this.by = this.hoverY;      // старт на рівні ширяння, а не падіння
    this.vy = 0;
    this.r = Math.max(12, Math.min(this.w, this.h) * 0.03);
    this.speed = this.startSpeed; // гра починається повільно
    this.score = 0;
    this.pipes = [];
    this.hitFlash = 0;
    this._spawnPipe(this.w + 80);
  }

  _spawnPipe(x) {
    // Прохід може зсуватися по вертикалі, але не впритул до землі/стелі,
    // щоб пташка на рівні ширяння могла проходити деякі труби без підйому
    const avail = this.h - this.groundH - this.gap;
    const margin = 30;
    const top = margin + Math.random() * Math.max(1, avail - 2 * margin);
    this.pipes.push({ x, top, scored: false });
  }

  onState(state) {
    this.state = state;
  }

  tick(dt) {
    // --- Швидкість: LEFT гальмує, RIGHT прискорює ---
    if (this.state === 'LEFT') {
      this.speed = Math.max(this.minSpeed, this.speed - this.decel * dt);
    } else if (this.state === 'RIGHT') {
      this.speed = Math.min(this.maxSpeed, this.speed + this.accel * dt);
    }

    // --- Висота: UP вгору, DOWN вниз, інакше пружина до рівня ширяння ---
    if (this.state === 'UP') {
      this.by -= this.climbSpeed * dt;
      this.vy = -this.climbSpeed;
    } else if (this.state === 'DOWN') {
      this.by += this.climbSpeed * dt;
      this.vy = this.climbSpeed;
    } else {
      this.vy += (this.hoverY - this.by) * this.spring * dt;
      this.vy *= Math.pow(this.damp, dt * 60);
      this.by += this.vy * dt;
    }
    // Земля/стеля не вбивають — лише обмеження
    this.by = Math.max(this.r, Math.min(this.h - this.groundH - this.r, this.by));

    // --- Труби ---
    for (const p of this.pipes) p.x -= this.speed * dt;
    const last = this.pipes[this.pipes.length - 1];
    if (!last || last.x < this.w - this.spacing) this._spawnPipe(this.w + 20);
    this.pipes = this.pipes.filter((p) => p.x + this.pipeWidth > -20);

    // Рахунок і природне пришвидшення за пройдену трубу
    for (const p of this.pipes) {
      if (!p.scored && p.x + this.pipeWidth < this.bx - this.r) {
        p.scored = true;
        this.score += 1;
        this.speed = Math.min(this.maxSpeed, this.speed + this.rampPerPipe);
      }
    }

    // Зіткнення з трубою → автоматичний рестарт
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

    // Лінія ширяння (підказка рівня)
    c.strokeStyle = 'rgba(255,255,255,0.15)';
    c.lineWidth = 1;
    c.setLineDash([4, 8]);
    c.beginPath();
    c.moveTo(0, this.hoverY);
    c.lineTo(w, this.hoverY);
    c.stroke();
    c.setLineDash([]);

    // Пташка (повертається за вертикальною швидкістю)
    c.save();
    c.translate(this.bx, this.by);
    c.rotate(Math.max(-0.5, Math.min(0.5, -this.vy * 0.0015)));
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

    // Швидкість (зворотний зв'язок LEFT/RIGHT)
    c.font = '14px system-ui, sans-serif';
    c.fillStyle = '#ffc800';
    c.fillText('◄◄ ' + Math.round(this.speed) + ' px/с ►►', 10, 34);
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
