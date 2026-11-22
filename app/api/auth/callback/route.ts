/** GET /api/auth/callback - Google OAuth callback (spec 7.4, A-05). */
import { createSession, hashToken } from "@/lib/auth";
import { db } from "@/lib/db";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return Response.redirect(new URL("/", req.url), 302);
  }

  // CSRF state check (cookie set at /api/auth/google).
  const cookies = req.headers.get("cookie") ?? "";
  const match = cookies.split("; ").find((c) => c.startsWith("faceiq_oauth_state="));
  const cookieState = match?.split("=").slice(1).join("=");
  if (!cookieState || hashToken(state) !== hashToken(cookieState)) {
    return Response.redirect(new URL("/api/auth/google", req.url), 302);
  }

  const tokenBody = new URLSearchParams({
    code,
    client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirect_uri: process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URL ?? "",
    grant_type: "authorization_code",
  });
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, { method: "POST", body: tokenBody });
  if (!tokenRes.ok) return Response.json({ code: "OAUTH_FAILED" }, { status: 400 });
  const tokens = await tokenRes.json();

  const userInfoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userInfoRes.ok) return Response.json({ code: "OAUTH_FAILED" }, { status: 400 });
  const userInfo = await userInfoRes.json() as { email: string; name?: string };

  let user = await db().appUser.findUnique({ where: { email: userInfo.email } });
  if (!user) {
    user = await db().appUser.create({
      data: {
        email: userInfo.email,
        termsAcceptedAt: new Date(),
        consentRecord: {
          source: "google-oauth-v1",
          purpose: "Facial measurement analysis (FaceIQ Labs-style web app)",
          retention: "Until account deletion (R-04); analyses removed on delete request",
          withdrawal: "Delete account from /history or via Support",
        },
      },
    });
  }
  const res = Response.redirect(new URL("/capture", req.url), 302);
  await createSession(res, user.id);
  // Clear the state cookie (it has expired in Google's flow).
  res.headers.append("Set-Cookie", "faceiq_oauth_state=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  return res;
}
