import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(): Promise<Response> {
  try {
    await db().$queryRawUnsafe("SELECT 1");
    return Response.json({ status: "ok" });
  } catch (error) {
    logger.warn("ready.db_check_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { status: "fail", error: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
}
