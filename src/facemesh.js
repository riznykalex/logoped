// facemesh.js — обгортка MediaPipe FaceLandmarker (Tasks Vision, JS/WASM).
import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm';

let landmarker = null;

/**
 * Ініціалізує FaceLandmarker (модель assets/face_landmarker.task).
 * Викликається один раз перед першим кадром.
 */
export async function initFaceLandmarker(modelAssetPath = 'assets/face_landmarker.task') {
  const resolver = await FilesetResolver.forVisionTasks(WASM_URL);
  landmarker = await FaceLandmarker.createFromOptions(resolver, {
    baseOptions: { modelAssetPath, delegate: 'GPU' },
    outputFaceBlendshapes: false,
    runningMode: 'VIDEO',
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  return landmarker;
}

export function isFaceLandmarkerReady() {
  return landmarker !== null;
}

/**
 * Виявляє обличчя на поточному кадрі відео.
 * Повертає масив нормалізованих точок {x, y, z} (478 точок)
 * або null, якщо обличчя не знайдено.
 */
export function detectFace(video, now) {
  if (!landmarker) return null;
  const result = landmarker.detectForVideo(video, now);
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) return null;
  return result.faceLandmarks[0];
}
