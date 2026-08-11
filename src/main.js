// main.js — збірка: камера, конвеєр, класифікація через сервер, гра.
// Template Matching винесено на сервер (server.py): браузер надсилає
// маску 64×64, сервер повертає стан (UP/DOWN/LEFT/RIGHT/OPENED).
// UI: 3 екрани — камера / калібрування / гра (див. index.html).
import { initFaceLandmarker, detectFace, isFaceLandmarkerReady } from './facemesh.js';
import { TongueTracker, HoldFilter } from './tracker.js';
import { SettingsUI } from './settings.js';
import { CalibrationUI } from './calibration.js';
import { SnakeGame } from './games/snake.js';
import { classify, listTemplates, getProfileKey } from './server.js';
import { CONFIG } from './config.js';
import { FeedingGame } from './games/feeding.js';
import { DrawingGame } from './games/drawing.js';
import { FlappyGame } from './games/flappy.js';

const $ = (id) => document.getElementById(id);

const els = {
  video: $('video'),
  cameraCanvas: $('cameraCanvas'),
  calibCanvas: $('calibCanvas'),
  cvPanel: $('cvPanel'),
  gameCanvas: $('gameCanvas'),
  camSelect: $('camSelect'),
  statusText: $('statusText'),
};

const settingsUI = new SettingsUI({
  contrast: $('slContrast'),
  brightness: $('slBrightness'),
  light: $('slLight'),
  shadow: $('slShadow'),
});

const tracker = new TongueTracker(settingsUI);
const hold = new HoldFilter(CONFIG.hold.ms);
const cal = new CalibrationUI();
cal.onMessage = (msg) => setStatus(msg, 'info');

// ---------- Реєстр ігор ----------
// Кожна гра має спільний інтерфейс: create() повертає об'єкт з методами
// onState(state), tick(dt), draw(), reset() та властивостями w/h/won.
const GAMES = {
  snake: {
    name: 'Змійка',
    emoji: '🐍',
    desc: 'Зберіть фрукти язиком!',
    winText: () => 'Ви зібрали всі ' + CONFIG.snake.winScore + ' фруктів!',
    create: () => new SnakeGame(
      {
        stepMs: CONFIG.snake.stepMs,
        speedupPerFruit: CONFIG.snake.speedupPerFruit,
        minStepMs: CONFIG.snake.minStepMs,
        winScore: CONFIG.snake.winScore,
        cols: CONFIG.snake.cols,
        rows: CONFIG.snake.rows,
      },
      els.gameCanvas,
    ),
  },
  feeding: {
    name: 'Годування',
    emoji: '🐸',
    desc: 'Нагодуйте героя їжею',
    winText: () => 'Ви нагодували героя!',
    create: () => new FeedingGame(
      {
        speed: CONFIG.feeding.speed,
        holdMs: CONFIG.feeding.holdMs,
        spawnPauseMs: CONFIG.feeding.spawnPauseMs,
        celebrationMs: CONFIG.feeding.celebrationMs,
        winScore: CONFIG.feeding.winScore,
      },
      els.gameCanvas,
    ),
  },
  drawing: {
    name: 'Малювання',
    emoji: '✏️',
    desc: 'Обведіть малюнок по точках',
    winText: () => 'Малюнок готовий!',
    create: () => new DrawingGame(
      {
        cursorSpeed: CONFIG.drawing.cursorSpeed,
        snapRadius: CONFIG.drawing.snapRadius,
        visitRadius: CONFIG.drawing.visitRadius,
      },
      els.gameCanvas,
    ),
  },
  flappy: {
    name: 'Flappy Bird',
    emoji: '🐤',
    desc: 'Махніть крилом язиком',
    winText: null, // без перемоги — нескінченна
    create: () => new FlappyGame(
      {
        startSpeed: CONFIG.flappy.startSpeed,
        maxSpeed: CONFIG.flappy.maxSpeed,
        minSpeed: CONFIG.flappy.minSpeed,
        accel: CONFIG.flappy.accel,
        decel: CONFIG.flappy.decel,
        rampPerPipe: CONFIG.flappy.rampPerPipe,
        climbSpeed: CONFIG.flappy.climbSpeed,
        tolerance: CONFIG.flappy.tolerance,
        spring: CONFIG.flappy.spring,
        damp: CONFIG.flappy.damp,
        gap: CONFIG.flappy.gap,
        spacing: CONFIG.flappy.spacing,
        pipeWidth: CONFIG.flappy.pipeWidth,
        deathPause: CONFIG.flappy.deathPause,
        warmupSec: CONFIG.flappy.warmupSec,
      },
      els.gameCanvas,
    ),
  },
};

let game = null;       // екземпляр активної гри
let activeGame = null; // id активної гри з реєстру GAMES

/** Створює гру з реєстру (викликається з index.html при виборі картки). */
function startGame(id) {
  const g = GAMES[id];
  if (!g) return;
  activeGame = id;
  game = g.create();
  hideWin();
  hold.reset();
  setStatus('Гра: ' + g.name + ' — керуйте язиком', 'info');
}
window.__startGame = startGame;

let stream = null;
let lastT = performance.now();
let lastFaceSeen = performance.now();
let initialized = false;
const mirror = true; // дзеркальний вигляд як у Python (cv2.flip(frame, 1)) — завжди ввімкнено

// ---------- Класифікація через сервер ----------

const CLASSIFY_INTERVAL = CONFIG.classify.intervalMs;
let pendingMask = null;       // найсвіжіша маска, що ще не надіслана
let inFlight = false;         // один запит в польоті (порядок гарантовано)
let lastSent = 0;
let serverErrorShown = false;

function queueMask(mask) {
  pendingMask = mask;
}

function pumpClassify(now) {
  if (inFlight || !pendingMask) return;
  if (now - lastSent < CLASSIFY_INTERVAL) return;
  const mask = pendingMask;
  pendingMask = null;
  lastSent = now;
  inFlight = true;
  classify(mask)
    .then((res) => {
      tracker.last.state = res.state;
      tracker.last.dist = res.dist;
      if (serverErrorShown) {
        serverErrorShown = false;
        setStatus('Сервер класифікації працює.', 'info');
      }
    })
    .catch((err) => {
      tracker.last.state = 'NEUTRAL';
      hold.reset();
      if (game) game.onState('NEUTRAL');
      if (!serverErrorShown) {
        serverErrorShown = true;
        setStatus('Сервер класифікації недоступний: ' + err.message + ' — перевірте адресу в config.js.', 'error');
      }
    })
    .finally(() => {
      inFlight = false;
    });
}

// ---------- Камера ----------

async function listCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === 'videoinput');
    els.camSelect.innerHTML = '';
    cams.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Camera ${i}`;
      els.camSelect.appendChild(opt);
    });
    return cams;
  } catch (e) {
    setStatus('Немає доступу до переліку камер: ' + e.message, 'error');
    return [];
  }
}

async function startCamera(deviceId) {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  const constraints = {
    video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' },
    audio: false,
  };
  stream = await navigator.mediaDevices.getUserMedia(constraints);
  els.video.srcObject = stream;
  await els.video.play();
  setStatus('Камера запущена. Чекайте розпізнавання обличчя…', 'info');
}

els.camSelect.addEventListener('change', () => {
  startCamera(els.camSelect.value).catch((e) => setStatus('Камера: ' + e.message, 'error'));
});

// ---------- Відображення ----------

const frameCanvas = document.createElement('canvas');
const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });
const litCanvas = document.createElement('canvas');
const litCtx = litCanvas.getContext('2d', { willReadFrequently: true });
const camCtx = els.cameraCanvas.getContext('2d');
const calibCtx = els.calibCanvas.getContext('2d');
const tmp = document.createElement('canvas');
const tmpCtx = tmp.getContext('2d', { willReadFrequently: true });

function drawMaskToPanel(panel, arr, label) {
  const ctx = panel.getContext('2d');
  const m = CONFIG.tracker.maskSize;
  const img = new ImageData(m, m);
  for (let i = 0; i < m * m; i++) {
    const v = arr[i];
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  tmp.width = m;
  tmp.height = m;
  tmpCtx.putImageData(img, 0, 0);
  ctx.clearRect(0, 0, 128, 128);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, 128, 128);
  ctx.fillStyle = label.color;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(label.text, 5, 15);
}

/** Розтягує чорно-білу маску maskSize×maskSize на найбільший центрований
 *  квадрат канваса (без спотворення; решта — чорне). */
function paintMask(ctx, arr, w, h) {
  const m = CONFIG.tracker.maskSize;
  if (tmp.width !== m) {
    tmp.width = m;
    tmp.height = m;
  }
  const img = new ImageData(m, m);
  for (let i = 0; i < m * m; i++) {
    const v = arr[i] | 0;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  tmpCtx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const size = Math.min(w, h);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(tmp, (w - size) / 2, (h - size) / 2, size, size);
}

function drawOverlays(cc, vw, vh, last) {
  cc.font = '16px system-ui, sans-serif';
  cc.lineWidth = 1;
  if (last.roiRect) {
    cc.strokeStyle = '#ffff00';
    cc.strokeRect(last.roiRect.x, last.roiRect.y, last.roiRect.w, last.roiRect.h);
  }
  if (last.lipRect) {
    cc.strokeStyle = '#00ff00';
    cc.strokeRect(last.lipRect.x, last.lipRect.y, last.lipRect.w, last.lipRect.h);
    cc.fillStyle = '#00ff00';
    cc.font = 'bold 18px system-ui, sans-serif';
    cc.fillText('L', Math.max(2, last.lipRect.x - 26), last.lipRect.y + 12);
    cc.fillText('R', Math.min(vw - 30, last.lipRect.x + last.lipRect.w + 4), last.lipRect.y + 12);
  }
  if (last.mouthRect) {
    cc.strokeStyle = '#ffffff';
    cc.strokeRect(last.mouthRect.x, last.mouthRect.y, last.mouthRect.w, last.mouthRect.h);
  }
  cc.textAlign = 'left';
  cc.textBaseline = 'top';
  cc.fillStyle = last.faceDetected ? '#00ffff' : '#ff0000';
  cc.font = 'bold 22px system-ui, sans-serif';
  cc.fillText('PATTERN: ' + last.state, 8, 8);
  cc.font = '16px system-ui, sans-serif';
  cc.fillStyle = '#c8c8c8';
  cc.fillText('MSE: ' + Math.round(last.dist), 8, 38);
  cc.fillStyle = '#00ff00';
  cc.fillText('thr=' + last.thr, 8, 62);
  cc.fillStyle = '#ffc800';
  cc.fillText('CX=' + (last.cx < 0 ? '-' : last.cx.toFixed(1)), 8, 86);
}

/** Малює кадр з tmp на заданий контекст. Дзеркалювання вже враховано
 *  на етапі frameCanvas (єдиний flip, як cv2.flip(frame, 1) у Python). */
function drawFrame(ctx) {
  ctx.drawImage(tmp, 0, 0);
}

function showRawCamera(raw) {
  tmp.width = raw.width;
  tmp.height = raw.height;
  tmpCtx.putImageData(raw, 0, 0);
  drawFrame(camCtx);
}

function drawPanels(last) {
  // Camera View — бінарна маска зони захоплення (чорно-біла)
  drawMaskToPanel(els.cvPanel, last.normalized || new Uint8Array(CONFIG.tracker.maskSize * CONFIG.tracker.maskSize), { text: 'Camera View', color: '#ff0000' });
}

function setStatus(text, kind) {
  if (!els.statusText) return;
  els.statusText.textContent = text;
  els.statusText.className = 'status-text' + (kind === 'error' ? ' error' : kind === 'warn' ? ' warn' : '');
}

// ---------- Калібрування (новий екран) ----------

const CALIB_BTN_IDS = {
  UP: 'btnCalibUp',
  DOWN: 'btnCalibDown',
  LEFT: 'btnCalibLeft',
  RIGHT: 'btnCalibRight',
  OPENED: 'btnCalibOpen',
};

const CALIB_HINTS = {
  UP: 'Язик вгору — зафіксовано ✓',
  DOWN: 'Язик вниз — зафіксовано ✓',
  LEFT: 'Язик вліво — зафіксовано ✓',
  RIGHT: 'Язик вправо — зафіксовано ✓',
  OPENED: 'Рот відкритий — зафіксовано ✓',
};

function enablePlayIfReady() {
  const ready = cal.allCaptured;
  const play = $('btnCalibPlay');
  const go = $('btnGoGame');
  if (play) play.disabled = !ready;
  if (go) go.disabled = !ready;
}

/** Позначає кнопки як зроблені за списком, підтвердженим сервером. */
function syncCalibrationUI(calibrated) {
  const names = calibrated || [];
  for (const [name, id] of Object.entries(CALIB_BTN_IDS)) {
    const btn = $(id);
    if (btn && names.includes(name)) {
      btn.classList.add('done');
      cal.captured.add(name);
    }
  }
  enablePlayIfReady();
}

// Викликається з index.html при кліку на .calib-btn.
window.__calibCapture = async (state, btn) => {
  const hint = $('calibHint');
  try {
    const ok = await cal.capture(state, () => tracker.last.normalized);
    if (ok) {
      btn.classList.add('done');
      if (hint) hint.textContent = CALIB_HINTS[state] || 'Зафіксовано ✓';
      enablePlayIfReady();
    } else if (hint) {
      hint.textContent = 'Маска порожня — висуньте язик (або відкрийте рот для 👅) і повторіть';
    }
  } catch (e) {
    if (hint) hint.textContent = 'Не вдалося зберегти еталон: ' + e.message;
    setStatus('Не вдалося зберегти еталон: ' + e.message, 'error');
  }
};

// ---------- Головний цикл ----------

// ---------- Перемога / перезапуск гри ----------

function showWin() {
  const ov = $('winOverlay');
  if (!ov) return;
  const sub = $('winSub');
  const g = activeGame ? GAMES[activeGame] : null;
  if (sub) sub.textContent = g && g.winText ? g.winText() : 'Перемога!';
  ov.classList.add('show');
}

function hideWin() {
  const ov = $('winOverlay');
  if (ov) ov.classList.remove('show');
}

function restartGame() {
  if (game) game.reset();
  hold.reset();
  hideWin();
  setStatus('Гру перезапущено', 'info');
}

// «Грати ще раз» після перемоги
const btnPlayAgain = $('btnPlayAgain');
if (btnPlayAgain) btnPlayAgain.addEventListener('click', restartGame);
// «Вихід» з екрана перемоги — теж перезапуск
const btnWinExit = $('btnWinExit');
if (btnWinExit) btnWinExit.addEventListener('click', restartGame);
// Вихід з гри (⚙️) — перезапуск гри, як домовились
const btnBackToCamera = $('btnBackToCamera');
if (btnBackToCamera) btnBackToCamera.addEventListener('click', restartGame);

function tick() {
  const now = performance.now();
  const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000));
  lastT = now;

  // Канвас гри міг змінити розмір (поворот екрана) — перекомпонувати сітку.
  if (game && (game.w !== game.canvas.width || game.h !== game.canvas.height)) {
    game.resize();
  }

  if (!initialized) {
    requestAnimationFrame(tick);
    return;
  }

  const vw = els.video.videoWidth;
  const vh = els.video.videoHeight;
  if (isFaceLandmarkerReady() && vw && vh) {
    if (frameCanvas.width !== vw) {
      frameCanvas.width = vw;
      frameCanvas.height = vh;
      els.cameraCanvas.width = vw;
      els.cameraCanvas.height = vh;
      els.calibCanvas.width = vw;
      els.calibCanvas.height = vh;
    }

    frameCtx.save();
    if (mirror) {
      frameCtx.translate(vw, 0);
      frameCtx.scale(-1, 1);
    }
    frameCtx.drawImage(els.video, 0, 0, vw, vh);
    frameCtx.restore();
    const raw = frameCtx.getImageData(0, 0, vw, vh);

    const rawLms = detectFace(els.video, now);
    tracker.last.faceDetected = !!rawLms;
    if (!rawLms) {
      // Обличчя втрачено
      tracker.last.state = 'NEUTRAL';
      pendingMask = null;
      showRawCamera(raw);
      camCtx.font = 'bold 22px system-ui, sans-serif';
      camCtx.fillStyle = '#ff0000';
      camCtx.fillText('FACE NOT DETECTED', 20, 40);
      calibCtx.fillStyle = '#000';
      calibCtx.fillRect(0, 0, vw, vh);
      calibCtx.font = 'bold 22px system-ui, sans-serif';
      calibCtx.fillStyle = '#ff0000';
      calibCtx.fillText('FACE NOT DETECTED', 20, 40);
      if (now - lastFaceSeen > CONFIG.face.lostPauseMs) {
        hold.reset();
        if (game) game.onState('NEUTRAL');
      }
      drawPanels(tracker.last);
      if (game) {
        game.tick(dt);
        game.draw();
      }
      requestAnimationFrame(tick);
      return;
    }
    lastFaceSeen = now;

    const lms = rawLms.map((lm) => ({ x: 1 - lm.x, y: lm.y, z: lm.z }));
    const { last, lit } = tracker.process(raw, lms);

    // Показуємо оброблений кадр (екран камери) і чорно-білу маску
    // (екран калібрування — видно, який патерн зніме система).
    litCanvas.width = vw;
    litCanvas.height = vh;
    litCtx.putImageData(lit, 0, 0);
    tmp.width = vw;
    tmp.height = vh;
    tmpCtx.drawImage(litCanvas, 0, 0);
    drawFrame(camCtx);
    paintMask(calibCtx, last.normalized, vw, vh);

    drawOverlays(camCtx, vw, vh, last);
    calibCtx.textAlign = 'left';
    calibCtx.textBaseline = 'top';
    calibCtx.fillStyle = '#00ffff';
    calibCtx.font = 'bold 20px system-ui, sans-serif';
    calibCtx.fillText('Camera View: ' + last.state, 10, 10);
    drawPanels(last);

    // Рот закритий — маску не надсилаємо, стан = NEUTRAL (як у Python),
    // курсор миттєво зупиняється (брак).
    if (last.mouthClosed) {
      pendingMask = null;
      tracker.last.state = 'NEUTRAL';
      hold.reset();
      if (game) game.onState('NEUTRAL');
    } else {
      queueMask(last.normalized);
      pumpClassify(now);
      // Стабілізований стан → гра
      const confirmed = hold.update(last.state, now);
      if (game) game.onState(confirmed);
    }
  }

  if (game) {
    game.tick(dt);
    game.draw();
    if (game.won) showWin(); else hideWin();
  }

  requestAnimationFrame(tick);
}

// ---------- Клавіші ----------

window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    restartGame();
  }
});

window.addEventListener('resize', () => {
  if (game && game.resize) game.resize();
});

// ---------- Старт ----------

async function boot() {
  try {
    await initFaceLandmarker();
  } catch (e) {
    setStatus('Помилка завантаження моделі FaceMesh: ' + e.message, 'error');
    return;
  }
  setStatus('Модель завантажена, шукаємо камеру…', 'info');

  try {
    const data = await listTemplates();
    const calib = data.calibrated || [];
    syncCalibrationUI(calib);
    setStatus(
      'Сервер класифікації доступний. Профіль ' + getProfileKey() + ' — відкалібровано: ' +
        (calib.length ? calib.join(', ') : 'нічого (тільки синтетика, калібруйте)'),
      'info',
    );
  } catch (e) {
    setStatus('Сервер недоступний: ' + e.message + ' — гра на паузі. Перевірте config.js.', 'error');
  }

  try {
    await listCameras();
    if (els.camSelect.options.length) {
      await startCamera(els.camSelect.value);
    } else {
      await startCamera(null);
    }
  } catch (e) {
    setStatus('Камера недоступна: ' + e.message + ' — потрібен HTTPS або localhost', 'error');
    initialized = true;
    requestAnimationFrame(tick);
    return;
  }

  initialized = true;
  requestAnimationFrame(tick);
}

boot();
