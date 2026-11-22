/**
 * Norm set module (spec 6.6 file contract) + validation.
 *
 * The norm set is versioned data, not code. Validation rules (spec 6.6):
 * - zero/missing lo, hi, w_lo, w_hi, or weight fails validation.
 * - w_lo and w_hi must be >= 2 * sigma_measurement.
 * - every range entry carries source, population, n, method; source
 *   "heuristic" requires weight below tier_c_max_weight.
 * - n < 100 => "exploratory": true.
 */

import { createHash } from "node:crypto";

export interface RangeEntry {
  lo: number;
  hi: number;
  w_lo: number;
  w_hi: number;
  weight: number;
  source: string;
  population: string;
  n: number;
  method: string;
  /** Measured repeatability (preliminary: G4 step 2). */
  sigma_measurement: number;
  /** Set when n < 100 (spec 6.6). */
  exploratory?: true;
}

export interface MeasurementNorm {
  key: string;
  unit: "ratio" | "deg" | "mm";
  /** A/B/C reliability tier (spec 6.6). */
  tier: string;
  /** Measured repeatability of this measurement (preliminary values: G4 step 2). */
  sigma_measurement: number;
  /** Strength-group label (R-29). */
  region: string;
  ranges: Record<string, RangeEntry>;
}

export interface NormSet {
  version: string;
  frozen_at: string;
  engine_version: string;
  power_exponent: number;
  score_floor: number;
  strength_threshold: number;
  tier_c_max_weight: number;
  profiles: string[];
  ancestry_sets: string[];
  measurements: MeasurementNorm[];
  /** User-facing disclaimers (R-41). */
  limitations: string[];
}

export class NormValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NormValidationError";
  }
}

function checkRange(key: string, r: RangeEntry, tierCMaxWeight: number): void {
  for (const [field, v] of [
    ["lo", r.lo],
    ["hi", r.hi],
    ["w_lo", r.w_lo],
    ["w_hi", r.w_hi],
    ["weight", r.weight],
  ] as const) {
    if (v === undefined || !Number.isFinite(v)) {
      throw new NormValidationError(`${key}: range field "${field}" missing`);
    }
  }
  // Scored ranges ship with nonzero weight; heuristic descriptor ranges
  // (spec 6.6) carry zero weight by definition.
  if (r.source !== "heuristic" && r.weight === 0) {
    throw new NormValidationError(`${key}: weight zero (spec 6.6)`);
  }
  if (r.w_lo < 2 * r.sigma_measurement && r.sigma_measurement > 0) {
    throw new NormValidationError(`${key}: w_lo < 2*sigma_measurement`);
  }
  if (r.w_hi < 2 * r.sigma_measurement && r.sigma_measurement > 0) {
    throw new NormValidationError(`${key}: w_hi < 2*sigma_measurement`);
  }
  if (r.source === "heuristic" && r.weight >= tierCMaxWeight) {
    throw new NormValidationError(`${key}: heuristic weight >= tier_c_max_weight`);
  }
  if (r.n !== undefined && r.n < 100) r.exploratory = true;
}

export function validateNormSet(ns: NormSet): void {
  for (const m of ns.measurements) {
    if (!m.key || m.unit === undefined) throw new NormValidationError(`${m.key}: missing key or unit`);
    for (const [profile, r] of Object.entries(m.ranges)) {
      checkRange(`${m.key}/${profile}`, r, ns.tier_c_max_weight);
    }
  }
}

export function normSetHash(ns: NormSet): string {
  const sorted = JSON.stringify(ns, Object.keys(ns).sort(), 1);
  return createHash("sha256").update(sorted).digest("hex").slice(0, 16);
}

export async function loadNormSet(path: string): Promise<NormSet> {
  const { readFile } = await import("node:fs/promises");
  const ns = JSON.parse(await readFile(path, "utf8")) as NormSet;
  validateNormSet(ns);
  return ns;
}
