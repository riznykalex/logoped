// lighting.js — JS-порт normalize_face_lighting.
// Темна половина обличчя освітлюється горизонтальним градієнтом
// від краю обличчя до центру cx. Світла половина не змінюється.
// strength у [0..1]. Посилено: більший gain + степенева крива градієнта.
import { CONFIG } from './config.js';

const PERCENTILE = CONFIG.lighting.percentile;
const MAX_GAIN = CONFIG.lighting.maxGain;
const GRAD_POWER = CONFIG.lighting.gradPower;

/**
 * Будує маску обличчя (0/255) за опуклою оболонкою точок landmarks.
 * Проста растерізація опуклого полігона по рядках (підхід scanline).
 */
export function faceMaskFromLandmarks(landmarks, w, h) {
  const pts = landmarks.map((lm) => [Math.round(lm.x * w), Math.round(lm.y * h)]);
  if (pts.length < 3) return null;

  // Andrew monotone chain — опуклий контур
  const hull = convexHull(pts);
  if (hull.length < 3) return null;

  const mask = new Uint8Array(w * h);
  const ys = hull.map((p) => p[1]);
  const xs = hull.map((p) => p[0]);
  const yMin = Math.max(0, Math.min(...ys));
  const yMax = Math.min(h - 1, Math.max(...ys));

  for (let y = yMin; y <= yMax; y++) {
    const crossings = [];
    for (let i = 0; i < hull.length; i++) {
      const p1 = hull[i];
      const p2 = hull[(i + 1) % hull.length];
      const y1 = p1[1];
      const y2 = p2[1];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        const t = (y - y1) / (y2 - y1);
        crossings.push(p1[0] + t * (p2[0] - p1[0]));
      }
    }
    if (crossings.length < 2) continue;
    crossings.sort((a, b) => a - b);
    for (let x = Math.max(0, Math.ceil(crossings[0])); x <= Math.min(w - 1, Math.floor(crossings[1])); x++) {
      mask[y * w + x] = 255;
    }
  }
  return mask;
}

// Монотонний ланцюг Ендрю (опуклий контур), повертає масив [x, y].
export function convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 1) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Вирівнює освітлення кадру. Повертає новий ImageData (w×h).
 * data — ImageData.data (RGBA) з попередньо застосованим contrast/brightness.
 */
export function normalizeFaceLighting(imageData, landmarks, strength) {
  if (strength <= 0) return imageData;
  const w = imageData.width;
  const h = imageData.height;
  const src = imageData.data;

  const mask = faceMaskFromLandmarks(landmarks, w, h);
  if (!mask) return imageData;

  // Яскравості пікселів обличчя + межі по горизонталі
  const xsInFace = [];
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const g = 0.299 * src[p] + 0.587 * src[p + 1] + 0.114 * src[p + 2];
    gray[i] = g;
    if (mask[i]) xsInFace.push(i % w);
  }
  if (xsInFace.length === 0) return imageData;
  let xMin = Infinity;
  let xMax = -Infinity;
  for (const x of xsInFace) {
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
  }
  const cx = Math.floor((xMin + xMax) / 2);

  // 75-й перцентиль яскравості кожної половини
  const leftVals = [];
  const rightVals = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    const x = i % w;
    if (x < cx) leftVals.push(gray[i]);
    else rightVals.push(gray[i]);
  }
  const L = percentile(leftVals, PERCENTILE);
  const R = percentile(rightVals, PERCENTILE);
  if (Math.min(L, R) < 5) return imageData;

  let darkSide;
  let gain;
  let xEdge;
  if (L < R) {
    darkSide = 'left';
    gain = Math.min(R / Math.max(L, 1), MAX_GAIN);
    xEdge = xMin;
  } else {
    darkSide = 'right';
    gain = Math.min(L / Math.max(R, 1), MAX_GAIN);
    xEdge = xMax;
  }
  if (gain <= 1.01) return imageData;

  // Горизонтальний градієнт: 1.0 на темному краю -> 0.0 на cx.
  // Степенева крива grad^GRAD_POWER підсилює середню зону темної половини.
  const span = Math.max(Math.abs(cx - xEdge), 1);
  const out = new Uint8ClampedArray(src); // копія RGBA
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      let grad;
      if (darkSide === 'left') {
        grad = x < cx ? (cx - x) / span : 0;
      } else {
        grad = x >= cx ? (x - cx) / span : 0;
      }
      const correction = 1 + (gain - 1) * Math.pow(grad, GRAD_POWER) * strength;
      const p = (y * w + x) * 4;
      out[p] = clampByte(src[p] * correction);
      out[p + 1] = clampByte(src[p + 1] * correction);
      out[p + 2] = clampByte(src[p + 2] * correction);
    }
  }
  const result = new ImageData(w, h);
  result.data.set(out);
  return result;
}

function percentile(sortedOrNot, p) {
  // Масиви невеликі (пікселі половини обличчя) — копіюємо й сортуємо
  const a = Array.from(sortedOrNot);
  if (a.length === 0) return 0;
  a.sort((x, y) => x - y);
  const idx = Math.min(a.length - 1, Math.floor((a.length - 1) * (p / 100)));
  return a[idx];
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
