export type ErrorApp = "duel" | "planner";

export type ErrorReport = {
  app: ErrorApp;
  message: string;
  stack: string;
  url: string;
  release: string;
};

export type ErrorReporterOptions = {
  app: ErrorApp;
  release: string;
  send: (report: ErrorReport) => void;
  /** Reports sent per page load; a render loop must not become a request loop. */
  maxPerPage?: number;
  /** False in automated browsers, so test runs do not fill the table. */
  enabled?: boolean;
  pagePath?: () => string;
};

export const MAX_REPORTS_PER_PAGE = 10;

function firstFrame(stack: string): string {
  return stack.split("\n").find((l) => /^\s*at\s|@/.test(l))?.trim() ?? "";
}

export function describeError(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack ?? "" };
  if (typeof error === "string") return { message: error, stack: "" };
  try {
    return { message: JSON.stringify(error) ?? String(error), stack: "" };
  } catch {
    return { message: String(error), stack: "" };
  }
}

export function createErrorReporter(opts: ErrorReporterOptions) {
  const max = opts.maxPerPage ?? MAX_REPORTS_PER_PAGE;
  const seen = new Set<string>();
  return {
    /** Sends one report unless it is a repeat of one already sent or the page used up its budget. Returns whether it sent. */
    report(error: unknown, extraStack = ""): boolean {
      if (opts.enabled === false || seen.size >= max) return false;
      const { message, stack } = describeError(error);
      const key = `${message}|${firstFrame(stack)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      opts.send({
        app: opts.app,
        message,
        stack: extraStack ? `${stack}\n${extraStack}` : stack,
        url: opts.pagePath?.() ?? "",
        release: opts.release,
      });
      return true;
    },
  };
}

export type ErrorReporter = ReturnType<typeof createErrorReporter>;
