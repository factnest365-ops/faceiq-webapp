/** GET /api/auth/me - returns the current signed-in user or 401 (A-05). */
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser(new Request("http://internal"));
  if (!user) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  return Response.json(user);
}
