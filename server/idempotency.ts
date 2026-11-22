import { createHash } from "node:crypto";

/** Idempotency key (A-06): same landmark set + engine version -> same analysis. */
export function idempotencyHash(
  points: Array<{ x: number; y: number; z?: number; confidence?: number }>,
  engineVersion: string,
  normVersion: string,
): string {
  const canonical = JSON.stringify([points.map((p) => [p.x, p.y, p.z ?? 0, p.confidence ?? 1]).sort((a, b) => a[0] - b[0] || a[1] - b[1]), engineVersion, normVersion]);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}
