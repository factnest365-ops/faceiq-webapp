/** GET /api/analyses/:id - full analysis summary (R-39, R-40, R-45). */
import { NextResponse } from "next/server";

import { requireSession, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadNormSet, validateNormSet } from "@/engine/norms";
import { strengths, flaws as computeFlaws, possibleItems, type MeasurementScore } from "@/engine/scoring";

type MeasurementRow = {
  key: string;
  value: number | null;
  score: number | null;
  idealLo: number | null;
  idealHi: number | null;
  wLo: number | null;
  wHi: number | null;
  sigmaMeasurement: number | null;
  region: string;
  tier: string;
  weight: number;
  source: string;
  status: string;
};

function rehydrate(row: MeasurementRow): MeasurementScore | null {
  if (!row) return null;
  const observed = row.value ?? NaN;
  const score = row.score ?? NaN;
  return {
    key: row.key as MeasurementScore["key"],
    value: observed,
    status: row.status === "ok" ? "ok" : "degenerate",
    score,
    observed,
    range: row.idealLo != null && row.idealHi != null ? {
      lo: row.idealLo, hi: row.idealHi, w_lo: row.wLo ?? 0, w_hi: row.wHi ?? 0,
      weight: row.weight, source: row.source, population: "", n: 0, method: "",
      sigma_measurement: row.sigmaMeasurement ?? 0,
    } : null,
    region: row.region,
    tier: row.tier,
    weight: row.weight,
    sigma: row.sigmaMeasurement ?? 0,
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const analysis = await db().analysis.findUnique({ where: { id }, include: { measurements: { orderBy: { key: "asc" } }, scan: { select: { captureMode: true } } } });
  if (!analysis || analysis.appUserId !== user.id) return NextResponse.json({ code: "ANALYSIS_NOT_FOUND" }, { status: 404 });

  const norm = await loadNormSet("data/normset-1.0.0.json");
  validateNormSet(norm);

  const measurements = (analysis.measurements.map((m) => rehydrate(m as MeasurementRow)).filter((x): x is MeasurementScore => x !== null));
  const strengthList = strengths(measurements, norm);
  const flawsList = computeFlaws(measurements, norm);
  const possibleList = possibleItems(measurements);

  return NextResponse.json({
    analysisId: analysis.id,
    engineVersion: analysis.engineVersion,
    normVersion: analysis.normVersion,
    harmony: analysis.harmony,
    overall: analysis.overall,
    band: analysis.band,
    confidence: analysis.confidence,
    captureMode: analysis.scan?.captureMode,
    limitations: analysis.limitations,
    strengths: strengthList,
    flaws: flawsList,
    possible: possibleList,
    measurements: measurements.map((m) => ({ key: m.key, value: m.value, status: m.status, score: m.score, observed: m.observed, range: m.range, region: m.region, tier: m.tier, weight: m.weight })),
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const deleted = await db().analysis.deleteMany({ where: { id, appUserId: user.id } });
  if (deleted.count === 0) return NextResponse.json({ code: "ANALYSIS_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
