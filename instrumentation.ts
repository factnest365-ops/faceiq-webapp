import { logger } from "@/lib/logger";

export async function register(): Promise<void> {
  logger.info("server.start", { pid: process.pid });
}
