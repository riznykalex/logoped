// games/drawing.js — «Малювання»: графічний редактор, де з'єднуємо точки.
// Курсор рухається язиком (UP/DOWN/LEFT/RIGHT) і вільно малює лінію
// (перо завжди опущене — як у редакторі). Точки фігури — орієнтири-магніти:
// у межах snapRadius курсор притягується до точки, щоб лінія лягла точно.
// Коли відвідані всі точки фігури — малюнок готовий (перемога).

const DIRS = {
  UP: { dx: 0, dy: -1 },
  DOWN: { dx: 0, dy: 1 },
  LEFT: { dx: -1, dy: 0 },
  RIGHT: { dx: 1, dy: 0 },
};

// Точки у нормалізованих координатах 0..1 (x, y).
const SHAPES = [
  {
    name: 'Зірочка',
    points: [
      [0.50, 0.06], [0.61, 0.32], [0.89, 0.33], [0.67, 0.50],
      [0.74, 0.78], [0.50, 0.62], [0.26, 0.78], [0.33, 0.50],
      [0.11, 0.33], [0.39, 0.32],
    ],
  },
  {
    name: 'Сердечко',
    points: [
      [0.50, 0.72], [0.33, 0.88], [0.15, 0.70], [0.11, 0.52],
      [0.18, 0.33], [0.35, 0.25], [0.50, 0.40], [0.65, 0.25],
      [0.82, 0.33], [0.89, 0.52], [0.85, 0.70], [0.67, 0.88],
    ],
  },
  {
    name: 'Будиночок',
    points: [
      [0.25, 0.78], [0.25, 0.45], [0.50, 0.18], [0.75, 0.45], [0.75, 0.78],
      [0.43, 0.78], [0.43, 0.56], [0.57, 0.56], [0.57, 0.78],
    ],
  },
];

export class DrawingGame {
  constructor(settings, canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.speed = (settings && settings.cursorSpeed) || 120;    // швидкість курсора px/с
    this.snapRadius = (settings && settings.snapRadius) || 40; // магніт точки, px
    this.visitRadius = (settings && settings.visitRadius) || 34; // зарахування точки, px
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.reset();
  }

  resize() {
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this._buildShape();
  }

  reset() {
    this.state = 'NEUTRAL';
    this.won = false;
    this.visited = 0;        // скільки точок відвідано
    this.pulse = 0;          // анімація при відвідуванні точки
    this.trail = [];         // [{x, y, pen}] слід пера
    this._buildShape();
  }

  /** Обирає фігуру, масштабує точки під поле (центрований квадрат),
   *  курсор стартує на першій точці. */
  _buildShape() {
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    this.shapeName = shape.name;
    const size = Math.min(this.w, this.h) * 0.72;
    const ox = (this.w - size) / 2;
    const oy = (this.h - size) / 2;
    this.points = shape.points.map(([px, py]) => ({
      x: ox + px * size,
      y: oy + py * size,
    }));
    this.dotHit = this.points.map(() => false);
    const p0 = this.points[0];
    this.x = p0.x;
    this.y = p0.y;
    this.prevPen = false;
    this.trail = [{ x: this.x, y: this.y, pen: false }];
  }

  onState(state) {
    if (this.won) return;
    this.state = state;
  }

  tick(dt) {
    if (this.won) return;
    const d = DIRS[this.state];
    if (d) {
      this.x += d.dx * this.speed * dt;
      this.y += d.dy * this.speed * dt;
      this.x = Math.max(0, Math.min(this.w, this.x));
      this.y = Math.max(0, Math.min(this.h, this.y));
    }

    // Перо опущене, доки курсор рухається (вільне малювання)
    const pen = !!d;
    this.trail.push({ x: this.x, y: this.y, pen });
    this.prevPen = pen;
    if (this.trail.length > 8000) this.trail.splice(0, this.trail.length - 8000);

    // Магніт: притягує до найближчої невідвіданої точки
    for (let i = 0; i < this.points.length; i++) {
      if (this.dotHit[i]) continue;
      const p = this.points[i];
      if (Math.hypot(this.x - p.x, this.y - p.y) < this.snapRadius) {
        this.x = p.x;
        this.y = p.y;
        break;
      }
    }

    // Зарахування точок у радіусі
    for (let i = 0; i < this.points.length; i++) {
      if (this.dotHit[i]) continue;
      const p = this.points[i];
      if (Math.hypot(this.x - p.x, this.y - p.y) < this.visitRadius) {
        this.dotHit[i] = true;
        this.visited += 1;
        this.pulse = 1;
      }
    }
    if (this.visited >= this.points.length) this.won = true;

    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - dt * 3);
  }

  draw() {
    const c = this.ctx;
    const w = this.w;
    const h = this.h;

    c.fillStyle = '#101018';
    c.fillRect(0, 0, w, h);

    // Сітка графічного редактора
    c.strokeStyle = 'rgba(255,255,255,0.06)';
    c.lineWidth = 1;
    const step = 40;
    c.beginPath();
    for (let x = step; x < w; x += step) { c.moveTo(x, 0); c.lineTo(x, h); }
    for (let y = step; y < h; y += step) { c.moveTo(0, y); c.lineTo(w, y); }
    c.stroke();

    // Пунктирна лінія-підказка між точками фігури
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 2;
    c.setLineDash([6, 6]);
    c.beginPath();
    this.points.forEach((p, i) => {
      if (i === 0) c.moveTo(p.x, p.y);
      else c.lineTo(p.x, p.y);
    });
    c.stroke();
    c.setLineDash([]);

    // Слід пера (безперервна лінія малювання)
    c.strokeStyle = '#4caf50';
    c.lineWidth = 4;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    let drawing = false;
    for (const s of this.trail) {
      if (s.pen) {
        if (!drawing) { c.moveTo(s.x, s.y); drawing = true; }
        else c.lineTo(s.x, s.y);
      } else {
        drawing = false;
      }
    }
    c.stroke();

    // Точки фігури з номерами
    this.points.forEach((p, i) => {
      const done = this.dotHit[i];
      const r = this.visitRadius * (done ? 1 : 1 + this.pulse * 0.25);
      c.beginPath();
      c.arc(p.x, p.y, r, 0, Math.PI * 2);
      c.fillStyle = done ? '#1a3a1a' : '#2a2a3e';
      c.fill();
      c.strokeStyle = done ? '#4caf50' : '#777';
      c.lineWidth = 2;
      c.stroke();
      c.fillStyle = done ? '#8fd08f' : '#999';
      c.font = `bold ${Math.max(12, this.visitRadius * 0.7)}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(i + 1), p.x, p.y + 1);
    });

    // Курсор
    c.beginPath();
    c.arc(this.x, this.y, 10, 0, Math.PI * 2);
    c.fillStyle = this.state === 'OPENED' ? '#ffc800' : '#fff';
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = '#000';
    c.stroke();

    // Підказка: скільки точок з'єднано
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillStyle = '#fff';
    c.font = 'bold 20px system-ui, sans-serif';
    c.fillText(
      'Точки: ' + this.visited + ' / ' + this.points.length + ' (' + this.shapeName + ')',
      10, 8,
    );
  }
}
