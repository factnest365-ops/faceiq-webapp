/**
 * FaceIQ measurement engine (front photo set).
 *
 * Spec section 6.1 of docs/faceiq/faceiq-webapp-spec.md: 12 scored + 7
 * zero-weight descriptor measurements computed from the named point set.
 *
 * Coordinates: Pt with y pointing UP (face space). All values are ratios
 * (dimensionless) or angles (degrees), so the result is scale-invariant
 * (spec A-04/AC-02).
 *
 * Degenerate configurations (zero distances, coincident points) yield NaN.
 * Scoring maps those to status "not_measured" (spec edge 24, R-33).
 */

export interface Pt {
  x: number;
  y: number;
}

/** Named points used by the measurement engine (spec R-19). */
export interface FacePoints {
  /** Hairline. Approximated from the mesh; user-placed in the editor (R-18). */
  trichion: Pt;
  glabella: Pt;
  subnasale: Pt;
  menton: Pt;
  /** Cheekbones (zygion). */
  zygionL: Pt;
  zygionR: Pt;
  /** Jaw angles (gonion). */
  gonionL: Pt;
  gonionR: Pt;
  /** Inner/outer canthus of each eye (eye corners). */
  innerCanthusL: Pt;
  innerCanthusR: Pt;
  outerCanthusL: Pt;
  outerCanthusR: Pt;
  /** Eye fissure top/bottom at the inner corners. */
  eyeTopL: Pt;
  eyeBottomL: Pt;
  eyeTopR: Pt;
  eyeBottomR: Pt;
  /** Iris centers (spec: use iris centre-to-centre for IPD, [A] 2.5). */
  irisCenterL: Pt;
  irisCenterR: Pt;
  /** Nasal root (bridge top). */
  nasion: Pt;
  /** Alar base points (nose width). */
  alarBaseL: Pt;
  alarBaseR: Pt;
  /** Philtrum (upper lip center, mesh point 13). */
  philtrum: Pt;
  /** Stomion (mouth center, mesh point 0). */
  stomion: Pt;
  /** Mouth corners (mesh points 61/291). */
  mouthCornerL: Pt;
  mouthCornerR: Pt;
  /** Brow peaks. */
  browTopL: Pt;
  browTopR: Pt;
  /** Temporal ear points (not in the mesh; user-placed or estimated). */
  earL: Pt;
  earR: Pt;
}

export type MeasurementKey =
  | "third_upper"
  | "third_middle"
  | "third_lower"
  | "face_height_width"
  | "eye_mouth_length"
  | "interocular_face_width"
  | "intercanthal_eye_width"
  | "eye_aspect"
  | "canthal_tilt"
  | "lip_ratio"
  | "bigonial_bizygonomic"
  | "symmetry_index"
  | "fwhr_upper"
  | "midface_ratio"
  | "nose_width_ratio"
  | "nasal_index"
  | "mouth_nose_ratio"
  | "chin_philtrum"
  | "bitemporal_ratio";

/** The 12 scored measurements per spec 6.1. */
export const SCORED: MeasurementKey[] = [
  "third_upper",
  "third_middle",
  "third_lower",
  "face_height_width",
  "eye_mouth_length",
  "interocular_face_width",
  "intercanthal_eye_width",
  "eye_aspect",
  "canthal_tilt",
  "lip_ratio",
  "bigonial_bizygonomic",
  "symmetry_index",
];

/** The 7 descriptor measurements per spec 6.1. Zero weight in v1. */
export const DESCRIPTORS: MeasurementKey[] = [
  "fwhr_upper",
  "midface_ratio",
  "nose_width_ratio",
  "nasal_index",
  "mouth_nose_ratio",
  "chin_philtrum",
  "bitemporal_ratio",
];

export const ALL_MEASUREMENTS: MeasurementKey[] = [...SCORED, ...DESCRIPTORS];

export interface Pose {
  yaw: number;
  pitch: number;
}

export interface EngineOptions {
  pose?: Pose;
}

export type MeasurementStatus = "ok" | "degenerate";

export interface MeasurementResult {
  value: number;
  status: MeasurementStatus;
}

export type Measurements = Record<MeasurementKey, MeasurementResult>;

export function dist(a: Pt, b: Pt): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function angleTiltDeg(ic: Pt, oc: Pt): number {
  // Positive = lateral canthus above medial canthus (spec 6.1).
  return Math.atan2(oc.y - ic.y, Math.abs(oc.x - ic.x)) * (180 / Math.PI);
}

/**
 * Pose correction (spec 6.2.3): horizontal spans divide by cos(yaw), vertical
 * by cos(pitch). The face is levelled first: roll is corrected by rotating the
 * point set so the interpupillary line is horizontal.
 */
function correctSpan(dx: number, dy: number, yaw: number, pitch: number): number {
  const cx = dx / Math.cos(yaw);
  const cy = dy / Math.cos(pitch);
  return Math.hypot(cx, cy);
}

function span(a: Pt, b: Pt, yaw: number, pitch: number): number {
  return correctSpan(b.x - a.x, b.y - a.y, yaw, pitch);
}

function levelRoll(P: FacePoints): FacePoints {
  // Spec 6.1: "Roll: rotate the image so the interpupillary line is
  // horizontal before measuring vertical ratios." Rotate the point set so
  // the interpupillary line is horizontal.
  const L = P.irisCenterL;
  const R = P.irisCenterR;
  const lineAngle = Math.atan2(R.y - L.y, R.x - L.x);
  if (Math.abs(lineAngle) < 1e-12) return P;
  const angle = -lineAngle;
  const cx = (L.x + R.x) / 2;
  const cy = (L.y + R.y) / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rot = (p: Pt): Pt => ({
    x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
    y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
  });
  const clone: FacePoints = {} as FacePoints;
  for (const key of Object.keys(P) as Array<keyof FacePoints>) {
    const v = P[key];
    clone[key] = rot(v) as never;
  }
  return clone;
}

/**
 * Measurement engine. Returns one result per spec 6.1 key. Degenerate
 * configurations yield NaN values (status "degenerate"); scoring converts
 * those to "not_measured" (R-33).
 */
export function engine(P: FacePoints, opts: EngineOptions = {}): Measurements {
  const yaw = (opts.pose?.yaw ?? 0) as number;
  const pitch = (opts.pose?.pitch ?? 0) as number;
  const Q = levelRoll(P);

  const H = span(Q.trichion, Q.menton, yaw, pitch);
  const W = span(Q.zygionL, Q.zygionR, yaw, pitch);
  const eyeMid = mid(Q.irisCenterL, Q.irisCenterR);

  const fissWL = span(Q.innerCanthusL, Q.outerCanthusL, yaw, pitch);
  const fissWR = span(Q.innerCanthusR, Q.outerCanthusR, yaw, pitch);
  const meanFissureW = (fissWL + fissWR) / 2;
  const meanFissureH =
    (span(Q.eyeTopL, Q.eyeBottomL, yaw, pitch) + span(Q.eyeTopR, Q.eyeBottomR, yaw, pitch)) / 2;

  const alarWidth = span(Q.alarBaseL, Q.alarBaseR, yaw, pitch);
  const ICD = span(Q.innerCanthusL, Q.innerCanthusR, yaw, pitch);
  const IPD = span(Q.irisCenterL, Q.irisCenterR, yaw, pitch);

  const pairs: Array<[Pt, Pt]> = [
    [Q.zygionL, Q.zygionR],
    [Q.gonionL, Q.gonionR],
    [Q.irisCenterL, Q.irisCenterR],
    [Q.innerCanthusL, Q.innerCanthusR],
    [Q.outerCanthusL, Q.outerCanthusR],
    [Q.eyeTopL, Q.eyeTopR],
    [Q.eyeBottomL, Q.eyeBottomR],
    [Q.mouthCornerL, Q.mouthCornerR],
    [Q.alarBaseL, Q.alarBaseR],
    [Q.earL, Q.earR],
  ];
  // Translation-invariant symmetry (spec 6.4.6): center each pair on the
  // interpupillary midline, then measure mirror residuals.
  const midX = (Q.irisCenterL.x + Q.irisCenterR.x) / 2;
  const center = (p: Pt): Pt => ({ x: p.x - midX, y: p.y });
  const symAsym = pairs.map(([a, b]) => {
    const ca = center(a);
    const cb = center(b);
    const asym = dist(ca, { x: -cb.x, y: cb.y });
    const avg = (Math.hypot(ca.x, ca.y) + Math.hypot(cb.x, cb.y)) / 2;
    return avg === 0 ? 0 : asym / avg;
  });

  const out: Measurements = {} as Measurements;

  const degenerate = (cond: boolean): MeasurementStatus => (cond ? "degenerate" : "ok");
  const set = (key: MeasurementKey, value: number, status?: MeasurementStatus) => {
    out[key] = {
      value: status === "degenerate" ? NaN : value,
      status: status ?? (Number.isFinite(value) ? "ok" : "degenerate"),
    };
  };
  const zeroSpan = (a: Pt, b: Pt) => dist(a, b) === 0;
  const tiltDegenerate = (ic: Pt, oc: Pt) => zeroSpan(ic, oc);

  // Scored (spec 6.1).
  set("third_upper", span(Q.trichion, Q.glabella, yaw, pitch) / H, degenerate(H === 0));
  set("third_middle", span(Q.glabella, Q.subnasale, yaw, pitch) / H, degenerate(H === 0));
  set("third_lower", span(Q.subnasale, Q.menton, yaw, pitch) / H, degenerate(H === 0));
  set("face_height_width", H / W, degenerate(H === 0 || W === 0));
  set("eye_mouth_length", span(eyeMid, Q.stomion, yaw, pitch) / H, degenerate(H === 0));
  set("interocular_face_width", IPD / W, degenerate(W === 0 || IPD === 0));
  set("intercanthal_eye_width", ICD / meanFissureW, degenerate(meanFissureW === 0 || ICD === 0));
  set("eye_aspect", meanFissureH / meanFissureW, degenerate(meanFissureW === 0));
  set(
    "canthal_tilt",
    ((angleTiltDeg(Q.innerCanthusL, Q.outerCanthusL) +
      angleTiltDeg(Q.innerCanthusR, Q.outerCanthusR)) /
      2) as number,
    degenerate(tiltDegenerate(Q.innerCanthusL, Q.outerCanthusL) || tiltDegenerate(Q.innerCanthusR, Q.outerCanthusR)),
  );
  set(
    "lip_ratio",
    (eyeMid.y - Q.philtrum.y) / (Q.philtrum.y - Q.stomion.y),
    degenerate(Q.philtrum.y === eyeMid.y || Q.philtrum.y === Q.stomion.y || eyeMid.y === Q.stomion.y),
  );
  set("bigonial_bizygonomic", span(Q.gonionL, Q.gonionR, yaw, pitch) / W, degenerate(W === 0 || zeroSpan(Q.gonionL, Q.gonionR)));
  set(
    "symmetry_index",
    1 - symAsym.reduce((a, b) => a + b, 0) / symAsym.length,
  );

  // Descriptors (spec 6.1).
  set("fwhr_upper", W / span(Q.browTopL, Q.philtrum, yaw, pitch), degenerate(span(Q.browTopL, Q.philtrum, yaw, pitch) === 0 || W === 0));
  set("midface_ratio", IPD / span(eyeMid, Q.philtrum, yaw, pitch), degenerate(span(eyeMid, Q.philtrum, yaw, pitch) === 0 || IPD === 0));
  set("nose_width_ratio", alarWidth / ICD, degenerate(ICD === 0));
  set("nasal_index", alarWidth / span(Q.nasion, Q.subnasale, yaw, pitch), degenerate(span(Q.nasion, Q.subnasale, yaw, pitch) === 0));
  set("mouth_nose_ratio", span(Q.mouthCornerL, Q.mouthCornerR, yaw, pitch) / alarWidth, degenerate(alarWidth === 0));
  set("chin_philtrum", span(Q.stomion, Q.menton, yaw, pitch) / span(Q.subnasale, Q.stomion, yaw, pitch), degenerate(span(Q.subnasale, Q.stomion, yaw, pitch) === 0));
  set("bitemporal_ratio", span(Q.earL, Q.earR, yaw, pitch) / W, degenerate(W === 0));

  return out;
}
