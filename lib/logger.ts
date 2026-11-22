type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const configured = String(process.env.LOG_LEVEL ?? "info").toLowerCase();
const minLevel: Level = configured in LEVEL_ORDER ? (configured as Level) : "info";
const minLevelOrder = LEVEL_ORDER[minLevel];

export function log(level: Level, msg: string, extra?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < minLevelOrder) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(extra ?? {}),
  });
  // Edge runtime (e.g. middleware in edge mode) has no process.stdout; log only where stdout exists.
  const stdout = typeof process !== "undefined" ? process.stdout : undefined;
  if (!stdout) return;
  stdout.write(line + "\n");
}

export const logger = {
  debug: (msg: string, extra?: Record<string, unknown>) => log("debug", msg, extra),
  info: (msg: string, extra?: Record<string, unknown>) => log("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => log("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => log("error", msg, extra),
};
