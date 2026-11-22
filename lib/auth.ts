import { createHash, randomUUID } from "node:crypto";

import { db } from "../lib/db";

const SESSION_COOKIE = "faceiq_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (R-04 deletes on account deletion)

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Create a session for a user: sets the cookie and returns the user id. */
export async function createSession(res: Response, appUserId: string): Promise<string> {
  const token = `${randomUUID()}${randomUUID()}`;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db().appUser.update({
    where: { id: appUserId },
    data: { sessionToken: hashToken(token), sessionExpires: expiresAt },
  });
  res.headers.append("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`);
  return token;
}

/** Look up the current user via the session cookie (or null). */
export async function getSessionUser(req: Request): Promise<{ id: string; email: string; ageAttestedAt?: Date | null } | null> {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.split("; ").find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  const token = match.split("=").slice(1).join("=");
  const user = await db().appUser.findUnique({
    where: { sessionToken: hashToken(token) },
    select: { id: true, email: true, ageAttestedAt: true, sessionExpires: true },
  });
  if (!user || !user.sessionExpires || user.sessionExpires < new Date()) return null;
  return user;
}

/** Require a session; returns null when unauthenticated (routes return 401). */
export async function requireSession(req: Request): Promise<{ id: string; email: string; ageAttestedAt?: Date | null } | null> {
  return await getSessionUser(req);
}

/** Standard 401 body for unauthenticated API calls (spec 7.4, A-05). */
export function unauthorized(): Response {
  return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
}
