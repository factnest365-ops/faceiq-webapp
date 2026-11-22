"use client";

import { useEffect, useRef, useState } from "react";

import { detectFromImage, type CaptureResult } from "@/components/CameraCapture";
import { FaceLandmarkerWorker } from "@/lib/mediapipe";
import { firstGateFailing, gatesAllPass, type Gate } from "@/components/CaptureGate";

export default function UploadCard(props: { onCapture: (r: CaptureResult) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [gates, setGates] = useState<Gate[]>([]);
  const [landmarkCount, setLandmarkCount] = useState(0);
  const landmarker = useRef<FaceLandmarkerWorker | null>(null);

  useEffect(() => {
    landmarker.current = new FaceLandmarkerWorker();
    landmarker.current.waitReady().catch((e) => setError(String(e)));
    return () => landmarker.current?.worker.terminate();
  }, []);

  const onFile = async (f: File) => {
    setError(null);
    setAccepted(false);
    setGates([]);
    if (!f.type.startsWith("image/") || f.size > 20 * 1024 * 1024) {
      setError("Accept JPEG/PNG/WebP/HEIC, up to 20 MB");
      return;
    }
    const img = new Image();
    img.onload = async () => {
      const canvas = canvasRef.current;
      if (!canvas || !landmarker.current) return;
      const { gates, landmarks } = await detectFromImage(landmarker.current, img, canvas, () => {});
      setGates(gates);
      setLandmarkCount(landmarks.length);
      if (gatesAllPass(gates)) {
        setAccepted(true);
        props.onCapture({
          imageData: canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height),
          landmarks,
          framesFused: 1,
          imageWidth: canvas.width,
          imageHeight: canvas.height,
        });
      }
    };
    img.onerror = () => setError("Could not load image");
    img.src = URL.createObjectURL(f);
  };

  return (
    <div className="upload-card">
      <label className="file-input" onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f); }} onDragOver={(e) => e.preventDefault()}>
        Drag a photo here, or
        <span className="inline-link" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}> choose a file</span>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="hidden-input" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>
      <div className="upload-status">
        {gates.length > 0 && !firstGateFailing(gates) ? "Ready - face detected, head level" : gates.length > 0 ? `${firstGateFailing(gates)!.message}` : null}
        {landmarkCount > 0 ? `Landmarks: ${landmarkCount}` : null}
      </div>
      {error && <div className="err">{error}</div>}
      {accepted ? <div className="accept-note">Single-frame upload: confidence is lower than live.</div> : null}
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <style>{`
        .hidden-input { display: none; }
        .inline-link { display: inline; text-decoration: underline; cursor: pointer; margin-left: 6px; }
        .accept-note { font-size: 0.8rem; color: var(--ink-2); }
      `}</style>
    </div>
  );
}
