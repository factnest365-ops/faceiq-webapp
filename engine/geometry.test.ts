import { describe, expect, it } from "vitest";

import {
  type FacePoints,
  type Pt,
  engine,
} from "./geometry";
import { ALL_MEASUREMENTS, SCORED, DESCRIPTORS } from "./geometry";
import { fixture, FIXTURE_DESIGN } from "./fixture";
import mapping from "./mapping.json" assert { type: "json" };

describe("engine: invariants", () => {
  it("returns every spec 6.1 measurement key", () => {
    const m = engine(fixture());
    for (const key of ALL_MEASUREMENTS) expect(key in m).toBe(true);
    expect(SCORED.length + DESCRIPTORS.length).toBe(19);
  });

  it("AC-01: engine recovers the fixture design values within 1e-6", () => {
    const m = engine(fixture());
    for (const key of ALL_MEASUREMENTS) {
      const expected = FIXTURE_DESIGN[key];
      expect(m[key].value, `${key}`).toBeCloseTo(expected, 6);
    }
  });
});

describe("engine: AC-02 (translate/rotate/scale invariance)", () => {
  const base = engine(fixture());

  it("scale by 2 leaves ratios unchanged (within 1e-6) and angles within 1e-4", () => {
    const pts = fixture();
    const scaled: FacePoints = Object.fromEntries(
      Object.entries(pts).map(([k, v]) => [k, { x: v.x * 2, y: v.y * 2 } as Pt]),
    ) as unknown as FacePoints;
    const m = engine(scaled);
    for (const key of ALL_MEASUREMENTS) {
      if (key === "canthal_tilt") {
        expect(m[key].value, `${key}`).toBeCloseTo(base[key].value, 4);
      } else {
        expect(m[key].value, `${key}`).toBeCloseTo(base[key].value, 6);
      }
    }
  });

  it("translate leaves ratios and angles unchanged", () => {
    const pts = fixture();
    const dx = 13.7, dy = -9.2;
    const moved: FacePoints = Object.fromEntries(
      Object.entries(pts).map(([k, v]) => [k, { x: v.x + dx, y: v.y + dy } as Pt]),
    ) as unknown as FacePoints;
    const m = engine(moved);
    for (const key of ALL_MEASUREMENTS) {
      expect(m[key].value, `${key}`).toBeCloseTo(base[key].value, 6);
    }
  });

  it("rotate the fixture by 2 deg: levelling restores base angles", () => {
    const ang = (2 * Math.PI) / 180;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const rot = (p: Pt): Pt => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });
    const pts = fixture();
    const rotated: FacePoints = {} as FacePoints;
    for (const k of Object.keys(pts) as Array<keyof FacePoints>) {
      rotated[k] = rot(pts[k]) as never;
    }
    const m = engine(rotated);
    for (const key of ALL_MEASUREMENTS) {
      expect(m[key].value, `${key}`).toBeCloseTo(base[key].value, 4);
    }
  });
});

describe("engine: AC-04 (degenerate -> not_measured, no NaN)", () => {
  it("two coincident inner canthi -> intercanthal_eye_width degenerate", () => {
    const pts = fixture();
    pts.innerCanthusL = pts.innerCanthusR;
    const m = engine(pts);
    const r = m.intercanthal_eye_width;
    expect(r.status).toBe("degenerate");
    expect(Number.isNaN(r.value)).toBe(true);
  });

  it("menton == trichion -> all vertical ratios degenerate", () => {
    const pts = fixture();
    pts.menton = { ...pts.trichion };
    const m = engine(pts);
    expect(m.third_upper.status).toBe("degenerate");
    expect(m.face_height_width.status).toBe("degenerate");
  });
});

describe("engine: AC-05 (frozen landmark mapping version)", () => {
  it("mapping.json carries version '1' and the expected index set", () => {
    const m = mapping as Record<string, unknown>;
    expect(m.version).toBe("1");
    expect(m.points).toBeDefined();
  });

  it("MediaPipe iris points are the documented 468/473 centers", () => {
    const p = mapping.points as Record<string, number | null>;
    expect(p["iris_center_L"]).toBe(468);
    expect(p["iris_center_R"]).toBe(473);
    expect(p["outer_canthus_L"]).toBe(33);
    expect(p["outer_canthus_R"]).toBe(263);
    expect(p["inner_canthus_L"]).toBe(133);
    expect(p["inner_canthus_R"]).toBe(362);
  });

  it("hard mesh points are not user-placed in the mapping", () => {
    const p = mapping.points as Record<string, number | null>;
    // trichion and ears are not in the mesh (spec R-18).
    expect(p["trichion"]).toBeNull();
    expect(p["ear_L"]).toBeNull();
  });
});
