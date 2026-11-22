"use client";

import { useEffect, useState } from "react";

import { FaceLandmarkerWorker } from "@/lib/mediapipe";
import { detectFromImage } from "@/components/CameraCapture";

export default function MediaPipeSmoke() {
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const l = (s: string) => {
      console.log(`SMOKELOG ${s}`);
      if (!cancelled) setLog((a) => [...a, s]);
    };
    (async () => {
      try {
        const lmk = new FaceLandmarkerWorker();
        lmk.worker.addEventListener("message", (e) => l(`WRAPMSG ${JSON.stringify(e.data).slice(0, 150)}`));
        await lmk.waitReady();
        l("worker ready");
        const img = new Image();
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error("image failed to load"));
          img.src = "/mediapipe-smoke-face.jpg";
        });
        l(`image loaded ${img.naturalWidth}x${img.naturalHeight}`);
        const canvas = document.createElement("canvas");
        const { gates, landmarks } = await detectFromImage(lmk, img, canvas, () => {});
        l(`detected landmarks=${landmarks.length} gates_fail=${gates.filter((g) => !g.pass).map((g) => g.key).join(",") || "none"}`);
        lmk.worker.terminate();
        l("smoke done");
      } catch (e) {
        l(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ font: "14px monospace", padding: 24, maxWidth: 800 }}>
      <pre>{log.join("\n")}</pre>
      <style>{`div { max-width: 800px; } pre { white-space: pre-wrap; }`}</style>
    </div>
  );
}
