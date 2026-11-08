import { getLogLevel } from "./env.js";

export type LogLevel = "debug" | "info" | "warn";

/** One JSON line per event on stdout (warn on stderr), filtered by LOG_LEVEL. Shared by the duel and matchmaker rooms. */
export function writeLog(level: LogLevel, event: string, data: Record<string, unknown>): void {
  const configured = getLogLevel();
  const order = { debug: 0, info: 1, warn: 2 } as const;
  if (order[level] < order[configured]) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  });
  if (level === "warn") console.warn(line);
  else console.log(line);
}
