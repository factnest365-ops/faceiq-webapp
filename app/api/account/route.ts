/** DELETE /api/account - full account deletion, incl. photos (R-04). */
import { requireSession, unauthorized } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(req: Request) {
  const user = await requireSession(req);
  if (!user) return unauthorized();
  // Delete all user data (R-04): analyses, measurements, landmark sets, photos, scans, profile, sessions.
  const scans = await db().scan.findMany({ where: { appUserId: user.id } });
  for (const scan of scans) {
    await db().measurement.deleteMany({ where: { scanId: scan.id } });
    await db().landmarkSet.deleteMany({ where: { scanId: scan.id } });
    await db().analysis.deleteMany({ where: { scanId: scan.id } });
    await db().photo.deleteMany({ where: { scanId: scan.id } });
  }
  await db().scan.deleteMany({ where: { appUserId: user.id } });
  await db().profile.deleteMany({ where: { userId: user.id } });
  await db().appUser.delete({ where: { id: user.id } });
  const res = Response.json({ ok: true });
  // Kill the session so the user is logged out (R-04).
  res.headers.append("Set-Cookie", "faceiq_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  return res;
}
