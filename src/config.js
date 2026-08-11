// config.js — всі налаштування в одному місці.
// Редагувати тут, без пошуку по коду.

export const CONFIG = {
  // Сервер класифікації (Template Matching на домашньому сервері)
  server: {
    defaultUrl: 'https://tongue.6306617.xyz',
    classifyTimeoutMs: 3000,
    calibrateTimeoutMs: 5000,
    templatesTimeoutMs: 3000,
  },

  // Класифікація через сервер
  classify: {
    intervalMs: 50, // мінімальний інтервал між POST /classify (~20/с)
  },

  // Стабілізація стану язика
  hold: {
    ms: 80, // час утримання стану перед підтвердженням (затримка ≈ RTT + це)
  },

  // Обличчя
  face: {
    lostPauseMs: 2000, // пауза гри після втрати обличчя
  },

  // Маска для серверного matching
  tracker: {
    maskSize: 64, // маска maskSize×maskSize (має збігатися з SIZE у server.py)
  },

  // Рот / зона захоплення (mask.js)
  mouth: {
    closedH: 8, // висота рота < цього → рот закритий
    marginX: 0.4, // поля ROI по X, частка ширини рота
    marginY: 1.2, // поля ROI по Y, частка висоти рота
  },

  // Нормалізація освітлення (lighting.js)
  lighting: {
    percentile: 75,
    maxGain: 5.0,
    gradPower: 0.65,
  },

  // Повзунки обробки кадру
  sliders: {
    contrast: { min: 1, max: 3, step: 0.1, default: 1.0 },
    brightness: { min: -100, max: 100, step: 1, default: 0 },
    light: { min: 0, max: 200, step: 1, default: 100 },
    shadow: { min: 0, max: 100, step: 1, default: 70 },
  },

  // Гра: змійка
  snake: {
    stepMs: 900, // базовий крок (мс) — вдвічі повільніше
    speedupPerFruit: 30, // кожен зібраний фрукт пришвидшує на стільки мс
    minStepMs: 300, // нижня межа — далі швидкість не росте
    winScore: 12, // стільки фруктів треба зібрати для перемоги
    cols: 10, // сітка по ширині (більший крок)
    rows: 11, // сітка по висоті
  },
};
