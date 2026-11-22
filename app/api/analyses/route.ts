/** GET /api/analyses - list analyses for the user (history). */
import { NextResponse } from "next/server";

import { requireSession, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const user = await requireSession(req);
  if (!user) return unauthorized();
  const analyses = await db().analysis.findMany({
    where: { appUserId: user.id },
    orderBy: { createdAt: "desc" },
    include: { scan: { select: { captureMode: true } } },
  });
  return NextResponse.json(analyses.map((a) => ({
    analysisId: a.id,
    engineVersion: a.engineVersion,
    normVersion: a.normVersion,
    harmony: a.harmony,
    overall: a.overall,
    band: a.band,
    confidence: a.confidence,
    createdAt: a.createdAt,
    captureMode: a.scan?.captureMode,
  })));
}
