/** GET /api/auth/google - start Google OAuth redirect (spec 7.4, A-05). */
import { buildGoogleAuthUrl } from "@/lib/oauth";

export async function GET() {
  return Response.redirect(buildGoogleAuthUrl(), 302);
}
