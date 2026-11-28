import type { ReactNode } from "react";
import { ErrorBoundary } from "@optcg/ui/errorBoundary";

function CrashScreen({ title, body, action }: { title: string; body: string; action: string }) {
  return (
    <div className="crash-screen" role="alert">
      <div className="crash-card">
        <h2>{title}</h2>
        <p>{body}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          {action}
        </button>
      </div>
    </div>
  );
}

/** Outside the router and the session on purpose: it has to render when everything inside broke. */
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={<CrashScreen title="Something went wrong" body="Reload the page to keep going. Your decks and saved games are safe." action="Reload" />}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * Around the match board. The reconnect token is saved in this tab, so reloading puts the player back in
 * the same seat (DuelSessionProvider resumes it on mount); the match itself keeps running on the server meanwhile.
 */
export function BoardErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <CrashScreen
          title="Something broke. Reload and rejoin."
          body="Your seat is held for a couple of minutes, so you land back in this game where you left it."
          action="Reload and rejoin"
        />
      }
    >
      {children}
    </ErrorBoundary>
  );
}
