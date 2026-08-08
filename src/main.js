// main.js — збірка: камера, конвеєр, класифікація через сервер, гра.
// Template Matching винесено на сервер (server.py): браузер надсилає
// маску 64×64, сервер повертає стан (UP/DOWN/LEFT/RIGHT/OPENED).
import { initFaceLandmarker, detectFace, isFaceLandmarkerReady } from './facemesh.js';
import { TongueTracker, HoldFilter } from './tracker.js';
import { SettingsUI } from './settings.js';
import { CalibrationUI } from './calibration.js';
import { JoystickGame } from './games/joystick.js';
import { classify, getServerUrl, setServerUrl, listTemplates } from './server.js';

const $ = (id) => document.getElementById(id);

const els = {
  video: $('video'),
  cameraCanvas: $('cameraCanvas'),
  cvPanel: $('cvPanel'),
  mtPanel: $('mtPanel'),
  gameCanvas: $('gameCanvas'),
  camSelect: $('camSelect'),
  serverUrl: $('serverUrl'),
  status: $('status'),
  btnCalibrate: $('btnCalibrate'),
  arrows: {
    up: $('btnUp'), down: $('btnDown'), left: $('btnLeft'), right: $('btnRight'), open: $('btnOpen'),
  },
};

const settingsUI = new SettingsUI({
  contrast: $('slContrast'),
  brightness: $('slBrightness'),
  light: $('slLight'),
  shadow: $('slShadow'),
});

const tracker = new TongueTracker(settingsUI);
const hold = new HoldFilter(400);
const cal = new CalibrationUI();
cal.onMessage = (msg) => setStatus(msg, 'info');
const game = new JoystickGame({ speed: 8.0, catchDist: 22, targetTimeout: 6.0 }, els.gameCanvas);

let stream = null;
let lastT = performance.now();
let lastFaceSeen = performance.now();
let initialized = false;
let mirror = true; // дзеркальний вигляд як у Python (cv2.flip(frame, 1)) — ввімкнено за замовчуванням

// ---------- Класифікація через сервер ----------

const CLASSIFY_INTERVAL = 50; // мінімальний інтервал між запитами (~20/с)
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
      game.onState('NEUTRAL');
      if (!serverErrorShown) {
        serverErrorShown = true;
        setStatus('Сервер класифікації недоступний: ' + err.message + ' — перевірте Server URL.', 'error');
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

$('chkMirror').addEventListener('change', (e) => {
  mirror = e.target.checked;
});

els.serverUrl.value = getServerUrl();
els.serverUrl.addEventListener('change', () => {
  setServerUrl(els.serverUrl.value);
  setStatus('Server URL: ' + (getServerUrl() || '(поточний домен)'), 'info');
});

// ---------- Відображення ----------

const frameCanvas = document.createElement('canvas');
const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });
const litCanvas = document.createElement('canvas');
const litCtx = litCanvas.getContext('2d', { willReadFrequently: true });
const camCtx = els.cameraCanvas.getContext('2d');
const tmp = document.createElement('canvas');
const tmpCtx = tmp.getContext('2d', { willReadFrequently: true });

function drawMaskToPanel(panel, arr64, label) {
  const ctx = panel.getContext('2d');
  const img = new ImageData(64, 64);
  for (let i = 0; i < 4096; i++) {
    const v = arr64[i];
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  tmp.width = 64;
  tmp.height = 64;
  tmpCtx.putImageData(img, 0, 0);
  ctx.clearRect(0, 0, 128, 128);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, 128, 128);
  ctx.fillStyle = label.color;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(label.text, 5, 15);
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

function drawMatchedPanel(last) {
  const ctx = els.mtPanel.getContext('2d');
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, 128, 128);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#00ff00';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(last.state || 'NEUTRAL', 64, 60);
  ctx.fillStyle = '#888';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('MSE: ' + Math.round(last.dist), 64, 92);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#00ff00';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('Matched', 5, 15);
}

function drawPanels(last) {
  // Camera View — бінарна маска зони захоплення (чорно-біла)
  drawMaskToPanel(els.cvPanel, last.normalized || new Uint8Array(4096), { text: 'Camera View', color: '#ff0000' });
  // Matched — стан з сервера (еталони на сервері, клієнту недоступні)
  drawMatchedPanel(last);
}

function setStatus(text, kind) {
  els.status.textContent = text;
  els.status.className = 'status ' + (kind || '');
}

// ---------- Головний цикл ----------

function tick() {
  const now = performance.now();
  const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000));
  lastT = now;

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
      if (now - lastFaceSeen > 2000) {
        hold.reset();
        game.onState('NEUTRAL');
      }
      drawPanels(tracker.last);
      game.tick(dt);
      game.draw();
      requestAnimationFrame(tick);
      return;
    }
    lastFaceSeen = now;

    const lms = mirror
      ? rawLms.map((lm) => ({ x: 1 - lm.x, y: lm.y, z: lm.z }))
      : rawLms;
    const { last, lit } = tracker.process(raw, lms);

    // Показуємо оброблений кадр з урахуванням Mirror
    litCanvas.width = vw;
    litCanvas.height = vh;
    litCtx.putImageData(lit, 0, 0);
    tmp.width = vw;
    tmp.height = vh;
    tmpCtx.drawImage(litCanvas, 0, 0);
    drawFrame(camCtx);

    drawOverlays(camCtx, vw, vh, last);
    drawPanels(last);

    // Надіслати маску на класифікацію (рот закритий — не надсилаємо)
    if (last.mouthClosed) {
      pendingMask = null;
    } else {
      queueMask(last.normalized);
    }
    pumpClassify(now);

    // Стабілізований стан → гра
    const confirmed = hold.update(last.state, now);
    game.onState(confirmed);
  }

  game.tick(dt);
  game.draw();

  requestAnimationFrame(tick);
}
// ---------- Калібрування ----------

function refreshCalibrationUI() {
  cal.refreshButtons({
    calibrate: els.btnCalibrate,
    up: els.arrows.up,
    down: els.arrows.down,
    left: els.arrows.left,
    right: els.arrows.right,
    open: els.arrows.open,
  });
  if (cal.enabled) setStatus('CALIBRATION MODE: відтворіть позицію і натисніть стрілку', 'warn');
}

els.btnCalibrate.addEventListener('click', () => {
  cal.toggle();
  refreshCalibrationUI();
});

for (const [key, name] of Object.entries({ up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', open: 'OPENED' })) {
  els.arrows[key].addEventListener('click', async () => {
    try {
      await cal.capture(name, () => tracker.last.normalized);
    } catch (e) {
      setStatus('Не вдалося зберегти еталон: ' + e.message, 'error');
    }
    refreshCalibrationUI();
  });
}

// ---------- Клавіші ----------

window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    game.reset();
    hold.reset();
    setStatus('Гру перезапущено', 'info');
  }
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
    const names = await listTemplates();
    setStatus(
      'Сервер класифікації доступний. Еталони: ' +
        (names.length ? names.join(', ') : 'тільки синтетичні (калібруйте)'),
      'info',
    );
  } catch (e) {
    setStatus('Сервер недоступний: ' + e.message + ' — гра на паузі. Вкажіть Server URL.', 'error');
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
