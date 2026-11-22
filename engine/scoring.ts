/**
 * Scoring and report assembly per spec 6.2-6.5.
 *
 * - Trapezoid scoring (spec 6.2).
 * - Pillar = weighted power mean (spec 6.3, p = norm.power_exponent).
 * - Bands from the norm set + profile (spec 6.5).
 * - Strengths/flaws/possible lists (R-29/30/31/32, spec 6.4/6.5).
 * - Confidence (spec 6.4, C-01..C-05).
 * - D1: overall equals Harmony in v1.
 */

import type { MeasurementKey, Measurements } from "./geometry";
import { ALL_MEASUREMENTS, DESCRIPTORS } from "./geometry";
import type { NormSet, RangeEntry } from "./norms";

export interface MeasurementScore {
  key: MeasurementKey;
  value: number; // NaN when not measured
  status: "ok" | "degenerate" | "not_measured";
  /** 0-10 score; NaN when not measured. Descriptors carry no score weight. */
  score: number;
  /** Observed value; NaN when not measured. */
  observed: number;
  range: RangeEntry | null;
  region: string;
  tier: string;
  possible?: { target: number; possibleScore: number; delta: number };
  /** Weight in the pillar aggregation (0 for descriptors, not measured). */
  weight: number;
  sigma: number;
}

export interface StrengthGroup {
  region: string;
  measurements: MeasurementScore[];
}

export interface Flaw {
  key: MeasurementKey;
  status: "below" | "above";
  observed: number;
  score: number;
  /** R-30: points that would rise if this measurement alone reached range edge. */
  impact: number;
  /** Weight of the flawed measurement (tie-break, R-30). */
  weight: number;
}

export interface PossibleItem {
  key: MeasurementKey;
  target: number;
  delta: number;
  /** score of the target edge (100% of possible gain, per R-32). */
  possibleScore: number;
}

export interface AnalysisSummary {
  measurements: MeasurementScore[];
  strengths: StrengthGroup[];
  flaws: Flaw[];
  possible: PossibleItem[];
  pillar: number;
  overall: number;
  band: string;
  confidence: number;
  limitations: string[];
  engineVersion: string;
}

const trapezoid = (
  x: number,
  lo: number,
  hi: number,
  wLo: number,
  wHi: number,
): number => {
  if (x >= lo && x <= hi) return 10;
  if (x < lo) return 10 * Math.max(0, 1 - (lo - x) / wLo);
  return 10 * Math.max(0, 1 - (x - hi) / wHi);
};

function findEntry(norm: NormSet, key: MeasurementKey, profile: string): RangeEntry | null {
  const m = norm.measurements.find((mm) => mm.key === key);
  if (!m) return null;
  if (m.ranges[profile]) return m.ranges[profile];
  if (m.ranges.pooled) return m.ranges.pooled;
  throw new Error(`PROFILE_UNSUPPORTED: no range for ${profile} or pooled for ${key}`);
}

export function getRange(norm: NormSet, key: MeasurementKey, profile: string): RangeEntry | null {
  return findEntry(norm, key, profile);
}

function measurementStatus(value: number): "ok" | "degenerate" | "not_measured" {
  return Number.isFinite(value) ? "ok" : "degenerate";
}

function scoreMeasurements(
  measurements: Measurements,
  norm: NormSet,
  profile: string,
): MeasurementScore[] {
  return ALL_MEASUREMENTS.map((key) => {
    const m = norm.measurements.find((mm) => mm.key === key);
    const entry = findEntry(norm, key, profile);
    if (!entry || !m) {
      throw new Error(`NORM_MISSING: no measurement entry for ${key}`);
    }
    const value = measurements[key].value;
    const status = measurementStatus(value);
    let score = NaN;
    if (status === "ok") {
      const descriptor = DESCRIPTORS.includes(key);
      if (descriptor) {
        score = value >= entry.lo && value <= entry.hi ? 10 : NaN;
      } else {
        score = trapezoid(value, entry.lo, entry.hi, entry.w_lo, entry.w_hi);
      }
    }
    return {
      key,
      value,
      status,
      score,
      observed: value,
      range: entry,
      region: m.region,
      tier: m.tier,
      weight: entry.weight,
      sigma: entry.sigma_measurement,
    };
  });
}

/** Spec 6.3 power mean, floor at score_floor. */
export function powerMean(values: Array<{ s: number; w: number }>, p: number, floor: number): number {
  let num = 0;
  let den = 0;
  for (const v of values) {
    const s = Math.max(v.s, floor);
    num += v.w * Math.pow(s, p);
    den += v.w;
  }
  if (den === 0) return NaN;
  return Math.pow(num / den, 1 / p);
}

function pillarInputs(scored: MeasurementScore[]): Array<{ s: number; w: number }> {
  return scored
    .filter((m) => m.status === "ok" && m.weight > 0 && Number.isFinite(m.score))
    .map((m) => ({ s: m.score as number, w: m.weight }));
}

function measuredWeight(scored: MeasurementScore[]): number {
  return scored.reduce((sum, m) => sum + (m.status === "ok" && m.weight > 0 ? m.weight : 0), 0);
}

function totalWeight(scored: MeasurementScore[]): number {
  return scored.reduce((sum, m) => sum + (m.weight > 0 ? m.weight : 0), 0);
}

/** Spec 6.3: pillar score over the 12 scored measurements. */
export function computePillar(scored: MeasurementScore[], norm: NormSet): number {
  return powerMean(pillarInputs(scored), norm.power_exponent, norm.score_floor);
}

/** Spec 6.5 band labels. */
export const BANDS: Array<{ min: number; label: string; rarity: string }> = [
  { min: 9.5, label: "Near / idealised perfection", rarity: "1 in 100,000+" },
  { min: 9.0, label: "Approaching perfection", rarity: "1 in 20,000" },
  { min: 8.5, label: "Outstanding", rarity: "1 in 2,500" },
  { min: 8.0, label: "Exceptional", rarity: "1 in 250" },
  { min: 7.5, label: "Excellent", rarity: "1 in 60" },
  { min: 7.0, label: "Great", rarity: "1 in 18" },
  { min: 6.0, label: "Good / very good", rarity: "1 in 3.5-6.5" },
  { min: 5.0, label: "Average / slightly above", rarity: "1 in 2" },
  { min: 4.0, label: "Below average", rarity: "1 in 2.2-3.5" },
  { min: 3.0, label: "Poor / below average", rarity: "1 in 6.5-18" },
  { min: -Infinity, label: "Poor to extreme disharmony", rarity: "< 1 in 60" },
];

export function bandForScore(score: number): string {
  const band = BANDS.find((b) => score >= b.min);
  return band?.label ?? BANDS[BANDS.length - 1].label;
}

/** Spec 6.5: strengths = measurements scoring at/above the strength threshold, grouped by region. */
export function strengths(scored: MeasurementScore[], norm: NormSet): StrengthGroup[] {
  const groups = new Map<string, MeasurementScore[]>();
  for (const m of scored) {
    if (m.status !== "ok" || !Number.isFinite(m.score)) continue;
    if (m.score < norm.strength_threshold) continue;
    const arr = groups.get(m.region) ?? [];
    arr.push(m);
    groups.set(m.region, arr);
  }
  return [...groups.entries()]
    .map(([region, ms]) => ({ region, measurements: ms.sort((a, b) => b.score - a.score) }))
    .sort((a, b) => a.region.localeCompare(b.region));
}

/** Spec 6.4/6.5 confidence (C-01..C-05): landmark confidence + tier factors. */
export function measurementConfidence(
  m: MeasurementScore,
  landmarkConf: Partial<Record<MeasurementKey, number>>,
): number {
  if (m.status === "degenerate") return 0;
  const conf = Math.min(1, Math.max(0, landmarkConf[m.key] ?? 0.85));
  const factor = m.tier === "A" ? 1.0 : m.tier === "B" ? 0.9 : 0.7;
  return conf * factor;
}

function pillarConfidence(
  scored: MeasurementScore[],
  norm: NormSet,
  landmarkConf: Partial<Record<MeasurementKey, number>>,
): number {
  const confs = scored
    .filter((m) => m.status === "ok" && m.weight > 0)
    .map((m) => ({ c: measurementConfidence(m, landmarkConf), w: m.weight }));
  const den = confs.reduce((s, c) => s + c.w, 0);
  if (den === 0) return 0;
  return confs.reduce((s, c) => s + c.w * c.c, 0) / den;
}

/** Spec 6.5 possible items: R-32 - delta > 2*sigma AND tier A|B. */
export function possibleItems(scored: MeasurementScore[]): PossibleItem[] {
  const out: PossibleItem[] = [];
  for (const m of scored) {
    if (m.status !== "ok" || m.weight === 0 || m.sigma === 0) continue;
    if (!m.range) continue;
    const tierAorB = m.tier === "A" || m.tier === "B";
    if (!tierAorB) continue;
    const x = m.observed;
    const target = x < m.range.lo ? m.range.lo : m.range.hi;
    const possibleScore = trapezoid(target, m.range.lo, m.range.hi, m.range.w_lo, m.range.w_hi);
    const delta = possibleScore - m.score;
    if (delta > 2 * m.sigma && delta > 0) out.push({ key: m.key, target, delta, possibleScore });
  }
  out.sort((a, b) => b.delta - a.delta);
  return out;
}

/** Spec 6.5 flaws: measurements below range, ranked by impact (R-30), capped 5 (R-31). */
export function flaws(scored: MeasurementScore[], norm: NormSet): Flaw[] {
  const out: Flaw[] = [];
  for (const m of scored) {
    if (m.status !== "ok" || !Number.isFinite(m.score) || m.weight === 0) continue;
    if (!m.range) continue;
    const status = m.observed < m.range.lo ? "below" : m.observed > m.range.hi ? "above" : null;
    if (!status) continue;
    const edge = status === "below" ? m.range.lo : m.range.hi;
    // Overall with this measurement at its nearest band edge (R-30 impact).
    const other = scored.map((s) => ({ ...s }));
    const idx = other.findIndex((s) => s.key === m.key);
    if (idx >= 0) {
      other[idx] = { ...other[idx], observed: edge, score: 10 };
    }
    const pillar = computePillar(other, norm);
    out.push({
      key: m.key,
      status,
      observed: m.observed,
      score: m.score,
      impact: pillar - computePillar(scored, norm),
      weight: m.weight,
    });
  }
  out.sort((a, b) => b.impact - a.impact || b.weight - a.weight || a.key.localeCompare(b.key));
  return out.slice(0, 5);
}

/** Full analysis assembly: scores, strengths, flaws, possible, pillar, confidence. */
export function scoreAnalysis(
  measurements: Measurements,
  norm: NormSet,
  profile: string,
  landmarkConf?: Partial<Record<MeasurementKey, number>>,
): AnalysisSummary {
  const ms = scoreMeasurements(measurements, norm, profile);
  const pillar = computePillar(ms, norm);
  const conf = pillarConfidence(ms, norm, landmarkConf ?? {});
  const avail = measuredWeight(ms) / totalWeight(ms);
  const overallConf = Number.isFinite(conf) ? conf * Math.sqrt(avail) : 0;
  return {
    measurements: ms,
    strengths: strengths(ms, norm),
    flaws: flaws(ms, norm),
    possible: possibleItems(ms),
    pillar,
    overall: pillar, // D1: overall equals Harmony in v1
    band: bandForScore(pillar),
    confidence: overallConf,
    limitations: norm.limitations ?? [],
    engineVersion: norm.engine_version,
  };
}
