"use client";

import type { StrengthGroup, Flaw, PossibleItem } from "@/engine/scoring";

export interface MeasurementRow {
  key: string;
  value: number | null;
  status: string;
  score: number | null;
  observed: number | null;
  range: { lo: number; hi: number; w_lo: number; w_hi: number; weight: number; source: string; population: string; n: number; method: string; sigma_measurement?: number } | null;
  region: string;
  tier: string;
  weight: number;
}

export interface AnalysisData {
  analysisId: string;
  engineVersion: string;
  normVersion: string;
  harmony: number;
  overall: number;
  band: string;
  confidence: number;
  captureMode?: "live" | "upload";
  limitations: string[];
  strengths: StrengthGroup[];
  flaws: Flaw[];
  possible: PossibleItem[];
  measurements: MeasurementRow[];
}

const KEY_LABELS: Record<string, string> = {
  third_upper: "Upper third",
  third_middle: "Middle third",
  third_lower: "Lower third",
  face_height_width: "Face height : width",
  eye_mouth_length: "Eye to mouth span",
  interocular_face_width: "Interocular / face width",
  intercanthal_eye_width: "Intercanthal / eye width",
  eye_aspect: "Eye aspect",
  canthal_tilt: "Canthal tilt (avg L/R)",
  lip_ratio: "Upper : lower lip",
  bigonial_bizygonomic: "Bigonial / bizygonomic",
  symmetry_index: "Symmetry index",
  fwhr_upper: "FWHR (brow-top : philtrum)",
  midface_ratio: "Midface (IPD : lip)",
  nose_width_ratio: "Nose width / ICD",
  nasal_index: "Nasal index",
  mouth_nose_ratio: "Mouth / alar width",
  chin_philtrum: "Chin : philtrum",
  bitemporal_ratio: "Bitemporal / width",
};

const DISCLAIMERS = [
  "Measurement-based rating is a map of your face, not a verdict on your attractiveness or health.",
  "Expression, styling, voice, and personality are not visible in a photo.",
];

function fmt(n: number | null): string {
  if (n === null) return "—";
  return String(n.toFixed(2));
}

export default function AnalysisView(props: { data: AnalysisData }) {
  const d = props.data;
  const badges = [
    "Front only",
    d.captureMode === "upload" ? "Upload" : "Live",
    "Harmony only (Angularity/Dimorphism/Features: Phase 2)",
  ].filter(Boolean);
  return (
    <div className="wrap">
      <header className="page-header">
        <h1>FaceIQ Labs</h1>
        <div className="topbar">
          <span className="badge">v1</span>
          <a href="/history" className="btn ghost">History</a>
        </div>
      </header>

      {badges.map((b) => (
        <div className="badge" style={{ display: "inline-block", marginRight: 8 }} key={b}>{b}</div>
      ))}

      <div className="score-wrap">
        <span className="score">{d.overall}<sup>/10</sup></span>
        <span className="band">{d.band}</span>
      </div>
      <div className="conf-line">confidence {Math.round(d.confidence * 100)}% - {d.harmony.toFixed(2)} harmony - engine {d.engineVersion} / norm {d.normVersion}</div>

      <h2 className="mt1">Strengths</h2>
      {d.strengths.length === 0 ? <p className="muted mt1">None in range.</p> : null}
      {d.strengths.map((g) => (
        <div className="group" key={g.region}>
          <h3>{g.region}</h3>
          <ul>
            {g.measurements.map((m) => (
              <li key={m.key}>{KEY_LABELS[m.key] ?? m.key}: {fmt(m.observed)}</li>
            ))}
          </ul>
        </div>
      ))}

      {d.flaws.length > 0 ? (
        <>
          <h2 className="mt2">Flaws (ranked by impact)</h2>
          {d.flaws.map((f) => (
            <div className="flaw" key={f.key}>
              <strong>{KEY_LABELS[f.key] ?? f.key}</strong>
              {" "}
              observed {fmt(f.observed)} - if moved to the edge of its range, score would rise +{fmt(f.impact)}
            </div>
          ))}
        </>
      ) : null}

      {d.possible.length > 0 ? (
        <>
          <h2 className="mt2">Possible (geometric simulation, not prediction)</h2>
          <ul className="possible">
            {d.possible.map((p) => (
              <li key={p.key}>
                <strong>{KEY_LABELS[p.key] ?? p.key}</strong>: if {fmt(p.target)}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2 className="mt2">All measurements</h2>
      <table className="data mt2">
        <thead>
          <tr>
            <th>Measurement</th><th>Observed</th><th>Range</th><th>Score</th><th>Weight</th><th>Source</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {d.measurements.map((m) => (
            <tr key={m.key}>
              <td>{KEY_LABELS[m.key] ?? m.key}</td>
              <td className="num">{fmt(m.observed)}</td>
              <td className="num">{m.range ? `${m.range.lo.toFixed(2)} – ${m.range.hi.toFixed(2)}` : "—"}</td>
              <td className="num">{m.score !== null ? `${m.score.toFixed(1)}` : "—"}</td>
              <td className="num">{m.weight > 0 ? m.weight.toFixed(2) : "0"}</td>
              <td>{m.range?.source ?? "—"}</td>
              <td>{m.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {d.limitations.length > 0 ? (
        <div className="disclaimers mt2">
          <h2>Limitations</h2>
          <ul>{d.limitations.map((l) => <li key={l.slice(0, 30)}>{l}</li>)}</ul>
        </div>
      ) : null}

      <div className="disclaimers mt2">
        <h2>Notes</h2>
        <ul>{DISCLAIMERS.map((l) => <li key={l.slice(0, 30)}>{l}</li>)}</ul>
      </div>
    </div>
  );
}
