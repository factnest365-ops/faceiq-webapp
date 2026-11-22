"use client";

import { useEffect, useRef, useState } from "react";

export interface NamedPoint {
  name: string;
  x: number;
  y: number;
  z: number;
  index?: number;
  confidence?: number;
}

export interface LandmarkEditorProps {
  imageData: ImageData;
  landmarks: NamedPoint[];
  mapping: Record<string, number | null>; // name -> mesh index (null = user-placed)
  userPlaced: string[]; // names that are user-placed/estimated (R-18)
  onConfirm: (ls: NamedPoint[]) => void;
}

export default function LandmarkEditor(props: LandmarkEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = useState<NamedPoint[]>(() => [...props.landmarks]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [noted, setNoted] = useState(false);

  useEffect(() => {
    setPoints(props.landmarks);
    setSelected(null);
    setNoted(false);
  }, [props.landmarks]);

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(props.imageData as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    for (const p of points) {
      const cx = p.x * canvas.width;
      const cy = p.y * canvas.height;
      const user = props.userPlaced.includes(p.name);
      if (user) {
        ctx.strokeStyle = p.name === hovered || p.name === selected ? "var(--ink)" : "var(--muted)";
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 6, cy - 6, 12, 12);
        if (p.name === hovered || p.name === selected) ctx.strokeRect(cx - 8, cy - 8, 16, 16);
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, p.name === hovered || p.name === selected ? 4 : 3, 0, Math.PI * 2);
        ctx.fillStyle = p.name === selected ? "var(--ink)" : "var(--gray)";
        ctx.fill();
      }
    }
    if (selected) {
      const p = points.find((p) => p.name === selected);
      if (p) {
        ctx.font = "0.75rem system-ui, sans-serif";
        ctx.fillStyle = "var(--ink)";
        ctx.fillText(p.name, p.x * canvas.width + 8, p.y * canvas.height - 8);
      }
    }
  };

  const onPointerDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / canvas.width;
    const my = (e.clientY - rect.top) / canvas.height;
    const hit = points.find((p) => Math.hypot((p.x - mx) * canvas.width, (p.y - my) * canvas.height) < 10);
    setSelected(hit?.name ?? null);
    if (hit && props.userPlaced.includes(hit.name)) setNoted(true);
  };

  const onPointerMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selected) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = Math.max(0, Math.min(1, (e.clientX - rect.left) / canvas.width));
    const my = Math.max(0, Math.min(1, (e.clientY - rect.top) / canvas.height));
    setPoints((prev) => prev.map((p) => (p.name === selected ? { ...p, x: mx, y: my } : p)));
    draw();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!selected) return;
    const n = 0.01;
    const dx = e.key === "ArrowLeft" ? -n : e.key === "ArrowRight" ? n : 0;
    const dy = e.key === "ArrowUp" ? -n : e.key === "ArrowDown" ? n : 0;
    if (!dx && !dy) return;
    setPoints((prev) => prev.map((p) => (p.name === selected ? { ...p, x: Math.max(0, Math.min(1, p.x + dx)), y: Math.max(0, Math.min(1, p.y + dy)) } : p)));
    draw();
  };

  useEffect(() => draw(), [points, hovered, selected]);

  const reset = () => { setPoints(props.landmarks); setSelected(null); setNoted(false); };
  const confirm = () => props.onConfirm([...points]);

  return (
    <div className="editor">
      <h2 className="editor-title">Landmarks</h2>
      <p className="hint-line">
        <span>Drag blue points, nudge with arrows.</span>
        <span className="muted"> Red squares: user-placed (trichion, ears) - move them onto the face.</span>
      </p>
      <div className="editor-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={props.imageData.width}
          height={props.imageData.height}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onMouseLeave={() => setHovered(null)}
        />
      </div>
      <div className="editor-actions">
        <button className="btn ghost" onClick={reset}>Reset</button>
        <button className="btn primary" onClick={confirm}>Confirm landmarks</button>
      </div>
      <style>{`
        .editor { width: 100%; }
        .editor-title { margin-bottom: 0.5rem; }
        .hint-line { display: flex; gap: 0.75rem; font-size: 0.85rem; color: var(--gray); }
        .editor-canvas-wrap { margin-top: 1rem; border: 1px solid var(--line); background: var(--paper); }
        .editor-canvas-wrap canvas { width: 100%; }
        .editor-actions { display: flex; gap: 10px; margin-top: 1rem; }
      `}</style>
      {noted ? <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>Trichion and ears: check they sit on the face.</p> : null}
    </div>
  );
}

