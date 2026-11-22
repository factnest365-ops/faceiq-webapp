import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { metrics } from "@/lib/metrics";

// Node runtime: process.stdout exists, so request logs actually go to the server log.
export const runtime = "nodejs";

const QUIET_PREFIXES = ["/_next/", "/favicon"];

export default async function middleware(req: NextRequest): Promise<Response> {
  const path = req.nextUrl.pathname;
  const quiet = QUIET_PREFIXES.some((p) => path.startsWith(p));
  const start = Date.now();
  const response = await NextResponse.next();
  if (!quiet) {
    metrics.incRequest(req.method, response.status);
    logger.info("http.request", {
      method: req.method,
      path,
      status: response.status,
      ms: Date.now() - start,
    });
  }
  return response;
}
