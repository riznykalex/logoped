// games/joystick.js — перенесення поточної гри: курсор керується язиком
// (UP/DOWN/LEFT/RIGHT), треба ловити червону ціль. NEUTRAL = курсор стоїть.
// Інтерфейс з games-spec.md: constructor(settings, canvas), onState, tick, reset.

export class JoystickGame {
  constructor(settings, canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = canvas.width;
    this.h = canvas.height;
    this.speed = (settings && settings.speed) || 8.0;
    this.catchDist = (settings && settings.catchDist) || 22;
    this.targetTimeout = (settings && settings.targetTimeout) || 6.0;
    this.reset();
  }

  reset() {
    this.px = this.w / 2;
    this.py = this.h / 2;
    this.score = 0;
    this.state = 'NEUTRAL';
    this.targetAge = 0;
    this.flash = 0;
    this._newTarget();
  }

  _newTarget() {
    this.tx = 20 + Math.random() * (this.w - 40);
    this.ty = 20 + Math.random() * (this.h - 40);
    this.targetAge = 0;
  }

  onState(state) {
    this.state = state;
  }

  tick(dt) {
    const s = this.speed;
    if (this.state === 'UP') this.py -= s;
    else if (this.state === 'DOWN') this.py += s;
    else if (this.state === 'LEFT') this.px -= s;
    else if (this.state === 'RIGHT') this.px += s;
    this.px = Math.max(12, Math.min(this.w - 12, this.px));
    this.py = Math.max(12, Math.min(this.h - 12, this.py));

    this.targetAge += dt;
    if (Math.abs(this.px - this.tx) < this.catchDist && Math.abs(this.py - this.ty) < this.catchDist) {
      this.score += 1;
      this.flash = 0.4;
      this._newTarget();
    } else if (this.targetAge > this.targetTimeout) {
      this._newTarget();
    }
    if (this.flash > 0) this.flash -= dt;
  }

  draw() {
    const c = this.ctx;
    c.fillStyle = '#12121c';
    c.fillRect(0, 0, this.w, this.h);
    c.strokeStyle = '#78788c';
    c.strokeRect(0.5, 0.5, this.w - 1, this.h - 1);

    // Ціль
    c.fillStyle = '#dc0000';
    c.beginPath();
    c.arc(this.tx, this.ty, 14, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ff5c5c';
    c.beginPath();
    c.arc(this.tx, this.ty, 7, 0, Math.PI * 2);
    c.fill();

    // Курсор (язик)
    const col = this.flash > 0 ? '#ffff00' : '#00ff00';
    c.fillStyle = col;
    c.beginPath();
    c.arc(this.px, this.py, 8, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#000';
    c.lineWidth = 1;
    c.stroke();

    // Рахунок
    c.fillStyle = '#fff';
    c.font = 'bold 20px system-ui, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillText('Score: ' + this.score, 10, 8);
  }
}
