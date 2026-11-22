/**
 * MediaPipe FaceLandmarker worker (spec [A] 1.2, 6.2): model load + inference
 * off the main thread. Protocol: the worker sets `onmessage` FIRST, then posts
 * { type: "ready" }; the page sends { type: "detect", imageData }; the worker
 * replies { type: "detect-result", landmarks, blendshapes } or { type: "error" }.
 */
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

async function main(): Promise<void> {
  const vision = await FilesetResolver.forVisionTasks("/wasm");
  const landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "/face_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
  });

  self.onmessage = async (e: MessageEvent) => {
    if (e.data?.type !== "detect") return;
    try {
      const imageData: ImageData = e.data.imageData;
      const canvas = new OffscreenCanvas(imageData.width, imageData.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.putImageData(imageData, 0, 0);
      const img: ImageBitmap | ImageData = canvas.transferToImageBitmap?.() ?? imageData;
      const result = await landmarker.detectForVideo(img as ImageBitmap, performance.now());
      const face = result.faceLandmarks[0] ?? [];
      const landmarks = face.map((l, i) => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility, index: i }));
      const blendshapes = result.faceBlendshapes?.[0]?.categories.map((c) => ({ index: c.index, value: c.score, categoryName: c.categoryName }));
      self.postMessage({ type: "detect-result", landmarks, blendshapes });
    } catch (err) {
      self.postMessage({ type: "error", error: String(err) });
    }
  };

  self.postMessage({ type: "ready" });
}

void main();
