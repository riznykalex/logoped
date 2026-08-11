// games/feeding.js — «Годування»: герой рухається вліво-вправо по нижньому
// ряду. Зверху падає по одному предмету — їстівне або неїстівне. Треба
// спіймати їстівне. LEFT/RIGHT — рух героя. DOWN — пришвидшує падіння
// предмета, що над героєм; UP — трохи сповільнює падіння. Усе, що торкнулось
// нижнього ряду, зникає. Герой має емоції: радіє, коли з'їдає їстівне,
// засмучується, коли ловить неїстівне, і дрімає (Z-z-z) у стані спокою.
// Спрайти героя: frog1.png — рот закритий (за замовчуванням), frog2.png —
// рот відкритий (коли падає їстівне). Fallback — емодзі.

const EDIBLE_EMOJI = ['🍎', '🍌', '🍒', '🍓', '🍉', '🍇', '🍊', '🍍', '🍑', '🥕', '🥝'];
const NONEDIBLE_EMOJI = ['🧦', '🪨', '🗑️', '🧱', '🔩', '🪵'];
const HERO_EMOJI = '🐸';
const HERO_EMOTION_EMOJI = { idle: '🐸', happy: '😄', sad: '🙁', sleep: '🐸' };

const SPR = { closed: null, open: null };
let spritesInit = false;

function loadSprites() {
  if (spritesInit || typeof Image === 'undefined') return;
  spritesInit = true;
  SPR.closed = new Image();
  SPR.closed.src = 'assets/feeding/frog1.png';
  SPR.open = new Image();
  SPR.open.src = 'assets/feeding/frog2.png';
}

function imgReady(img) {
  return !!img && img.complete && img.naturalWidth > 0;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class FeedingGame {
  constructor(settings, canvas) {
    loadSprites();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.heroSpeed = (settings && settings.heroSpeed) || 150;
    this.fallSpeed = (settings && settings.fallSpeed) || 95;
    this.downMult = (settings && settings.downMult) || 2.4;
    this.upMult = (settings && settings.upMult) || 0.5;
    this.spawnPauseMs = (settings && settings.spawnPauseMs) || 900;
    this.emotionMs = (settings && settings.emotionMs) || 900;
    this.winScore = (settings && settings.winScore) || 10;
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.reset();
  }

  resize() {
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.groundH = Math.max(60, this.h * 0.1);
    this.groundY = this.h - this.groundH;
    this.heroR = Math.max(16, Math.min(this.w, this.h) * 0.07);
    this.heroX = this.w / 2;
    this.heroY = this.groundY - this.heroR;
  }

  reset() {
    this.score = 0;
    this.won = false;
    this.state = 'NEUTRAL';
    this.emotion = 'sleep';      // idle | happy | sad | sleep
    this.emotionLeft = 0;
    this.spawnPauseLeft = this.spawnPauseMs;
    this.item = null;
    this.groundH = Math.max(60, this.h * 0.1);
    this.groundY = this.h - this.groundH;
    this.heroR = Math.max(16, Math.min(this.w, this.h) * 0.07);
    this.heroX = this.w / 2;
    this.heroY = this.groundY - this.heroR;
  }

  onState(state) {
    if (this.won) return;
    this.state = state;
  }

  _spawn() {
    const edible = Math.random() < 0.7;
    const r = Math.max(14, Math.min(this.w, this.h) * 0.05);
    const m = r + 8;
    this.item = {
      x: m + Math.random() * (this.w - 2 * m),
      y: -r,
      r,
      edible,
      emoji: edible ? pick(EDIBLE_EMOJI) : pick(NONEDIBLE_EMOJI),
    };
  }

  _overHero() {
    return Math.abs(this.item.x - this.heroX) < this.item.r + this.heroR;
  }

  _catch() {
    const caught = this.item;
    this.item = null;
    this.spawnPauseLeft = this.spawnPauseMs;
    this.emotionLeft = this.emotionMs;
    if (caught.edible) {
      this.emotion = 'happy';
      this.score += 1;
      if (this.score >= this.winScore) this.won = true;
    } else {
      this.emotion = 'sad';
    }
  }

  tick(dt) {
    if (this.won) return;
    const ms = dt * 1000;

    // Емоції згасають → спокій
    if (this.emotionLeft > 0) {
      this.emotionLeft -= ms;
      if (this.emotionLeft <= 0) this.emotion = 'sleep';
    }

    // Рух героя вліво-вправо (завжди доступний)
    if (this.state === 'LEFT') {
      this.heroX = Math.max(this.heroR, this.heroX - this.heroSpeed * dt);
    } else if (this.state === 'RIGHT') {
      this.heroX = Math.min(this.w - this.heroR, this.heroX + this.heroSpeed * dt);
    }

    if (!this.item) {
      this.emotion = this.state === 'NEUTRAL' ? 'sleep' : this.emotion;
      if (this.spawnPauseLeft > 0) {
        this.spawnPauseLeft -= ms;
        if (this.spawnPauseLeft <= 0) {
          this._spawn();
          this.emotion = 'idle';
        }
      }
      return;
    }

    // Швидкість падіння: DOWN швидше, UP повільніше (тільки коли над героєм)
    let mult = 1;
    if (this._overHero()) {
      if (this.state === 'DOWN') mult = this.downMult;
      else if (this.state === 'UP') mult = this.upMult;
    }
    this.item.y += this.fallSpeed * mult * dt;

    // Спіймано героєм (предмет дійшов до голови героя і перекривається по X)
    if (this.item.y >= this.heroY - this.item.r && this._overHero()) {
      this._catch();
      return;
    }

    // Торкнулось нижнього ряду — зникає
    if (this.item.y - this.item.r > this.groundY) {
      this.item = null;
      this.spawnPauseLeft = this.spawnPauseMs;
    }
  }

  draw() {
    const c = this.ctx;
    const w = this.w;
    const h = this.h;

    c.fillStyle = '#12121c';
    c.fillRect(0, 0, w, h);

    // Трава — нижній ряд
    c.fillStyle = '#2a3a1a';
    c.fillRect(0, this.groundY, w, this.groundH);
    c.fillStyle = '#4caf50';
    c.fillRect(0, this.groundY, w, 4);

    // Падаючий предмет
    if (this.item) {
      const fs = this.item.r * 2;
      c.font = `${Math.round(fs)}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(this.item.emoji, this.item.x, this.item.y);
      // Рамка-підказка: зелена — їстівне, червона — ні
      c.beginPath();
      c.arc(this.item.x, this.item.y, this.item.r + 4, 0, Math.PI * 2);
      c.strokeStyle = this.item.edible ? 'rgba(76,175,80,0.75)' : 'rgba(230,70,70,0.75)';
      c.lineWidth = 2.5;
      c.stroke();
    }

    // Герой: рот відкритий, коли падає їстівне, інакше закритий
    const mouthOpen = !!(this.item && this.item.edible);
    const spr = mouthOpen ? SPR.open : SPR.closed;
    const heroSize = this.heroR * 2;
    if (imgReady(spr)) {
      // спрайт 100×128 — зберігаємо пропорції, низ стоїть на землі
      const sprH = heroSize * 2;
      const sprW = sprH * (spr.naturalWidth / spr.naturalHeight);
      c.drawImage(spr, this.heroX - sprW / 2, this.groundY - sprH, sprW, sprH);
    } else {
      c.font = `${Math.round(heroSize * 1.2)}px system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(HERO_EMOTION_EMOJI[this.emotion] || HERO_EMOJI, this.heroX, this.heroY + heroSize * 0.05);
      if (this.emotion === 'sleep') {
        c.font = `${Math.round(heroSize * 0.4)}px system-ui, sans-serif`;
        c.fillStyle = '#9ad0ff';
        const bob = Math.sin(Date.now() / 500) * heroSize * 0.08;
        c.fillText('Z-z-z', this.heroX + heroSize * 0.9, this.heroY - heroSize * 0.7 + bob);
      }
    }

    // Підказки керування
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillStyle = 'rgba(255,255,255,0.45)';
    c.font = '12px system-ui, sans-serif';
    c.fillText('◄► вліво-вправо · ▼ швидше · ▲ повільніше', 10, this.groundY + 8);

    // Рахунок
    c.fillStyle = '#fff';
    c.font = 'bold 20px system-ui, sans-serif';
    c.fillText('Спіймано: ' + this.score + ' / ' + this.winScore, 10, 8);
  }
}
