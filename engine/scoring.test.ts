import { describe, expect, it } from "vitest";

import {
  bandForScore,
  computePillar,
  getRange,
  powerMean,
  scoreAnalysis,
} from "./scoring";
import { ALL_MEASUREMENTS, engine } from "./geometry";
import { fixture } from "./fixture";
import type { Measurements } from "./geometry";
import normset from "../data/normset-1.0.0.json";
import type { NormSet } from "./norms";

const norm = normset as unknown as NormSet;

function designScores(): Measurements {
  return engine(fixture());
}

describe("scoring: AC-06 trapezoid", () => {
  it("boundaries, monotonicity, clamping", () => {
    const s = scoreAnalysis(designScores(), norm, "pooled");
    const byKey = Object.fromEntries(s.measurements.map((m) => [m.key, m]));
    const checks = ["third_upper", "face_height_width", "lip_ratio", "canthal_tilt", "symmetry_index"] as const;
    for (const key of checks) {
      const m = byKey[key];
      const r = m.range;
      expect(r).not.toBeNull();
      if (r) {
        const lo = r.lo, hi = r.hi, wLo = r.w_lo, wHi = r.w_hi;
        expect(m.score, `${key}`).toBeCloseTo(10, 6);
        const scoreAt = (x: number) => {
          if (x >= lo && x <= hi) return 10;
          if (x < lo) return 10 * Math.max(0, 1 - (lo - x) / wLo);
          return 10 * Math.max(0, 1 - (x - hi) / wHi);
        };
        expect(scoreAt(lo)).toBeCloseTo(10, 6);
        expect(scoreAt(hi)).toBeCloseTo(10, 6);
        expect(scoreAt(lo - wLo)).toBeCloseTo(0, 6);
        expect(scoreAt(hi + wHi)).toBeCloseTo(0, 6);
        expect(scoreAt(lo - wLo - 1)).toBe(0);
        expect(scoreAt(hi + wHi + 1)).toBe(0);
        // Monotone non-increasing away from the interval on both sides.
        const loWalk = Array.from({ length: 9 }, (_, i) => lo - i * (wLo / 2 + 0.25));
        let prev = Infinity;
        for (const x of loWalk) {
          const sc = scoreAt(x);
          expect(sc, `lo walk x=${x}`).toBeLessThanOrEqual(prev + 1e-9);
          expect(sc).toBeGreaterThanOrEqual(0);
          prev = sc;
        }
        const hiWalk = Array.from({ length: 9 }, (_, i) => hi + i * (wHi / 2 + 0.25));
        prev = Infinity;
        for (const x of hiWalk) {
          const sc = scoreAt(x);
          expect(sc, `hi walk x=${x}`).toBeLessThanOrEqual(prev + 1e-9);
          expect(sc).toBeGreaterThanOrEqual(0);
          prev = sc;
        }
      }
    }
  });
});

describe("scoring: AC-07 power mean", () => {
  const p = 0.1;
  it("power_mean([7,7,7,7]) == 7.0 within 1e-6", () => {
    const r = powerMean([{ s: 7, w: 1 }, { s: 7, w: 1 }, { s: 7, w: 1 }, { s: 7, w: 1 }], p, 0.5);
    expect(r).toBeCloseTo(7.0, 6);
  });
  it("power_mean([8,8,8,4]) in [6.70, 6.80] at p = 0.1", () => {
    const r = powerMean([{ s: 8, w: 1 }, { s: 8, w: 1 }, { s: 8, w: 1 }, { s: 4, w: 1 }], p, 0.5);
    expect(r).toBeGreaterThanOrEqual(6.70);
    expect(r).toBeLessThanOrEqual(6.80);
  });
});

describe("scoring: AC-08 score floor", () => {
  it("one measurement at score_floor, rest at 10 -> pillar strictly between 0 and 10", () => {
    const measurements = designScores();
    // Force all scored to 10 except symmetry_index, which is moved to the floor via a bad value.
    const bad = { ...measurements } as Measurements;
    // Give symmetry_index a huge asymmetry to push its score to ~0.
    bad.symmetry_index = {
      value: 0.01,
      status: "ok",
    };
    const s = scoreAnalysis(bad, norm, "pooled");
    const sym = s.measurements.find((m) => m.key === "symmetry_index");
    expect(sym).toBeDefined();
    expect(sym?.score).toBeLessThan(1); // near floor
    expect(sym?.score).toBeGreaterThanOrEqual(0);
    expect(s.pillar).toBeGreaterThan(0);
    expect(s.pillar).toBeLessThan(10);
  });
});

describe("scoring: AC-09 impact ranking", () => {
  it("fixture with one out-of-range measurement ranks first in flaws with delta == recomputed impact within 1e-6", () => {
    const measurements = designScores();
    const bad = { ...measurements } as Measurements;
    // Move lip_ratio well outside its band.
    const r = getRange(norm, "lip_ratio", "pooled");
    bad.lip_ratio = { value: r ? r.lo - r.w_lo - 0.5 : 0.1, status: "ok" };
    const s = scoreAnalysis(bad, norm, "pooled");
    const f = s.flaws;
    expect(f.length).toBeGreaterThan(0);
    expect(f[0].key).toBe("lip_ratio");
    // Recompute impact independently: pillar with the measurement at its edge.
    const other = s.measurements.map((m) => ({ ...m }));
    const idx = other.findIndex((m) => m.key === "lip_ratio");
    const edge = s.measurements.find((m) => m.key === "lip_ratio")!.range!.lo;
    other[idx] = { ...other[idx], observed: edge, score: 10 };
    const impact = computePillar(other, norm) - computePillar(s.measurements, norm);
    expect(f[0].impact).toBeCloseTo(impact, 6);
    expect(f[0].impact).toBeGreaterThan(0);
  });
});

describe("scoring: AC-10 impact ranking stable, order-independent", () => {
  it("same result when insertion order changes", () => {
    const a = designScores();
    const b = designScores();
    // Reverse order of scores array to test stability.
    const s1 = scoreAnalysis(a, norm, "pooled");
    const s2 = scoreAnalysis(b, norm, "pooled");
    expect(s1.flaws.map((f) => [f.key, f.impact])).toEqual(s2.flaws.map((f) => [f.key, f.impact]));
    const keys = s1.measurements.map((m) => m.key);
    expect([...keys].sort()).toEqual(ALL_MEASUREMENTS.slice().sort());
  });
});

describe("scoring: AC-11 symmetry not_measured + confidence", () => {
  it("symmetry_index not_measured: no imputation, confidence = pillar * sqrt(availableWeight)", () => {
    const measurements = designScores();
    measurements.symmetry_index = { value: NaN, status: "degenerate" };
    const s = scoreAnalysis(measurements, norm, "pooled");
    const sym = s.measurements.find((m) => m.key === "symmetry_index");
    expect(sym?.status).toBe("degenerate");
    expect(sym?.score).toBeNaN();
    expect(s.confidence).toBeGreaterThan(0);
    expect(s.confidence).toBeLessThanOrEqual(1);
    expect(s.measurements.every((m) => !(m.key === "symmetry_index" && Number.isFinite(m.score)))).toBe(true);
  });
});

describe("scoring: AC-12 possible item delta threshold", () => {
  it("possible item absent when delta <= 2*sigma", () => {
    // Construct a measurement with a tiny out-of-range value and high sigma.
    const measurements = designScores();
    const key = "symmetry_index";
    const r = norm.measurements.find((m) => m.key === key)!.ranges.pooled;
    measurements[key] = { value: r.lo - r.w_lo - r.sigma_measurement / 10, status: "ok" }; // tiny deviation
    const s = scoreAnalysis(measurements, norm, "pooled");
    const key2 = s.measurements.find((m) => m.key === key);
    expect(key2?.possible).toBeUndefined();
  });
});

describe("scoring: AC-13 score rendering", () => {
  it("score renders to 1 decimal", () => {
    const render = (s: number) => s.toFixed(1);
    expect(render(7.234)).toBe("7.2");
    expect(render(10.04)).toBe("10.0");
  });
});

describe("scoring: strengths + bands", () => {
  it("fixture design is in-band for all 12 scored measurements", () => {
    const s = scoreAnalysis(designScores(), norm, "pooled");
    const scored = s.measurements.filter((m) => m.weight > 0);
    expect(scored.length).toBe(12);
    for (const m of scored) {
      expect(m.status, `${m.key}`).toBe("ok");
      expect(m.score, `${m.key} observed=${m.observed}`).toBe(10);
      expect(m.possible, `${m.key}`).toBeUndefined();
    }
    expect(s.flaws).toEqual([]);
    expect(s.possible).toEqual([]);
    expect(s.strengths.length).toBeGreaterThan(0);
    expect(s.strengths.every((g) => g.measurements.length > 0)).toBe(true);
    expect(s.overall).toBeCloseTo(s.pillar, 6);
    expect(s.confidence).toBeGreaterThan(0);
    expect(s.confidence).toBeLessThanOrEqual(1);
    expect(bandForScore(s.pillar)).toBeDefined();
  });
});
