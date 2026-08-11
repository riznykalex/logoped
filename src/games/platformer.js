// games/platformer.js — «Платформер»: герой біжить управо автоматично.
// UP — стрибок (перестрибнути низьку перешкоду), DOWN — присісти
// (пройти під високою балкою), LEFT — сповільнитись, RIGHT — прискоритись.
// Зіткнення не вбиває: відштовхування + пауза зростання рахунку.
// Рахунок = пройдена відстань. Перемоги немає — гра нескінченна.

const DIRS = {
  UP: { dx: 0, dy: -1 },
  DOWN: { dx: 0, dy: 1 },
  LEFT: { dx: -1, dy: 0 },
  RIGHT: { dx: 1, dy: 0 },
};

export class PlatformerGame {
  constructor(settings, canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.baseSpeed = (settings && settings.baseSpeed) || 160; // px/с
    this.boostSpeed = (settings && settings.boostSpeed) || 60;
    this.slowSpeed = (settings && settings.slowSpeed) || 60;
    this.jumpVel = (settings && settings.jumpVel) || 560;
    this.gravity = (settings && settings.gravity) || 1400;
    this.spawnLead = (settings && settings.spawnLead) || 80;   // спавн за краєм екрана
    this.spacing = (settings && settings.spacing) || 300;      // крок між перешкодами
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.reset();
  }

  resize() {
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.groundY = this.h - 70;
  }

  reset() {
    this.state = 'NEUTRAL';
    this.won = false;
    this.score = 0;           // пройдена відстань
    this.dist = 0;
    this.groundY = this.h - 70;
    this.px = 110;            // екранна позиція героя (x фіксований)
    this.py = this.groundY;
    this.vy = 0;
    this.crouched = false;
    this.bumpLeft = 0;        // відштовхування після зіткнення (мс)
    this.warn = 800;          // мигання перешкоди до появи (мс)
    this.obstacles = [];
    this.lastType = null;
  }

  _worldSpeed() {
    let s = this.baseSpeed;
    if (this.state === 'RIGHT') s += this.boostSpeed;
    if (this.state === 'LEFT') s -= this.slowSpeed;
    if (this.bumpLeft > 0) s *= 0.35;
    return Math.max(40, s);
  }

  _playerBox() {
    const h = this.crouched ? 24 : 46;
    return { x: this.px - 12, y: this.py - h, w: 30, h };
  }

  _spawnObstacle() {
    const type = this.lastType === 'LOW' ? 'HIGH' : 'LOW';
    this.lastType = type;
    this.obstacles.push({ x: this.w + this.spawnLead, type, warnLeft: this.warn });
  }

  onState(state) {
    this.state = state;
    if (state === 'DOWN') {
      this.crouched = true;
      // під час присідання зменшуємо висоту, виправляючи «протискання» в землю
      if (this.py > this.groundY - 24) this.py = this.groundY - 24;
    } else if (state === 'UP') {
      if (this.py >= this.groundY - 0.5) this.vy = -this.jumpVel;
    } else {
      this.crouched = false;
    }
  }

  tick(dt) {
    const ms = dt * 1000;

    // Гравітація та рух по вертикалі
    this.vy += this.gravity * dt;
    this.py += this.vy * dt;
    if (this.py >= this.groundY) {
      this.py = this.groundY;
      this.vy = 0;
    }
    // межа зверху
    if (this.py < 20) {
      this.py = 20;
      this.vy = 0;
    }

    // Рух світу
    const speed = this._worldSpeed();
    if (this.bumpLeft > 0) this.bumpLeft -= ms;
    this.dist += speed * dt;
    this.score = Math.floor(this.dist / 10);

    // Перешкоди рухаються ліворуч
    for (const o of this.obstacles) {
      o.x -= speed * dt;
      if (o.warnLeft > 0) o.warnLeft -= ms;
    }
    this.obstacles = this.obstacles.filter((o) => o.x > -80);

    // Спавн перешкоди попереду (з кроком spacing)
    const last = this.obstacles[this.obstacles.length - 1];
    if (!last || last.x < this.w + this.spawnLead - this.spacing) this._spawnObstacle();

    // Зіткнення: відштовхування (різке гальмування світу), а не смерть
    const box = this._playerBox();
    for (const o of this.obstacles) {
      if (this._hit(o, box)) {
        this.bumpLeft = 600;
        break;
      }
    }
  }

  /** AABB: перешкода залежить від типу. */
  _hit(o, box) {
    const g = this.groundY;
    let ob;
    if (o.type === 'LOW') {
      ob = { x: o.x, y: g - 30, w: 34, h: 30 };
    } else {
      // Висока балка згори — прохід знизу лише для присідання (24 < 36)
      ob = { x: o.x, y: 0, w: 40, h: g - 36 };
    }
    return box.x < ob.x + ob.w && box.x + box.w > ob.x &&
           box.y < ob.y + ob.h && box.y + box.h > ob.y;
  }

  draw() {
    const c = this.ctx;
    const w = this.w;
    const g = this.groundY;

    c.fillStyle = '#12121c';
    c.fillRect(0, 0, w, this.h);

    // Земля
    c.fillStyle = '#1e1e2e';
    c.fillRect(0, g, w, this.h - g);
    c.fillStyle = '#3a3a52';
    c.fillRect(0, g, w, 3);

    // Перешкоди (блимають під час попередження)
    for (const o of this.obstacles) {
      const warn = o.warnLeft > 0;
      const alpha = warn ? (Math.floor(performance.now() / 200) % 2 ? 0.35 : 0.8) : 1;
      c.globalAlpha = alpha;
      if (o.type === 'LOW') {
        c.fillStyle = '#7a5a2a';
        c.fillRect(o.x, g - 30, 34, 30);
        c.strokeStyle = '#c8a04a';
        c.lineWidth = 2;
        c.strokeRect(o.x, g - 30, 34, 30);
      } else {
        c.fillStyle = '#3a4a7a';
        c.fillRect(o.x, 0, 40, g - 36);
        c.strokeStyle = '#7a9ac8';
        c.lineWidth = 2;
        c.strokeRect(o.x, 0, 40, g - 36);
        // червона смуга — під нею треба присісти
        c.fillStyle = '#c84a4a';
        c.fillRect(o.x, g - 38, 40, 4);
      }
      c.globalAlpha = 1;
    }

    // Герой
    const size = this.crouched ? 34 : 46;
    c.font = `${size}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('🦖', this.px, this.py - size * 0.55);

    // Тряска при зіткненні
    if (this.bumpLeft > 0) {
      c.fillStyle = 'rgba(255,92,92,0.25)';
      c.font = 'bold 16px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText('💥', this.px, this.py - size - 24);
    }

    // Рахунок
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillStyle = '#fff';
    c.font = 'bold 20px system-ui, sans-serif';
    c.fillText('Score: ' + this.score, 10, 8);
  }
}
