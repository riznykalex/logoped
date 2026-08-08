// games/snake.js — змійка з керуванням язиком.
// UP/DOWN/LEFT/RIGHT — напрямок; NEUTRAL — пауза (терапевтична вимога:
// повільне, навмисне керування). Рух дискретний по сітці: повільний темп
// (stepMs), але великий крок (великі клітинки). Голова — 🐸, їжа —
// випадковий фрукт. Game over немає: стіни — wrap, самоперетин — захист.

const FRUITS = ['🍇', '🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍎', '🍏', '🍐', '🍑', '🍒', '🍓', '🥝'];
const HEAD_EMOJI = '🐸';

const DIRS = {
  UP: { dx: 0, dy: -1 },
  DOWN: { dx: 0, dy: 1 },
  LEFT: { dx: -1, dy: 0 },
  RIGHT: { dx: 1, dy: 0 },
};

export class SnakeGame {
  constructor(settings, canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cols = (settings && settings.cols) || 10;
    this.rows = (settings && settings.rows) || 11;
    this.stepMs = (settings && settings.stepMs) || 450;
    this.reset();
  }

  reset() {
    const cx = Math.floor(this.cols / 2);
    const cy = Math.floor(this.rows / 2);
    this.snake = [
      { x: cx, y: cy },
      { x: cx - 1, y: cy },
      { x: cx - 2, y: cy },
    ];
    this.dir = { dx: 1, dy: 0 };
    this.state = 'NEUTRAL';
    this.accum = 0;
    this.score = 0;
    this.fruit = null;
    this._spawnFruit();
  }

  _spawnFruit() {
    const free = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (!this.snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
      }
    }
    if (!free.length) return;
    const cell = free[Math.floor(Math.random() * free.length)];
    this.fruit = { x: cell.x, y: cell.y, emoji: FRUITS[Math.floor(Math.random() * FRUITS.length)] };
  }

  onState(state) {
    this.state = state;
    const d = DIRS[state];
    if (!d) return; // NEUTRAL / OPENED — напрямок не змінюємо
    if (this.snake.length > 1) {
      const neck = this.snake[1];
      if (this.snake[0].x + d.dx === neck.x && this.snake[0].y + d.dy === neck.y) return;
    }
    this.dir = d;
  }

  tick(dt) {
    if (!DIRS[this.state]) return; // пауза, поки язик не спрямований у бік
    this.accum += dt * 1000;
    while (this.accum >= this.stepMs) {
      this.accum -= this.stepMs;
      this._step();
    }
  }

  _step() {
    const head = this.snake[0];
    const nx = (head.x + this.dir.dx + this.cols) % this.cols;
    const ny = (head.y + this.dir.dy + this.rows) % this.rows;
    if (this.snake.some((s) => s.x === nx && s.y === ny)) return; // захист
    this.snake.unshift({ x: nx, y: ny });
    if (this.fruit && nx === this.fruit.x && ny === this.fruit.y) {
      this.score += 1;
      this._spawnFruit();
    } else {
      this.snake.pop();
    }
  }

  draw() {
    const c = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cw = w / this.cols;
    const ch = h / this.rows;
    c.fillStyle = '#12121c';
    c.fillRect(0, 0, w, h);

    c.strokeStyle = 'rgba(255,255,255,0.05)';
    c.lineWidth = 1;
    for (let x = 1; x < this.cols; x++) {
      c.beginPath(); c.moveTo(x * cw, 0); c.lineTo(x * cw, h); c.stroke();
    }
    for (let y = 1; y < this.rows; y++) {
      c.beginPath(); c.moveTo(0, y * ch); c.lineTo(w, y * ch); c.stroke();
    }

    for (let i = this.snake.length - 1; i >= 1; i--) {
      const s = this.snake[i];
      const a = 0.85 - (i / this.snake.length) * 0.35;
      c.fillStyle = `rgba(56, 200, 90, ${a})`;
      c.beginPath();
      c.roundRect(s.x * cw + 2, s.y * ch + 2, cw - 4, ch - 4, 6);
      c.fill();
    }

    if (this.snake.length) {
      const hd = this.snake[0];
      this._emoji(hd.x * cw + cw / 2, hd.y * ch + ch / 2, cw, HEAD_EMOJI);
    }
    if (this.fruit) {
      this._emoji(this.fruit.x * cw + cw / 2, this.fruit.y * ch + ch / 2, cw, this.fruit.emoji);
    }

    c.fillStyle = '#fff';
    c.font = 'bold 20px system-ui, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillText('Score: ' + this.score, 10, 8);
  }

  _emoji(x, y, size, emoji) {
    const c = this.ctx;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `${Math.round(size * 0.9)}px system-ui, sans-serif`;
    c.fillText(emoji, x, y + size * 0.06);
    c.textAlign = 'left';
    c.textBaseline = 'top';
  }
}
