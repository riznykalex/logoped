// games/drawing.js — «Малювання по сітці».
// Кожен рух язика — один крок курсора вгору/вниз/вліво/вправо по сітці.
// Зразка з цифрами немає: дитина вільно малює лінію між вузлами.
// Тап по полю — очистити малюнок.

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
    this.cols = (settings && settings.cols) || 70; // вузлів у ряді
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this._buildGrid();
    this.cursorR = Math.max(4, Math.min(10, this.cell * 0.7)); // радіус курсора під розмір клітинки
    this.reset();
    // Тап по полю — очистити малюнок
    if (canvas.addEventListener) canvas.addEventListener('pointerdown', () => {
      if (this.trail) this.clear();
    });
  }

  _buildGrid() {
    const cell = this.w / this.cols;
    this.cell = cell;
    this.rows = Math.max(3, Math.round(this.h / cell));
    this.cols = Math.min(this.cols, this.w); // захист від нуля
  }

  resize() {
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    const gx = Math.max(0, Math.min(this.cols - 1, this.gx));
    const gy = Math.max(0, Math.min(this.rows - 1, this.gy));
    this._buildGrid();
    this.gx = Math.min(this.cols - 1, gx);
    this.gy = Math.min(this.rows - 1, gy);
  }

  /** Позиція вузла сітки (gx, gy) в екранних координатах. */
  _nodePos(gx, gy) {
    return { x: (gx + 0.5) * this.cell, y: (gy + 0.5) * this.cell };
  }

  reset() {
    this.state = 'NEUTRAL';
    this.lastDir = null; // останній напрямок — для «крок за рух»
    this.won = false;    // без перемоги — вільне малювання
    this.gx = Math.floor((this.cols - 1) / 2);
    this.gy = Math.floor((this.rows - 1) / 2);
    this.trail = [this._nodePos(this.gx, this.gy)];
    this.steps = 0;
    this.flash = 0; // анімація кроку
  }

  /** Очистити малюнок (курсор залишається на місці). */
  clear() {
    this.trail = [this._nodePos(this.gx, this.gy)];
    this.steps = 0;
    this.flash = 1;
  }

  onState(state) {
    this.state = state;
    // Один рух язика = один крок (не «затриманий» повтор)
    if (DIRS[state] && state !== this.lastDir) {
      this._step(DIRS[state]);
    }
    this.lastDir = state;
  }

  _step(d) {
    this.gx = Math.max(0, Math.min(this.cols - 1, this.gx + d.dx));
    this.gy = Math.max(0, Math.min(this.rows - 1, this.gy + d.dy));
    this.trail.push(this._nodePos(this.gx, this.gy));
    if (this.trail.length > 4000) this.trail.splice(0, this.trail.length - 4000);
    this.steps += 1;
    this.flash = 1;
  }

  tick(dt) {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
  }

  draw() {
    const c = this.ctx;
    const w = this.w;
    const h = this.h;

    c.fillStyle = '#101018';
    c.fillRect(0, 0, w, h);

    // Лінії сітки
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.lineWidth = 1;
    c.beginPath();
    for (let gx = 0; gx < this.cols; gx++) {
      const x = (gx + 0.5) * this.cell;
      c.moveTo(x, 0);
      c.lineTo(x, h);
    }
    for (let gy = 0; gy < this.rows; gy++) {
      const y = (gy + 0.5) * this.cell;
      c.moveTo(0, y);
      c.lineTo(w, y);
    }
    c.stroke();

    // Вузли сітки (крапки-орієнтири; при дрібній сітці — кожен 4-й вузол)
    const dotR = Math.max(0.8, Math.min(2.5, this.cell * 0.15));
    const dotStep = this.cell >= 12 ? 1 : 4;
    c.fillStyle = 'rgba(255,255,255,0.22)';
    for (let gx = 0; gx < this.cols; gx += dotStep) {
      for (let gy = 0; gy < this.rows; gy += dotStep) {
        const p = this._nodePos(gx, gy);
        c.beginPath();
        c.arc(p.x, p.y, dotR, 0, Math.PI * 2);
        c.fill();
      }
    }

    // Слід пера (лінія між вузлами)
    c.strokeStyle = '#4caf50';
    c.lineWidth = Math.max(2, Math.min(5, this.cell * 0.5));
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    this.trail.forEach((p, i) => {
      if (i === 0) c.moveTo(p.x, p.y);
      else c.lineTo(p.x, p.y);
    });
    c.stroke();

    // Курсор
    const pos = this._nodePos(this.gx, this.gy);
    const r = this.cursorR * (1 + this.flash * 0.2);
    c.beginPath();
    c.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    c.fillStyle = this.state === 'OPENED' ? '#ffc800' : '#ffffff';
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = '#000';
    c.stroke();

    // Підказка
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font = 'bold 16px system-ui, sans-serif';
    c.fillText('Кроки язиком: ' + this.steps, 10, 8);
    c.font = '13px system-ui, sans-serif';
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillText('вгору · вниз · вліво · вправо   —   тап по полю = очистити', 10, 32);
  }
}
