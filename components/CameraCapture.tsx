"use client";

import { useEffect, useRef, useState, useCallback } from "react";

import { FaceLandmarkerWorker } from "@/lib/mediapipe";
import type { FaceLandmark } from "@/lib/mediapipe";
import { computeGates, firstGateFailing, gatesAllPass, type Gate } from "./CaptureGate";

/** Pose (yaw) from the interpupil line of MediaPipe landmarks (spec [A] 2.3). */
function interpupilAngle(lm: FaceLandmark[]): number {
  const p = (i: number) => ({ x: lm[i]?.x ?? 0, y: lm[i]?.y ?? 0 });
  const L = p(468), R = p(473);
  return (Math.atan2(R.y - L.y, R.x - L.x) * 180) / Math.PI;
}

/** IPD span in normalized units (face_size gate input, spec R-09). */
function ipdSpan(lm: FaceLandmark[], widthPx: number): number {
  if (!lm[468] || !lm[473]) return 0;
  return Math.hypot(lm[473].x - lm[468].x, lm[473].y - lm[468].y) * widthPx;
}

/** Laplacian variance on grayscale (blur gate input, spec R-09). */
function blurVariance(img: HTMLImageElement | HTMLVideoElement, canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) return 50;
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const w = canvas.width, h = canvas.height;
  if (w < 5 || h < 5 || imgData.length === 0) return 50;
  let acc = 0, acc2 = 0;
  const N = (w * h) / 9;
  for (let y = 1; y < h - 1; y += 3) {
    for (let x = 1; x < w - 1; x += 3) {
      const luma = (i: number) => 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
      const d = 4 * luma((y * w + x) * 4)
        - luma(((y - 1) * w + x) * 4) - luma(((y + 1) * w + x) * 4)
        - luma((y * w + x - 1) * 4) - luma((y * w + x + 1) * 4);
      acc += d; acc2 += d * d;
    }
  }
  const m = acc / N;
  return Math.max(0, acc2 / N - m * m);
}

export interface CaptureResult {
  imageData: ImageData;
  landmarks: FaceLandmark[];
  framesFused: number;
  imageWidth: number;
  imageHeight: number;
}

/** Shared detection+gates (spec [A] 2.3, 5.1). Returns gates + raw landmarks. */
export async function detectFromImage(
  lmk: FaceLandmarkerWorker,
  img: HTMLImageElement | HTMLVideoElement,
  canvas: HTMLCanvasElement,
  lumaStats: (img: HTMLImageElement | HTMLVideoElement) => void,
): Promise<{ gates: Gate[]; landmarks: FaceLandmark[] }> {
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  lumaStats(img);
  const res = await lmk.detect(ctx.getImageData(0, 0, canvas.width, canvas.height));
  const landmarks = res.landmarks[0] ?? [];
  const roll = interpupilAngle(landmarks);
  const pitch = landmarks[4] ? Math.abs(landmarks[4].z ?? 0) : 0;
  const occluded = landmarks.length < 300;
  const blur = blurVariance(img, canvas);
  const gates = computeGates(
    landmarks.length > 0,
    res.landmarks.length,
    0,
    Math.abs(pitch) > 5 ? pitch : 0,
    Math.abs(roll) > 5 ? roll : 0,
    ipdSpan(landmarks, canvas.width),
    blur,
    40,
    210,
    0,
    0.15,
    0.15,
    0.3,
    0,
    occluded,
  );
  return { gates, landmarks };
}

export default function CameraCapture(props: { onCapture: (r: CaptureResult) => void; live: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [gates, setGates] = useState<Gate[]>([]);
  const [faceCount, setFaceCount] = useState(0);
  const [landmarkCount, setLandmarkCount] = useState(0);
  const [luma, setLuma] = useState({ min: 40, max: 210 });
  const [occluded, setOccluded] = useState(false);
  const landmarker = useRef<FaceLandmarkerWorker | null>(null);

  useEffect(() => {
    landmarker.current = new FaceLandmarkerWorker();
    landmarker.current.waitReady().catch((e) => setError(String(e)));
    return () => {
      landmarker.current?.worker.terminate();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 1920, height: 1080 }, audio: false })
      .then((stream) => {
        video.srcObject = stream;
        video.play().catch((e) => setError(String(e)));
      })
      .catch((e) => setError(String(e)));
    return () => {
      (video.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const lumaStats = useCallback((img: HTMLImageElement | HTMLVideoElement) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    if (d.length === 0) return;
    let min = 255, max = 0, sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (l < min) min = l;
      if (l > max) max = l;
      sum += l;
    }
    const mean = sum / (d.length / 4);
    setLuma({ min: Math.min(min, mean), max: Math.max(max, mean) });
  }, []);

  const blurVarianceCb = useCallback((img: HTMLImageElement | HTMLVideoElement): number => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return 50;
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const w = canvas.width, h = canvas.height;
    if (w < 5 || h < 5) return 50;
    let acc = 0, acc2 = 0;
    const N = (w * h) / 9;
    for (let y = 1; y < h - 1; y += 3) {
      for (let x = 1; x < w - 1; x += 3) {
        const luma = (i: number) => 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
        const d = 4 * luma((y * w + x) * 4)
          - luma(((y - 1) * w + x) * 4) - luma(((y + 1) * w + x) * 4)
          - luma((y * w + x - 1) * 4) - luma((y * w + x + 1) * 4);
        acc += d; acc2 += d * d;
      }
    }
    const m = acc / N;
    return Math.max(0, acc2 / N - m * m);
  }, []);

  const runDetection = useCallback(async (img: HTMLImageElement | HTMLVideoElement) => {
    const lmk = landmarker.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!lmk || !canvas || !ctx) return;
    lumaStats(img);
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    let lms: FaceLandmark[] = [];
    try {
      const res = await lmk.detect(ctx.getImageData(0, 0, canvas.width, canvas.height));
      lms = res.landmarks[0] ?? [];
    } catch (e) {
      setError(String(e));
      return;
    }
    setLandmarkCount(lms.length);
    setFaceCount(lms.length > 0 ? 1 : 0);
    setOccluded(lms.length < 300);
    const roll = interpupilAngle(lms);
    const pitch = lms[4] ? Math.abs(lms[4].z ?? 0) : 0;
    const gates = computeGates(
      lms.length > 0,
      lms.length > 0 ? 1 : 0,
      0,
      Math.abs(pitch) > 5 ? pitch : 0,
      Math.abs(roll) > 5 ? roll : 0,
      ipdSpan(lms, canvas.width),
      blurVarianceCb(img),
      luma.min,
      luma.max,
      0,
      0.15,
      0.15,
      0.3,
      0,
      occluded,
    );
    setGates(gates);
    if (gatesAllPass(gates)) {
      props.onCapture({ imageData: ctx.getImageData(0, 0, canvas.width, canvas.height), landmarks: lms, framesFused: props.live ? 5 : 1, imageWidth: canvas.width, imageHeight: canvas.height });
    }
  }, [luma, occluded, lumaStats, blurVarianceCb, props]);

  useEffect(() => {
    if (!props.live) return;
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    const loop = async () => {
      if (cancelled || video.readyState < 1) return;
      await runDetection(video);
      if (!cancelled) setTimeout(loop, 250);
    };
    void loop();
    return () => { cancelled = true; };
  }, [props.live, runDetection]);

  const fail = firstGateFailing(gates);
  return (
    <div className="cam">
      <div style={{ position: "relative", width: "min(100%, 560px)", margin: "0 auto" }}>
        <video ref={videoRef} muted playsInline width="100%" />
        <div className="face-box" />
        {gates.length > 0 && (
          <div className="gate-msg">
            {fail ? fail.message : "Retake: ready - capture"}
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>
      <div className="status-row">
        <span className="status">faces: {faceCount} landmarks: {landmarkCount}</span>
        {error && <span className="err">{error}</span>}
      </div>
      <style>{CAMERA_CSS}</style>
    </div>
  );
}

export const CAMERA_CSS = `
.cam { font: 14px/1.5 system-ui, sans-serif; }
.cam video { width: 100%; background: #fff; border: 1px solid var(--line); display: block; }
.face-box { position: absolute; inset: 0; border: 1px solid rgba(0,0,0,0.35); box-sizing: border-box; }
.gate-msg { position: absolute; top: 0.75rem; left: 50%; transform: translateX(-50%); background: rgba(255,255,255,0.92); color: var(--ink); border: 1px solid var(--line-2); padding: 5px 10px; font-size: 0.8rem; }
.status-row { margin-top: 0.5rem; font-size: 0.8rem; color: var(--gray); display: flex; gap: 12px; }
.err { color: #b30000; }
`;
