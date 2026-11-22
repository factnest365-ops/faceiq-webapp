/**
 * MediaPipe FaceLandmarker in a Web Worker (spec [A] 1.2, 6.2).
 * Worker thread: model load + inference off the main thread.
 *
 * Protocol: { type: "ready" } -> ready; { type: "detect", imageData } ->
 * { type: "detect-result", landmarks, blendshapes } or { type: "error" }.
 */

export interface FaceLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  index?: number;
}

export interface DetectedFaces {
  landmarks: FaceLandmark[][];
  blendshapes: Array<{ index: number; value: number; categoryName?: string }> | null;
}

export class FaceLandmarkerWorker {
  worker: Worker;
  private ready = false;
  private waiter: Promise<void>;
  private wake: (() => void) | null = null;
  private pending: { resolve: (v: DetectedFaces) => void; reject: (e: Error) => void } | null = null;

  constructor() {
    this.worker = new Worker(new URL("./mediapipe.worker.ts", import.meta.url), { type: "module" });
    this.waiter = new Promise((resolve) => {
      this.wake = () => resolve();
    });
    this.worker.onmessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; error?: string; landmarks?: FaceLandmark[]; blendshapes?: DetectedFaces["blendshapes"] };
      if (d.type === "ready") {
        this.ready = true;
        this.wake?.();
        return;
      }
      if (d.type === "detect-result") {
        if (this.pending) {
          const p = this.pending;
          this.pending = null;
          p.resolve({ landmarks: [d.landmarks ?? []], blendshapes: d.blendshapes ?? null });
        }
        return;
      }
      if (d.type === "error" && this.pending) {
        const p = this.pending;
        this.pending = null;
        p.reject(new Error(`FaceLandmarkerWorker: ${d.error}`));
        return;
      }
    };
    this.worker.onerror = (e) => {
      if (this.pending) this.pending.reject(new Error(String((e as ErrorEvent).message)));
    };
  }

  async waitReady(): Promise<void> {
    while (!this.ready) await this.waiter;
  }

  async detect(imageData: ImageData): Promise<DetectedFaces> {
    await this.waitReady();
    if (this.pending) throw new Error("detect already in flight");
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.worker.postMessage({ type: "detect", imageData });
    });
  }
}
