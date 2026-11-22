/** GET /api/analyses/:id/export - full JSON export per R-46/R-48. */
import { NextResponse } from "next/server";

import { requireSession, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const analysis = await db().analysis.findUnique({
    where: { id, appUserId: user.id },
    include: {
      measurements: { orderBy: { key: "asc" } },
      landmarkSet: { select: { id: true, version: true, source: true, points: true } },
      scan: { select: { engineVersion: true, normVersion: true, normHash: true, profileSnapshot: true } },
    },
  });
  if (!analysis) return NextResponse.json({ code: "ANALYSIS_NOT_FOUND" }, { status: 404 });

  const measurements = analysis.measurements.map((m) => ({
    key: m.key,
    value: m.value,
    status: m.status,
    score: m.score,
    idealLo: m.idealLo,
    idealHi: m.idealHi,
    weight: m.weight,
    tier: m.tier,
    region: m.region,
    source: m.source,
    wLo: m.wLo,
    wHi: m.wHi,
    sigmaMeasurement: m.sigmaMeasurement,
    confidence: m.confidence,
  }));

  const body = {
    analysisId: analysis.id,
    engineVersion: analysis.engineVersion,
    normVersion: analysis.normVersion,
    normHash: analysis.scan?.normHash ?? "",
    profile: analysis.scan?.profileSnapshot ?? null,
    landmarkSetId: analysis.landmarkSet.id,
    landmarkSetVersion: analysis.landmarkSet.version,
    landmarkSetSource: analysis.landmarkSet.source,
    landmarks: analysis.landmarkSet.points,
    harmony: analysis.harmony,
    overall: analysis.overall,
    band: analysis.band,
    confidence: analysis.confidence,
    limitations: analysis.limitations,
    measurements,
  };
  const filename = `faceiq-${analysis.id.slice(0, 8)}.json`;
  return new NextResponse(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Engine-Version": body.engineVersion,
      "X-Norm-Version": body.normVersion,
      "X-Norm-Hash": analysis.scan?.normHash ?? "",
    },
  });
}
