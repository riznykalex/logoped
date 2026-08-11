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
    this.baseStepMs = (settings && settings.stepMs) || 900;
    this.speedupPerFruit = (settings && settings.speedupPerFruit) || 30;
    this.minStepMs = (settings && settings.minStepMs) || 300;
    this.winScore = (settings && settings.winScore) || 12;
    this._layout();
    this.reset();
  }

  /** Квадратні клітинки + центрування поля на будь-якому співвідношенні сторін. */
  _layout() {
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.cell = Math.min(this.w / this.cols, this.h / this.rows);
    this.ox = (this.w - this.cols * this.cell) / 2;
    this.oy = (this.h - this.rows * this.cell) / 2;
  }

  /** Викликається, коли розмір канваса змінився (поворот/повноекранний режим). */
  resize() {
    this._layout();
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
    this.won = false;
    this.stepMs = this.baseStepMs;
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
    if (this.won) return; // після перемоги керування ігнорується
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
    if (this.won || !DIRS[this.state]) return; // пауза або перемога
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
      this.stepMs = Math.max(this.minStepMs, this.stepMs - this.speedupPerFruit);
      if (this.score >= this.winScore) {
        this.won = true;
        this.fruit = null; // перемога — гра завершена
      } else {
        this._spawnFruit();
      }
    } else {
      this.snake.pop();
    }
  }

  draw() {
    const c = this.ctx;
    const w = this.w;
    const h = this.h;
    const cell = this.cell;
    const ox = this.ox;
    const oy = this.oy;
    c.fillStyle = '#12121c';
    c.fillRect(0, 0, w, h);

    c.strokeStyle = 'rgba(255,255,255,0.05)';
    c.lineWidth = 1;
    for (let x = 1; x < this.cols; x++) {
      c.beginPath(); c.moveTo(ox + x * cell, oy); c.lineTo(ox + x * cell, oy + this.rows * cell); c.stroke();
    }
    for (let y = 1; y < this.rows; y++) {
      c.beginPath(); c.moveTo(ox, oy + y * cell); c.lineTo(ox + this.cols * cell, oy + y * cell); c.stroke();
    }

    for (let i = this.snake.length - 1; i >= 1; i--) {
      const s = this.snake[i];
      const a = 0.85 - (i / this.snake.length) * 0.35;
      c.fillStyle = `rgba(56, 200, 90, ${a})`;
      c.beginPath();
      c.roundRect(ox + s.x * cell + 2, oy + s.y * cell + 2, cell - 4, cell - 4, 6);
      c.fill();
    }

    if (this.snake.length) {
      const hd = this.snake[0];
      this._emoji(ox + hd.x * cell + cell / 2, oy + hd.y * cell + cell / 2, cell, HEAD_EMOJI);
    }
    if (this.fruit) {
      this._emoji(ox + this.fruit.x * cell + cell / 2, oy + this.fruit.y * cell + cell / 2, cell, this.fruit.emoji);
    }

    c.fillStyle = '#fff';
    c.font = 'bold 20px system-ui, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillText('Score: ' + this.score + ' / ' + this.winScore, 10, 8);
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
