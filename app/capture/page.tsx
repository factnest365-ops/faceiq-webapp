"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

import CameraCapture from "@/components/CameraCapture";
import type { CaptureResult } from "@/components/CameraCapture";
import UploadCard from "@/components/UploadCard";
import type { FaceLandmark } from "@/lib/mediapipe";
import LandmarkEditor, { type NamedPoint } from "@/components/LandmarkEditor";
import { engine, type FacePoints } from "@/engine/geometry";
import type { Measurements } from "@/engine/geometry";
import { scoreAnalysis } from "@/engine/scoring";
import type { NormSet } from "@/engine/norms";
import normset from "@/data/normset-1.0.0.json";
import type { AnalysisData } from "@/components/AnalysisView";
import mapping from "@/engine/mapping.json";
import { saveAnonymousAnalysis } from "@/lib/anonymous";

const USER_PLACED_NAMES = ["trichion", "earL", "earR"];

interface AuthUser { id: string; email: string }

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "same-origin", ...init });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message ?? data.code ?? `HTTP ${r.status}`);
  return data as T;
}

export default function CapturePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [attest, setAttest] = useState({ terms: false, age: false });
  const [sexAtBirth, setSexAtBirth] = useState("prefer_not_to_say");
  const [scanId, setScanId] = useState<string | null>(null);
  const [captured, setCaptured] = useState<CaptureResult | null>(null);
  const [edited, setEdited] = useState<NamedPoint[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"camera" | "upload">("camera");

  useEffect(() => {
    (async () => {
      try {
        const u = await api<AuthUser>("/api/auth/me");
        if (u && u.id) setUser(u);
      } catch { /* unauthenticated */ }
      setAuthLoading(false);
    })();
  }, []);

  const start = async () => {
    setError(null);
    try {
      if (user) {
        const { scanId: id } = await api<{ scanId: string }>("/api/scans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ captureMode: "live", sexAtBirth, attest: { terms: true, age: true } }),
        });
        setScanId(id);
      } else {
        // Anonymous: local scan id - no login, no database.
        setScanId(crypto.randomUUID());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const toEditorPoints = useCallback((lms: FaceLandmark[]): NamedPoint[] => {
    const byIndex = new Map(
      Object.entries(mapping.points)
        .filter(([, i]) => i != null)
        .map(([name, i]) => [i as number, name]),
    );
    const pts = lms.map((l) => ({
      name: byIndex.get(l.index ?? -1) ?? `mesh_${l.index}`,
      x: l.x, y: l.y, z: l.z ?? 0, index: l.index, confidence: l.visibility,
    }));
    for (const n of USER_PLACED_NAMES) {
      if (!pts.some((p) => p.name === n)) pts.push({ name: n, x: 0.5, y: 0.05, z: 0, index: undefined, confidence: 1 });
    }
    return pts;
  }, []);

  const onCapture = useCallback((r: CaptureResult) => {
    setCaptured(r);
    setEdited(toEditorPoints(r.landmarks));
  }, [toEditorPoints]);

  const pick = (ls: NamedPoint[], name: string): { x: number; y: number; z: number } => {
    const p = ls.find((l) => l.name === name);
    if (!p) throw new Error(`missing landmark ${name}`);
    return { x: p.x, y: p.y, z: p.z };
  };

  const clientScores = useCallback((ls: NamedPoint[]): Record<string, number> => {
    const pts: FacePoints = {
      trichion: pick(ls, "trichion"), glabella: pick(ls, "glabella"),
      subnasale: pick(ls, "subnasale"), menton: pick(ls, "menton"),
      zygionL: pick(ls, "zygion_L"), zygionR: pick(ls, "zygion_R"),
      gonionL: pick(ls, "gonion_L"), gonionR: pick(ls, "gonion_R"),
      innerCanthusL: pick(ls, "inner_canthus_L"), innerCanthusR: pick(ls, "inner_canthus_R"),
      outerCanthusL: pick(ls, "outer_canthus_L"), outerCanthusR: pick(ls, "outer_canthus_R"),
      eyeTopL: pick(ls, "eye_top_L"), eyeBottomL: pick(ls, "eye_bottom_L"),
      eyeTopR: pick(ls, "eye_top_R"), eyeBottomR: pick(ls, "eye_bottom_R"),
      irisCenterL: pick(ls, "iris_center_L"), irisCenterR: pick(ls, "iris_center_R"),
      nasion: pick(ls, "nasion"), alarBaseL: pick(ls, "alar_base_L"), alarBaseR: pick(ls, "alar_base_R"),
      philtrum: pick(ls, "philtrum"), stomion: pick(ls, "stomion"),
      mouthCornerL: pick(ls, "mouth_corner_L"), mouthCornerR: pick(ls, "mouth_corner_R"),
      browTopL: pick(ls, "brow_top_L"), browTopR: pick(ls, "brow_top_R"),
      earL: pick(ls, "ear_L"), earR: pick(ls, "ear_R"),
    };
    const meas: Measurements = engine(pts);
    const out: Record<string, number> = {};
    for (const k of Object.keys(meas)) out[k] = (meas as Record<string, { value: number }>)[k].value;
    return out;
  }, []);

  const submit = async () => {
    if (!scanId || !edited || !captured) { setError("Confirm landmarks first"); return; }
    setSubmitting(true);
    try {
      if (user) {
        const { analysisId } = await api<{ analysisId: string }>(`/api/scans/${scanId}/landmarks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            landmarks: namedPointsToPayload(edited),
            engineVersion: "1.0.0",
            clientScores: clientScores(edited),
            source: mode === "upload" ? "uploaded" : "manual_review",
            framesFused: captured.framesFused,
            imageWidth: captured.imageWidth,
            imageHeight: captured.imageHeight,
          }),
        });
        router.push(`/result/${analysisId}`);
        return;
      }
      // Anonymous: compute the analysis in the browser - the engine and norm set are static client code.
      const id = crypto.randomUUID();
      const norm = normset as unknown as NormSet;
      const summary = scoreAnalysis(engine(clientScores(edited) as unknown as FacePoints), norm, sexAtBirth);
      const data: AnalysisData = {
        analysisId: id,
        engineVersion: norm.engine_version,
        normVersion: norm.version,
        harmony: summary.pillar,
        overall: summary.overall,
        band: summary.band,
        confidence: summary.confidence,
        captureMode: mode === "upload" ? "upload" : "live",
        limitations: summary.limitations,
        strengths: summary.strengths,
        flaws: summary.flaws,
        possible: summary.possible,
        measurements: summary.measurements.map((m) => ({
          key: m.key,
          value: m.value,
          status: m.status,
          score: m.score,
          observed: m.observed,
          range: m.range,
          region: m.region,
          tier: m.tier,
          weight: m.weight,
        })),
      };
      saveAnonymousAnalysis(id, data);
      router.push(`/result/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) return <div className="wrap"><p className="muted">Checking sign-in…</p></div>;

  return (
    <div className="wrap">
      <header className="page-header">
        <h1>FaceIQ Labs</h1>
        <div className="topbar">
          {user ? (
            <a href="/history" className="btn ghost">History</a>
          ) : (
            <a href="/api/auth/google" className="btn ghost">Sign in</a>
          )}
        </div>
      </header>
      {error && <div className="err mt1">{error}</div>}

      <section className="attest">
        <h2>Attestations</h2>
        <div className="attest-checks">
          <label className="form-label" style={{ flexDirection: "row" }}><input type="checkbox" checked={attest.terms} onChange={(e) => setAttest({ ...attest, terms: e.target.checked })} /> <span>I have read and accept the terms of service</span></label>
          <label className="form-label" style={{ flexDirection: "row" }}><input type="checkbox" checked={attest.age} onChange={(e) => setAttest({ ...attest, age: e.target.checked })} /> <span>I attest I am 18 or older</span></label>
        </div>
        <p className="form-hint">Terms: measurement-based rating is a map of your face, not a verdict on your attractiveness or health. Expression, styling, voice, and personality are not visible in photos.</p>
      </section>

      <section className="attest">
        <div className="select-label">
          <label>Sex assigned at birth</label>
          <select value={sexAtBirth} onChange={(e) => setSexAtBirth(e.target.value)}>
            <option value="prefer_not_to_say">Prefer not to say (pooled norms)</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </div>
      </section>

      <button className="btn primary" onClick={start} disabled={!(attest.terms && attest.age)}>Start capture</button>

      {scanId && !captured ? (
        <>
          <h2 className="mt1">2. Capture</h2>
          <p className="form-hint mt1">{mode === "camera"
            ? "Stand about 2m from the camera, face the camera, head level, neutral expression, hair off the face, no filters."
            : "Upload a front-facing photo (JPEG/PNG/WebP/HEIC, max 20 MB). Whole face visible, neutral expression, no filters."}</p>
          <div className="mode-toggle">
            <button className={mode === "camera" ? "btn" : "btn ghost"} onClick={() => setMode("camera")}>Live camera</button>
            <button className={mode === "upload" ? "btn" : "btn ghost"} onClick={() => setMode("upload")}>Upload file</button>
          </div>
          {mode === "camera" ? <CameraCapture onCapture={onCapture} live /> : <UploadCard onCapture={onCapture} />}
        </>
      ) : null}

      {captured ? (
        <>
          <h2 className="mt1">3. Landmark review</h2>
          <LandmarkEditor
            imageData={captured.imageData}
            landmarks={edited ?? toEditorPoints(captured.landmarks)}
            mapping={mapping.points as Record<string, number | null>}
            userPlaced={USER_PLACED_NAMES}
            onConfirm={setEdited}
          />
          {mode === "upload" ? <p className="form-hint">Uploaded capture: single frame, so confidence is lower than live.</p> : null}
          <button className="btn primary" onClick={submit} disabled={submitting || !edited}>
            {submitting ? "Analyzing…" : "Confirm analysis"}
          </button>
        </>
      ) : null}

      <style>{`
        .attest { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 1.5rem 0; margin-top: 2.5rem; }
        .attest h2 { margin-bottom: 0.75rem; }
        .attest-checks { display: flex; flex-direction: column; gap: 6px; }
        .mode-toggle { display: flex; gap: 0; margin: 1.5rem 0; }
        .mode-toggle .btn { flex: 1; text-align: center; }
      `}</style>
    </div>
  );
}

function namedPointsToPayload(ls: NamedPoint[]): Record<string, { x: number; y: number; z: number; confidence?: number }> {
  const out: Record<string, { x: number; y: number; z: number; confidence?: number }> = {};
  for (const p of ls) out[p.name] = { x: p.x, y: p.y, z: p.z, ...(p.confidence !== undefined ? { confidence: p.confidence } : {}) };
  return out;
}
