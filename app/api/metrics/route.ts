import { metrics } from "@/lib/metrics";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(): Promise<Response> {
  let dbReady = false;
  try {
    await db().$queryRawUnsafe("SELECT 1");
    dbReady = true;
  } catch (error) {
    logger.warn("metrics.db_check_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const counters = metrics
    .requestCounters()
    .map(
      (r) =>
        `faceiq_http_requests_total{method="${r.key.split(" ")[0]}",status="${r.key.split(" ")[1]}"} ${r.value}`,
    );
  const lines = [
    "# HELP faceiq_up 1 if the server is up.",
    "# TYPE faceiq_up gauge",
    "faceiq_up 1",
    "# HELP faceiq_db_ready 1 if a Postgres SELECT 1 succeeds at scrape time.",
    "# TYPE faceiq_db_ready gauge",
    `faceiq_db_ready ${dbReady ? 1 : 0}`,
    "# HELP faceiq_uptime_seconds seconds since server start.",
    "# TYPE faceiq_uptime_seconds gauge",
    `faceiq_uptime_seconds ${metrics.uptimeSeconds()}`,
    "# HELP faceiq_http_requests_total requests served since start.",
    "# TYPE faceiq_http_requests_total counter",
    ...counters,
  ];
  return new Response(lines.join("\n") + "\n", {
    headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}
