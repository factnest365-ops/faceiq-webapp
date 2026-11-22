/**
 * Server-side recompute + validation (spec 7.1, A-03/A-05/A-06).
 *
 * - The server recomputes from submitted landmarks with the same engine
 *   version; a mismatch is a hard error (ENGINE_MISMATCH).
 * - The server validates the submitted landmark set (A-05).
 * - The endpoint is idempotent (A-06).
 */

import { engine, type FacePoints, type MeasurementKey, type Pt } from "../engine/geometry";
import type { Measurements } from "../engine/geometry";
import type { NormSet } from "../engine/norms";
import { scoreAnalysis } from "../engine/scoring";

export class TypedError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "TypedError";
    this.code = code;
    this.status = status;
  }
}

export type NamedPoint = Pt & { confidence?: number };

export interface NamedPoints {
  trichion: NamedPoint;
  glabella: NamedPoint;
  subnasale: NamedPoint;
  menton: NamedPoint;
  zygionL: NamedPoint;
  zygionR: NamedPoint;
  gonionL: NamedPoint;
  gonionR: NamedPoint;
  innerCanthusL: NamedPoint;
  innerCanthusR: NamedPoint;
  outerCanthusL: NamedPoint;
  outerCanthusR: NamedPoint;
  eyeTopL: NamedPoint;
  eyeBottomL: NamedPoint;
  eyeTopR: NamedPoint;
  eyeBottomR: NamedPoint;
  irisCenterL: NamedPoint;
  irisCenterR: NamedPoint;
  nasion: NamedPoint;
  alarBaseL: NamedPoint;
  alarBaseR: NamedPoint;
  philtrum: NamedPoint;
  stomion: NamedPoint;
  mouthCornerL: NamedPoint;
  mouthCornerR: NamedPoint;
  browTopL: NamedPoint;
  browTopR: NamedPoint;
  earL: NamedPoint;
  earR: NamedPoint;
}

export const POINT_NAMES: Array<keyof NamedPoints> = [
  "trichion", "glabella", "subnasale", "menton", "zygionL", "zygionR",
  "gonionL", "gonionR", "innerCanthusL", "innerCanthusR", "outerCanthusL",
  "outerCanthusR", "eyeTopL", "eyeBottomL", "eyeTopR", "eyeBottomR",
  "irisCenterL", "irisCenterR", "nasion", "alarBaseL", "alarBaseR",
  "philtrum", "stomion", "mouthCornerL", "mouthCornerR", "browTopL",
  "browTopR", "earL", "earR",
];

function validateLandmarkPayload(payload: unknown): NamedPoints {
  if (typeof payload !== "object" || payload === null) {
    throw bad("FACE_POINT_MISSING", "landmark set must be an object of named points");
  }
  const rec = payload as Record<string, unknown>;
  const out: Partial<NamedPoints> = {};
  for (const name of POINT_NAMES) {
    const raw = rec[name];
    if (typeof raw !== "object" || raw === null) continue; // user-placed points may be null
    const p = raw as Record<string, unknown>;
    if (typeof p.x !== "number" || typeof p.y !== "number") {
      throw bad("FACE_POINT_MISSING", `point "${name}" must have finite x and y`);
    }
    const conf = typeof p.confidence === "number" && Number.isFinite(p.confidence) ? p.confidence : undefined;
    out[name] = conf !== undefined ? { x: p.x as number, y: p.y as number, confidence: conf } : { x: p.x as number, y: p.y as number };
  }
  for (const name of ["trichion", "glabella", "subnasale", "menton", "zygionL", "zygionR", "gonionL", "gonionR", "irisCenterL", "irisCenterR", "nasion", "philtrum", "stomion"]) {
    const v = out[name as keyof NamedPoints];
    if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y)) {
      throw bad("FACE_POINT_MISSING", `required point "${name}" missing`);
    }
  }
  return out as NamedPoints;
}

export interface RecomputedMeasurement {
  key: MeasurementKey;
  value: number | null;
  status: string;
  score: number | null;
  idealLo: number | null;
  idealHi: number | null;
  weight: number;
  tier: string;
  region: string;
  unit: string;
  source: string;
  confidence: number;
}

/** Server-side recompute with the shared engine (A-03). */
export function recompute(
  landmarks: NamedPoints,
  norm: NormSet,
  profile: string,
  client?: Partial<Record<MeasurementKey, number>>,
): RecomputedMeasurement[] {
  const pts = landmarks as unknown as FacePoints;
  const meas: Measurements = engine(pts);
  const summary = scoreAnalysis(meas, norm, profile);
  const out: RecomputedMeasurement[] = [];
  for (const ms of summary.measurements) {
    const m = ms.range;
    out.push({
      key: ms.key,
      value: Number.isFinite(ms.value) ? ms.value : null,
      status: ms.status === "ok" ? "ok" : "not_measured",
      score: ms.status === "ok" ? ms.score : null,
      idealLo: m?.lo ?? null,
      idealHi: m?.hi ?? null,
      weight: m?.weight ?? 0,
      tier: ms.tier,
      region: ms.region,
      unit: "ratio",
      source: m?.source ?? norm.version,
      confidence: 1,
    });
    if (client) {
      const c = client[ms.key];
      if (c !== undefined && Number.isFinite(c) && ms.status === "ok" && Math.abs(c - ms.score) > 1e-4) {
        throw bad("ENGINE_MISMATCH", `measurement ${ms.key}: client ${c} vs server ${ms.score}`);
      }
    }
  }
  return out;
}

function bad(code: string, message: string): TypedError {
  return new TypedError(code, message);
}

export { bad, validateLandmarkPayload };
