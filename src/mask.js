// mask.js — ROI рота, бінаризація, MORPH_OPEN, fit_to_square.
// Вхід: ImageData повного кадру (після contrast/brightness та lighting),
// landmarks (478 точок). Вихід: бінарна маска 0/255.
import { CONFIG } from './config.js';

export const INNER_LIPS_INDICES = [
  78, 191, 80, 81, 82, 13, 312, 311, 310, 415,
  308, 324, 318, 402, 317, 14, 87, 178, 88, 95,
];
const CORNERS = { left: 61, right: 291, top: 0, bottom: 17 };

/** Застосовує contrast/brightness (аналог convertScaleAbs). Повертає новий ImageData. */
export function applyContrastBrightness(imageData, contrast, brightness) {
  if (contrast === 1 && brightness === 0) return imageData;
  const w = imageData.width;
  const h = imageData.height;
  const src = imageData.data;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    out[i] = clampByte(src[i] * contrast + brightness);
    out[i + 1] = clampByte(src[i + 1] * contrast + brightness);
    out[i + 2] = clampByte(src[i + 2] * contrast + brightness);
    out[i + 3] = src[i + 3];
  }
  const result = new ImageData(w, h);
  result.data.set(out);
  return result;
}

/**
 * Будує маску стану язика/рота.
 * settings: { shadow: 0..1 }
 * Повертає { mask, maskW, maskH, thr, mouthClosed, roiRect, lipRect, mouthRect }.
 */
export function buildStateMask(imageData, landmarks, settings) {
  const w = imageData.width;
  const h = imageData.height;
  const lm = (i) => ({ x: Math.round(landmarks[i].x * w), y: Math.round(landmarks[i].y * h) });

  const l = lm(CORNERS.left);
  const r = lm(CORNERS.right);
  const t = lm(CORNERS.top);
  const b = lm(CORNERS.bottom);
  const mouthW = Math.abs(r.x - l.x);
  const mouthH = Math.abs(b.y - t.y);
  // Рот закритий за пропорцією висота/ширина (не залежить від відстані до камери)
  const mouthClosed = mouthW > 0 && mouthH < mouthW * CONFIG.mouth.closedRatio;

  const marginX = Math.max(1, Math.round(mouthW * CONFIG.mouth.marginX));
  const marginY = Math.max(1, Math.round(mouthH * CONFIG.mouth.marginY));
  const x1 = Math.max(0, Math.min(l.x, r.x) - marginX);
  const x2 = Math.min(w, Math.max(l.x, r.x) + marginX);
  const y1 = Math.max(0, t.y - marginY);
  const y2 = Math.min(h, b.y + marginY);
  const roiW = Math.max(1, x2 - x1);
  const roiH = Math.max(1, y2 - y1);

  // Grayscale ROI + медіана для порогу
  const gray = new Float32Array(roiW * roiH);
  const vals = [];
  for (let yy = 0; yy < roiH; yy++) {
    for (let xx = 0; xx < roiW; xx++) {
      const p = ((y1 + yy) * w + (x1 + xx)) * 4;
      const g = 0.299 * imageData.data[p] + 0.587 * imageData.data[p + 1] + 0.114 * imageData.data[p + 2];
      gray[yy * roiW + xx] = g;
      vals.push(g);
    }
  }
  vals.sort((a, b) => a - b);
  const median = vals[Math.floor(vals.length * 0.5)];
  let th = Math.round(median * settings.shadow);
  th = Math.max(10, Math.min(250, th));

  // Бінаризація: яскраве = 255, темне = 0
  const bin = new Uint8Array(roiW * roiH);
  for (let i = 0; i < bin.length; i++) bin[i] = gray[i] >= th ? 255 : 0;
  const opened = morphologyOpen(bin, roiW, roiH);

  // Обрізка по внутрішніх губах + паддінг.
  // По X межу беремо по КУТАХ рота (61/291) — темна зона інтер'єру не виходить
  // за них, тож маска не "ріжеться" справа/зліва при letterbox на всю ширину.
  const cornerX = [lm(CORNERS.left).x - x1, lm(CORNERS.right).x - x1];
  const iy = INNER_LIPS_INDICES.map((i) => lm(i).y - y1);
  const padX = Math.max(6, Math.round(mouthW * 0.15));
  const padY = Math.max(6, Math.round(mouthH * 0.5));
  const lx1 = Math.max(0, Math.min(...cornerX) - padX);
  const lx2 = Math.min(roiW, Math.max(...cornerX) + padX);
  const ly1 = Math.max(0, Math.min(...iy) - padY);
  const ly2 = Math.min(roiH, Math.max(...iy) + padY);
  const cropW = Math.max(1, lx2 - lx1);
  const cropH = Math.max(1, ly2 - ly1);
  const crop = new Uint8Array(cropW * cropH);
  for (let yy = 0; yy < cropH; yy++) {
    for (let xx = 0; xx < cropW; xx++) {
      crop[yy * cropW + xx] = opened[(ly1 + yy) * roiW + (lx1 + xx)];
    }
  }

  return {
    mask: crop,
    maskW: cropW,
    maskH: cropH,
    thr: th,
    mouthClosed,
    roiRect: { x: x1, y: y1, w: roiW, h: roiH },
    lipRect: { x: x1 + lx1, y: y1 + ly1, w: cropW, h: cropH },
    mouthRect: { x: Math.min(l.x, r.x), y: t.y, w: mouthW, h: mouthH },
  };
}

/** MORPH_OPEN 3×3 (ерозія потім дилатація) над бінарною маскою 0/255. */
export function morphologyOpen(bin, w, h) {
  return dilate(erode(bin, w, h), w, h);
}

function erode(bin, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) { ok = false; break; }
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) { ok = false; break; }
          if (!bin[yy * w + xx]) { ok = false; break; }
        }
      }
      out[y * w + x] = ok ? 255 : 0;
    }
  }
  return out;
}

function dilate(bin, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let any = false;
      for (let dy = -1; dy <= 1 && !any; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          if (bin[yy * w + xx]) { any = true; break; }
        }
      }
      out[y * w + x] = any ? 255 : 0;
    }
  }
  return out;
}

/** Вписує бінарну маску у квадрат size×size (letterbox, без розтягування). */
export function fitToSquare(binary, w, h, size) {
  if (!binary || w <= 0 || h <= 0) return new Uint8Array(size * size);
  const scale = Math.min(size / w, size / h);
  const nw = Math.max(1, Math.round(w * scale));
  const nh = Math.max(1, Math.round(h * scale));
  const resized = resizeNearest(binary, w, h, nw, nh);
  const canvas = new Uint8Array(size * size);
  const x0 = Math.floor((size - nw) / 2);
  const y0 = Math.floor((size - nh) / 2);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      canvas[(y0 + y) * size + (x0 + x)] = resized[y * nw + x];
    }
  }
  return canvas;
}

function resizeNearest(src, sw, sh, dw, dh) {
  const out = new Uint8Array(dw * dh);
  const xRatio = sw / dw;
  const yRatio = sh / dh;
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor(y * yRatio));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor(x * xRatio));
      out[y * dw + x] = src[sy * sw + sx];
    }
  }
  return out;
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
