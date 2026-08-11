// games/flappy.js — «Flappy Bird» (полегшений):
// пташка ширяє приблизно по центру поля (spring тримає її біля centerY),
// смуга допуску tolerance задає зону, в якій вона може підніматись/опускатись.
// Керування:
//   UP    — летіти вгору
//   DOWN  — летіти вниз
//   LEFT  — гальмувати (швидкість труб падає майже до зупинки)
//   RIGHT — прискорювати (рух уперед)
// Перешкоди: пара труб, труба зверху або труба знизу; можуть трохи
// заходити в безпечну зону. У повітрі літають монетки — пташка їх збирає.
// Пташка завжди орієнтована горизонтально (спрайт дзеркальний, дивиться вправо).
// Зіткнення з трубою → пташка не гине, а відскакує назад
// (світ плавно відкочується, поки труба знову не опиниться попереду).
// Спрайти з https://github.com/hkirat/flappyBird (assets/flappy/).

const SPR = { bg: null, ground: null, upper: null, lower: null, bird: null };
let spritesInit = false;

function loadSprites() {
  if (spritesInit || typeof Image === 'undefined') return;
  spritesInit = true;
  SPR.bg = new Image();
  SPR.bg.src = 'assets/flappy/background.png';
  SPR.ground = new Image();
  SPR.ground.src = 'assets/flappy/ground.png';
  SPR.upper = new Image();
  SPR.upper.src = 'assets/flappy/upper.png';
  SPR.lower = new Image();
  SPR.lower.src = 'assets/flappy/lower.png';
  SPR.bird = new Image();
  SPR.bird.src = 'assets/flappy/flappy_atlas.png';
}

function imgReady(img) {
  return !!img && img.complete && img.naturalWidth > 0;
}

const ATLAS_W = 51;   // 3 кадри по 17px
const FRAME_W = 17;
const FRAME_H = 12;
const CAP_SRC = 26;   // «капелюшок» труби, px джерела
const BIRD_ATLAS_H = 12;

export class FlappyGame {
  constructor(settings, canvas) {
    loadSprites();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.startSpeed = (settings && settings.startSpeed) || 55; // повільний старт, px/с
    this.maxSpeed = (settings && settings.maxSpeed) || 160;
    this.minSpeed = (settings && settings.minSpeed) || 8;      // LEFT майже зупиняє
    this.accel = (settings && settings.accel) || 90;          // RIGHT, px/с²
    this.decel = (settings && settings.decel) || 140;         // LEFT, px/с²
    this.rampPerPipe = (settings && settings.rampPerPipe) || 3; // пришвидшення за трубу
    this.climbSpeed = (settings && settings.climbSpeed) || 170; // вертикаль UP/DOWN, px/с
    this.tolerance = (settings && settings.tolerance) || 90;    // допуск зміщення від центру
    this.spring = (settings && settings.spring) || 9;           // повернення до центру, 1/с
    this.damp = (settings && settings.damp) || 0.92;            // гасіння коливань
    this.gap = (settings && settings.gap) || 170;               // прохід між трубами, px
    this.spacing = (settings && settings.spacing) || 460;       // труби рідше майже вдвічі
    this.pipeWidth = (settings && settings.pipeWidth) || 60;
    this.bounceSpeed = (settings && settings.bounceSpeed) || 260; // швидкість відскоку назад, px/с
    this.bounceMargin = (settings && settings.bounceMargin) || 30; // зазор: пташка перед трубою після відскоку, px
    this.coinR = (settings && settings.coinR) || 9;             // монетка невелика
    this.warmupSec = (settings && settings.warmupSec) || 10;    // тренування без труб
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.reset();
  }

  resize() {
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.groundH = Math.max(70, this.h * 0.12);
    this.centerY = (this.h - this.groundH) / 2;
    this.by = this.centerY;
  }

  reset() {
    this.state = 'NEUTRAL';
    this.won = false;
    this.groundH = Math.max(70, this.h * 0.12);
    this.centerY = (this.h - this.groundH) / 2;
    this.bx = Math.max(40, this.w * 0.28);
    this.by = this.centerY;      // старт по центру
    this.vy = 0;
    this.r = Math.max(12, Math.min(this.w, this.h) * 0.03);
    this.speed = this.startSpeed; // гра починається повільно
    this.score = 0;              // пройдені труби
    this.coins = 0;              // зібрані монетки
    this.pipes = [];
    this.coinItems = [];
    this.coinFlash = 0;          // анімація при зборі монетки
    this.groundX = 0;
    this.animT = 0;              // час для анімації крил
    this.hitFlash = 0;
    this.bounceLeft = 0;          // скільки ще відскочити назад, px
    this.bounceTarget = 0;        // куди відкотитися: права частина попередньої труби, px
    this.warmupLeft = this.warmupSec; // тренувальний цикл без труб
  }

  _clampTop(top) {
    const margin = 30;
    return Math.max(margin, Math.min(this.h - this.groundH - this.gap - margin, top));
  }

  _spawnObstacle(x) {
    const r = Math.random();
    if (r < 0.4) {
      // Пара труб: прохід випадковий у межах смуги
      const offset = (Math.random() * 2 - 1) * this.tolerance;
      const gapCenter = this.centerY + offset;
      const top = this._clampTop(gapCenter - this.gap / 2);
      this.pipes.push({ type: 'pair', x, top, gap: this.gap, scored: false });
      // монетка в проході
      this._spawnCoin(x + this.pipeWidth / 2, gapCenter);
    } else if (r < 0.7) {
      // Труба зверху: нижній край трохи заходить у безпечну зону
      const intrude = this.r * 1.1 + Math.random() * this.tolerance * 0.32;
      const bottom = Math.min(
        this.h - this.groundH - this.r - 20,
        this.centerY + this.tolerance - this.r - intrude,
      );
      this.pipes.push({ type: 'top', x, bottom, scored: false });
      // монетка під трубою (там, де пролітає пташка)
      this._spawnCoin(x + this.pipeWidth / 2, Math.min(this.centerY + this.tolerance, bottom + 40));
    } else {
      // Труба знизу: верхній край трохи заходить у безпечну зону
      const intrude = this.r * 1.1 + Math.random() * this.tolerance * 0.32;
      const top = Math.max(
        this.r + 20,
        this.centerY - this.tolerance + this.r + intrude,
      );
      this.pipes.push({ type: 'bottom', x, top, scored: false });
      // монетка над трубою
      this._spawnCoin(x + this.pipeWidth / 2, Math.max(this.centerY - this.tolerance, top - 40));
    }
    // Іноді ще одна монетка у вільному повітрі між трубами
    if (Math.random() < 0.4) {
      this._spawnCoin(
        x + this.pipeWidth / 2 + this.spacing * (0.3 + Math.random() * 0.4),
        this.centerY + (Math.random() * 2 - 1) * (this.tolerance - this.coinR),
      );
    }
  }

  _spawnCoin(x, y) {
    this.coinItems.push({ x, y, r: this.coinR, got: false, phase: Math.random() * Math.PI * 2 });
  }

  onState(state) {
    this.state = state;
  }

  tick(dt) {
    // Відскок: світ плавно відкочується назад, труба знову опиняється попереду.
    // Пташка не гине і може продовжувати керувати висотою.
    if (this.bounceLeft > 0) {
      const step = Math.min(this.bounceSpeed * dt, this.bounceLeft);
      for (const p of this.pipes) p.x += step;
      for (const c of this.coinItems) c.x += step;
      this.groundX = ((this.groundX + step) % 308 + 308) % 308;
      this.bounceLeft -= step;
      this._flyVertical(dt);
      this.animT += dt;
      if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
      return;
    }

    // --- Швидкість: LEFT гальмує, RIGHT прискорює ---
    if (this.state === 'LEFT') {
      this.speed = Math.max(this.minSpeed, this.speed - this.decel * dt);
    } else if (this.state === 'RIGHT') {
      this.speed = Math.min(this.maxSpeed, this.speed + this.accel * dt);
    }

    this._flyVertical(dt);
    this.animT += dt;
    this.groundX = ((this.groundX - this.speed * dt) % 308 + 308) % 308;

    // Тренувальний цикл: перші секунди без труб, щоб освоїтися
    if (this.warmupLeft > 0) {
      this.warmupLeft -= dt;
      if (this.warmupLeft < 0) this.warmupLeft = 0;
    }

    // --- Труби та монетки рухаються вліво ---
    for (const p of this.pipes) p.x -= this.speed * dt;
    for (const c of this.coinItems) c.x -= this.speed * dt;
    const last = this.pipes[this.pipes.length - 1];
    if (this.warmupLeft <= 0 && (!last || last.x < this.w - this.spacing)) this._spawnObstacle(this.w + 20);
    this.pipes = this.pipes.filter((p) => p.x + this.pipeWidth > -20);
    this.coinItems = this.coinItems.filter((c) => c.x > -20);

    // Рахунок і природне пришвидшення за пройдену трубу
    for (const p of this.pipes) {
      if (!p.scored && p.x + this.pipeWidth < this.bx - this.r) {
        p.scored = true;
        this.score += 1;
        this.speed = Math.min(this.maxSpeed, this.speed + this.rampPerPipe);
      }
    }

    // Збір монеток
    for (const c of this.coinItems) {
      if (c.got) continue;
      if (Math.hypot(this.bx - c.x, this.by - c.y) < c.r + this.r) {
        c.got = true;
        this.coins += 1;
        this.coinFlash = 1;
      }
    }
    if (this.coinFlash > 0) this.coinFlash = Math.max(0, this.coinFlash - dt * 3);

    // Зіткнення з трубою → відскок назад, без смерті.
    // Світ відкочується майже до попередньої труби: пташка повертається
    // на позицію одразу після неї і пробує пройти трубу ще раз.
    for (const p of this.pipes) {
      if (this._hitPipe(p)) {
        // відстань між трубами мінус ширина труби та радіус пташки —
        // тоді попередня труба опиняється одразу позаду пташки
        this.bounceTarget = Math.max(
          this.spacing - this.pipeWidth - this.r - this.bounceMargin,
          this.r * 2 + this.bounceMargin,
        );
        this.bounceLeft = this.bounceTarget;
        this.hitFlash = 1;
        return;
      }
    }

    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
  }

  _flyVertical(dt) {
    // --- Висота: UP вгору, DOWN вниз, інакше пружина до центру ---
    if (this.state === 'UP') {
      this.by -= this.climbSpeed * dt;
      this.vy = -this.climbSpeed;
    } else if (this.state === 'DOWN') {
      this.by += this.climbSpeed * dt;
      this.vy = this.climbSpeed;
    } else {
      this.vy += (this.centerY - this.by) * this.spring * dt;
      this.vy *= Math.pow(this.damp, dt * 60);
      this.by += this.vy * dt;
    }
    // Смуга допуску навколо центру
    this.by = Math.max(this.centerY - this.tolerance, Math.min(this.centerY + this.tolerance, this.by));
  }

  _hitPipe(p) {
    const groundY = this.h - this.groundH;
    if (p.type === 'top') {
      return this._circleRect({ x: p.x, y: 0, w: this.pipeWidth, h: p.bottom });
    }
    if (p.type === 'bottom') {
      return this._circleRect({ x: p.x, y: p.top, w: this.pipeWidth, h: groundY - p.top });
    }
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
    const sprites = imgReady(SPR.bg);
    c.imageSmoothingEnabled = false;

    // Фон
    if (sprites) {
      c.drawImage(SPR.bg, 0, 0, 144, 256, 0, 0, w, h);
    } else {
      const grad = c.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#1c2a4a');
      grad.addColorStop(1, '#3a5a8a');
      c.fillStyle = grad;
      c.fillRect(0, 0, w, h);
    }

    // Труби
    for (const p of this.pipes) {
      if (p.type === 'top') this._drawUpperPipe(p.x, p.bottom);
      else if (p.type === 'bottom') this._drawLowerPipe(p.x, p.top, groundY);
      else {
        this._drawUpperPipe(p.x, p.top);
        this._drawLowerPipe(p.x, p.top + p.gap, groundY);
      }
    }

    // Монетки
    for (const cItem of this.coinItems) {
      if (cItem.got) continue;
      const pulse = 1 + 0.15 * Math.sin(this.animT * 4 + cItem.phase);
      const cr = cItem.r * pulse;
      c.fillStyle = '#ffd700';
      c.strokeStyle = '#b8860b';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(cItem.x, cItem.y, cr, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = '#fff3a0';
      c.beginPath();
      c.arc(cItem.x - cr * 0.3, cItem.y - cr * 0.3, cr * 0.4, 0, Math.PI * 2);
      c.fill();
    }

    // Земля (спрайт, циклічний — 3 тайли покривають весь екран)
    if (imgReady(SPR.ground)) {
      c.drawImage(SPR.ground, 0, 0, 308, 56, this.groundX - 308, groundY, 308, 56);
      c.drawImage(SPR.ground, 0, 0, 308, 56, this.groundX, groundY, 308, 56);
      c.drawImage(SPR.ground, 0, 0, 308, 56, this.groundX + 308, groundY, 308, 56);
      c.fillStyle = '#1c2a14';
      c.fillRect(0, groundY + 56, w, this.groundH - 56);
    } else {
      c.fillStyle = '#2a3a1a';
      c.fillRect(0, groundY, w, this.groundH);
      c.fillStyle = '#4caf50';
      c.fillRect(0, groundY, w, 4);
    }

    // Смуга допуску та центр
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth = 1;
    c.setLineDash([5, 8]);
    c.beginPath();
    c.moveTo(0, this.centerY - this.tolerance);
    c.lineTo(w, this.centerY - this.tolerance);
    c.moveTo(0, this.centerY + this.tolerance);
    c.lineTo(w, this.centerY + this.tolerance);
    c.stroke();
    c.setLineDash([]);

    // Пташка — спрайт вже дивиться вправо, без дзеркалювання
    if (imgReady(SPR.bird)) {
      const frame = Math.floor(this.animT * 6) % 3; // анімація крил (3 кадри)
      const bw = this.r * 2.8;
      const bh = this.r * 2.0;
      c.drawImage(SPR.bird, frame * FRAME_W, 0, FRAME_W, BIRD_ATLAS_H, this.bx - bw / 2, this.by - bh / 2, bw, bh);
    } else {
      c.font = `${Math.round(this.r * 2.4)}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('🐤', this.bx, this.by + this.r * 0.1);
    }

    // Спалах після зіткнення (м'який, затухає)
    if (this.hitFlash > 0) {
      c.fillStyle = 'rgba(255,60,60,' + (0.25 * this.hitFlash).toFixed(3) + ')';
      c.fillRect(0, 0, w, h);
    }

    // Рахунок
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillStyle = '#fff';
    c.font = 'bold 20px system-ui, sans-serif';
    c.fillText('Score: ' + this.score, 10, 8);
    // Монетка (емодзі 🪙 не скрізь підтримується — малюємо коло)
    const scoreW = c.measureText('Score: ' + this.score).width;
    const coinX = 10 + scoreW + 18;
    c.fillStyle = '#ffd700';
    c.strokeStyle = '#b8860b';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(coinX, 8 + 11, 10, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = '#fff3a0';
    c.beginPath();
    c.arc(coinX - 3, 8 + 8, 4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.fillText(String(this.coins), coinX + 15, 8);

    // Швидкість: шкала + підсвічення напрямку (LEFT гальмо / RIGHT газ)
    const meterW = 110;
    const meterH = 10;
    const mx = w - meterW - 10;
    const my = 10;
    const frac = Math.max(0, Math.min(1, (this.speed - this.minSpeed) / (this.maxSpeed - this.minSpeed)));
    c.fillStyle = 'rgba(255,255,255,0.2)';
    c.fillRect(mx, my, meterW, meterH);
    c.fillStyle = '#ffc800';
    c.fillRect(mx, my, meterW * frac, meterH);
    c.font = '12px system-ui, sans-serif';
    c.textAlign = 'right';
    c.fillStyle = this.state === 'LEFT' ? '#4caf50' : '#ffffff';
    c.fillText('◄◄ гальмо', mx - 6, my - 1);
    c.textAlign = 'left';
    c.fillStyle = this.state === 'RIGHT' ? '#4caf50' : '#ffffff';
    c.fillText('газ ►►', mx + meterW + 6, my - 1);
    c.textAlign = 'right';
    c.fillStyle = '#aaa';
    c.font = '11px system-ui, sans-serif';
    c.fillText(Math.round(this.speed) + ' px/с', mx + meterW, my + meterH + 4);

    // Тренувальний екран: без труб, підказки + видно розпізнаний паттерн
    if (this.warmupLeft > 0) {
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fillRect(0, h * 0.20, w, 152);
      c.textAlign = 'center';
      c.textBaseline = 'top';
      c.fillStyle = '#fff';
      c.font = 'bold 24px system-ui, sans-serif';
      c.fillText('Тренування — поки немає труб', w / 2, h * 0.20 + 14);
      c.font = '16px system-ui, sans-serif';
      c.fillStyle = '#ffd700';
      c.fillText('Паттерн: ' + this.state, w / 2, h * 0.20 + 50);
      c.fillStyle = '#c8ffc8';
      c.fillText('↑ вгору · ↓ вниз — висота', w / 2, h * 0.20 + 78);
      c.fillStyle = '#ffc800';
      c.fillText('◄ вліво — гальмо · вправо ► — прискорення', w / 2, h * 0.20 + 104);
    }
  }

  _drawUpperPipe(x, bottom) {
    const c = this.ctx;
    const capH = 26;
    const bodyH = Math.max(1, bottom - capH);
    if (imgReady(SPR.upper)) {
      c.drawImage(SPR.upper, 0, 0, 26, 135 - CAP_SRC, x, 0, this.pipeWidth, bodyH);
      c.drawImage(SPR.upper, 0, 135 - CAP_SRC, 26, CAP_SRC, x - 4, bodyH, this.pipeWidth + 8, capH);
    } else {
      c.fillStyle = '#3a8a3a';
      c.fillRect(x, 0, this.pipeWidth, bottom);
      c.fillStyle = '#5ab85a';
      c.fillRect(x - 4, bodyH, this.pipeWidth + 8, capH);
    }
  }

  _drawLowerPipe(x, top, groundY) {
    const c = this.ctx;
    const capH = 26;
    const bodyH = Math.max(1, groundY - top - capH);
    if (imgReady(SPR.lower)) {
      c.drawImage(SPR.lower, 0, CAP_SRC, 26, 121 - CAP_SRC, x, top + capH, this.pipeWidth, bodyH);
      c.drawImage(SPR.lower, 0, 0, 26, CAP_SRC, x - 4, top, this.pipeWidth + 8, capH);
    } else {
      c.fillStyle = '#3a8a3a';
      c.fillRect(x, top, this.pipeWidth, groundY - top);
      c.fillStyle = '#5ab85a';
      c.fillRect(x - 4, top, this.pipeWidth + 8, capH);
    }
  }
}
