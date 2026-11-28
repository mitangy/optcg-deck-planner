import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { reloadOnStaleChunk, startUpdateChecks } from "@optcg/ui/appShell";
import { captureFirstTouch } from "@optcg/ui/firstTouch";
import { analyticsBeforeSend } from "./app/analytics";
import { claimDuelHandoff } from "./app/duelLink";
import App from "./app/App";
import { readMetaSeed, releasePrerenderedRoot } from "./app/prerendered";
import "@optcg/ui/tokens.css";
import "./styles.css";
import "@optcg/deck-analytics/ui/deckAnalytics.css";
import "@optcg/site-legal/siteLegal.css";
import "@optcg/patch-notes/whatsNew.css";
import "@optcg/analyst-client/logPose.css";
import "./pages/decks/logPose.css";
import "./friends/friends.css";
import { qk } from "./cache/queryKeys";

captureFirstTouch();
startUpdateChecks();
// A tab opened before a deploy asks for lazy-route chunks that no longer exist: reload instead of a blank page (#1074).
reloadOnStaleChunk();

// A link from the Duel app carries a sign-in ticket: claim it before the first render so the app starts signed in.
// Capped, so a slow API never holds the page blank.
const HANDOFF_WAIT_MS = 5000;
let handoffTimedOut = false;
const handoffClaim = claimDuelHandoff();
const handoffWait = new Promise((resolve) =>
  setTimeout(() => {
    handoffTimedOut = true;
    resolve(null);
  }, HANDOFF_WAIT_MS),
);
void Promise.race([handoffClaim, handoffWait]).then(() => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 15_000,
      },
    },
  });

  // A pre-rendered /meta carries the leaders it was built with: show them at once, and refetch because they are older than the page.
  const seed = readMetaSeed();
  if (seed) queryClient.setQueryData(qk.meta.leaders(seed.days), seed.leaders, { updatedAt: Date.parse(seed.generatedAt) });

  // A claim that outlasts the wait lands after the first /auth/me said "signed out": refetch so the app leaves the sign-in wall.
  if (handoffTimedOut) {
    void handoffClaim.then((outcome) => {
      if (outcome === "claimed") void queryClient.invalidateQueries({ queryKey: qk.me() });
    });
  }

  const rootEl = document.getElementById("root")!;
  releasePrerenderedRoot(rootEl);

  createRoot(rootEl).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
        <Analytics beforeSend={analyticsBeforeSend} />
        <SpeedInsights beforeSend={analyticsBeforeSend} />
      </QueryClientProvider>
    </StrictMode>,
  );
});
