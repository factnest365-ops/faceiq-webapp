/** POST /api/scans - create a scan draft (spec 7.4). */
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireSession, unauthorized } from "@/lib/auth";
import { loadNormSet, normSetHash, validateNormSet } from "@/engine/norms";
import { mappingHash } from "@/lib/mapping-hash";

export async function POST(req: Request) {
  const user = await requireSession(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const captureMode = body.captureMode === "live" ? "live" : body.captureMode === "upload" ? "upload" : null;
  const sexAtBirth = ["female", "male", "prefer_not_to_say"].includes(body.sexAtBirth) ? body.sexAtBirth : "prefer_not_to_say";
  if (!captureMode) return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
  // R-02: attestation required before the first capture.
  if (body.attest?.age === true) {
    if (!user.ageAttestedAt) {
      await db().appUser.update({ where: { id: user.id }, data: { ageAttestedAt: new Date() } });
    }
  } else {
    return NextResponse.json({ code: "ATTEST_REQUIRED", message: "Accept terms + 18+ attestation before first capture" }, { status: 403 });
  }

  const [norm, mh] = await Promise.all([
    loadNormSet("data/normset-1.0.0.json"),
    mappingHash(),
  ]);
  validateNormSet(norm);
  const mappingH = mh;

  await db().profile.upsert({
    where: { userId: user.id },
    update: { sexAtBirth },
    create: { userId: user.id, sexAtBirth },
  });

  const scan = await db().scan.create({
    data: {
      appUserId: user.id,
      captureMode,
      status: "draft",
      engineVersion: norm.engine_version,
      normVersion: norm.version,
      normHash: normSetHash(norm),
      landmarkMappingVersion: mappingH,
      profileSnapshot: { sexAtBirth, ancestry: "pooled", normSet: norm.version, engine: norm.engine_version },
    },
  });
  return NextResponse.json({ scanId: scan.id, engineVersion: norm.engine_version, normVersion: norm.version }, { status: 201 });
}
