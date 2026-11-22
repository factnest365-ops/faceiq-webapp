/**
 * Database access (Prisma + Postgres, spec 7.3).
 *
 * Tables: app_user, profile, scan, photo, landmark_set, measurement, analysis.
 * RLS: every table is scoped to the user via app_user_id column policies.
 */

import { PrismaClient } from "@prisma/client";

let _client: PrismaClient | null = null;

function withPoolOptions(url: string): string {
  // Do not override an operator's explicit pooling (e.g. PgBouncer).
  if (
    url.includes("pgbouncer=true") ||
    url.includes("connection_limit=") ||
    url.includes("pool_timeout=")
  ) {
    return url;
  }
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}connection_limit=20&pool_timeout=10`;
}

export function db(): PrismaClient {
  if (!_client) {
    const url = withPoolOptions(process.env.DATABASE_URL ?? "");
    _client = new PrismaClient({ log: ["warn"], datasources: { db: { url } } });
  }
  return _client;
}
