import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const user = await getSessionUser(new Request("http://internal"));
  if (!user) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  const analyses = await db().analysis.findMany({
    where: { appUserId: user.id },
    orderBy: { createdAt: "desc" },
    include: { measurements: { select: { key: true } } },
  });
  return Response.json(analyses.map((a) => ({
    analysisId: a.id,
    harmony: a.harmony,
    overall: a.overall,
    band: a.band,
    confidence: a.confidence,
    engineVersion: a.engineVersion,
    normVersion: a.normVersion,
    createdAt: a.createdAt,
    measurementCount: a.measurements.length,
  })));
}
