import { createErrorReporter, type ErrorApp, type ErrorReporter } from "./reporter";

let active: ErrorReporter | null = null;

/** The error boundary calls this; it does nothing until an app has called installErrorReporting. */
export function reportBoundaryError(error: unknown, componentStack?: string | null): void {
  active?.report(error, componentStack ? `Component stack:${componentStack}` : "");
}

export function isAutomatedBrowser(): boolean {
  return typeof navigator !== "undefined" && navigator.webdriver === true;
}

/** Reports uncaught errors and unhandled rejections to `url` (POST /client-errors) and arms the error boundary's reporting. */
export function installErrorReporting(opts: {
  app: ErrorApp;
  url: string;
  release: string;
  headers?: () => Record<string, string>;
}): () => void {
  const reporter = createErrorReporter({
    app: opts.app,
    release: opts.release,
    enabled: !isAutomatedBrowser(),
    pagePath: () => window.location.pathname,
    send: (report) => {
      try {
        void fetch(opts.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...opts.headers?.() },
          body: JSON.stringify(report),
          credentials: "include",
          keepalive: true,
        }).catch(() => undefined);
      } catch {
        /* reporting must never throw into the page */
      }
    },
  });
  const onError = (e: ErrorEvent) => void reporter.report(e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) => void reporter.report(e.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  active = reporter;
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    if (active === reporter) active = null;
  };
}
