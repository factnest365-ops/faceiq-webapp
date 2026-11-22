/** POST /api/scans/[id]/landmarks - submit landmark set, recompute + persist (A-03/A-05/A-06). */
import { NextResponse } from "next/server";

import { requireSession, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadNormSet, validateNormSet } from "@/engine/norms";
import { engine, type FacePoints } from "@/engine/geometry";
import { scoreAnalysis, measurementConfidence } from "@/engine/scoring";
import { recompute, TypedError, validateLandmarkPayload, type NamedPoints } from "@/server/recompute";
import { idempotencyHash } from "@/server/idempotency";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession(req);
  if (!user) return unauthorized();
  const { id: scanId } = await params;
  const body = await req.json().catch(() => ({}));

  const scan = await db().scan.findUnique({ where: { id: scanId } });
  if (!scan || scan.appUserId !== user.id) return NextResponse.json({ code: "SCAN_NOT_FOUND" }, { status: 404 });
  if (scan.status !== "draft") return NextResponse.json({ code: "SCAN_CONFIRMED" }, { status: 400 });
  if (body.engineVersion !== scan.engineVersion) {
    return NextResponse.json({ code: "ENGINE_MISMATCH", message: "scan pinned engine version mismatch" }, { status: 400 });
  }

  const norm = await loadNormSet("data/normset-1.0.0.json");
  validateNormSet(norm);
  if (norm.version !== scan.normVersion) {
    return NextResponse.json({ code: "NORM_NOT_FOUND", message: "norm set not available for this scan" }, { status: 404 });
  }

  const profileSnapshot = scan.profileSnapshot as { sexAtBirth?: string } | null;
  const sexAtBirth = profileSnapshot?.sexAtBirth ?? "prefer_not_to_say";

  let landmarks: NamedPoints;
  try {
    landmarks = validateLandmarkPayload(body.landmarks);
  } catch (e) {
    if (e instanceof TypedError) return NextResponse.json({ code: e.code, message: e.message }, { status: 400 });
    throw e;
  }
  const imageWidth = typeof body.imageWidth === "number" && body.imageWidth > 0 ? body.imageWidth : null;
  const imageHeight = typeof body.imageHeight === "number" && body.imageHeight > 0 ? body.imageHeight : null;
  if ((imageWidth !== null && imageWidth > 8000) || (imageHeight !== null && imageHeight > 8000)) {
    return NextResponse.json({ code: "INVALID_REQUEST", message: "image dimensions out of bounds" }, { status: 400 });
  }

  // Idempotency (A-06): same landmark set + engine version returns the same analysis.
  const hash = idempotencyHash(Object.values(landmarks), scan.engineVersion, scan.normVersion);
  const existing = await db().analysis.findFirst({ where: { scanId, idempotencyHash: hash } });
  if (existing) {
    const meas = await db().measurement.findMany({ where: { analysisId: existing.id } });
    return NextResponse.json({ idempotent: true, analysis: serializeAnalysis(existing, meas) }, { status: 200 });
  }

  // Server recompute with the pinned engine (A-03): hard error on mismatch.
  recompute(landmarks, norm, sexAtBirth, body.clientScores);

  // Persist the landmark set (R-16: versioned on edit; version field bumped).
  const ls = await db().landmarkSet.create({
    data: {
      appUserId: user.id,
      scanId,
      version: 1,
      source: body.source ?? "auto",
      points: JSON.parse(JSON.stringify(landmarks)) as never,
      framesFused: body.framesFused ?? null,
      imageWidth,
      imageHeight,
    },
  });

  const summary = scoreAnalysis(engine(landmarks as unknown as FacePoints), norm, sexAtBirth);

  // Persist measurements + analysis (R-35: versions pinned with the analysis).
  const dbRows = summary.measurements.map((m) => ({
    appUserId: user.id,
    scanId,
    landmarkSetId: ls.id,
    key: m.key,
    value: m.status === "ok" ? m.observed : null,
    unit: "ratio",
    region: m.region,
    tier: m.tier,
    status: m.status === "ok" ? "ok" : "not_measured",
    score: m.status === "ok" ? m.score : null,
    confidence: measurementConfidence(m, {}),
    idealLo: m.range?.lo ?? null,
    idealHi: m.range?.hi ?? null,
    wLo: m.range?.w_lo ?? null,
    wHi: m.range?.w_hi ?? null,
    sigmaMeasurement: m.range?.sigma_measurement ?? null,
    weight: m.weight,
    source: m.range?.source ?? norm.version,
  }));
  const analysis = await db().analysis.create({
    data: {
      appUserId: user.id,
      scanId,
      landmarkSetId: ls.id,
      engineVersion: scan.engineVersion,
      normVersion: scan.normVersion,
      harmony: summary.pillar,
      overall: summary.overall,
      band: summary.band,
      confidence: summary.confidence,
      limitations: norm.limitations,
      idempotencyHash: hash,
      measurements: { create: dbRows.map((r) => ({ ...r, analysisId: undefined })) },
    },
  });

  return NextResponse.json({
    idempotent: false,
    analysis: serializeAnalysis({ ...analysis, measurements: summary.measurements }, dbRows),
  }, { status: 201 });
}

type Json = Record<string, unknown>;

function serializeAnalysis(
  analysis: { id: string; engineVersion: string; normVersion: string; harmony: number; overall: number; band: string; confidence: number; measurements?: unknown[] },
  measurements?: unknown[],
): Json {
  return {
    analysisId: analysis.id,
    engineVersion: analysis.engineVersion,
    normVersion: analysis.normVersion,
    harmony: analysis.harmony,
    overall: analysis.overall,
    band: analysis.band,
    confidence: analysis.confidence,
    measurements: measurements ?? analysis.measurements ?? [],
  };
}
