import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { BUILD_SHA, reloadOnStaleChunk, startUpdateChecks } from "@optcg/ui/appShell";
import { installErrorReporting } from "@optcg/ui/errorReporting";
import { captureFirstTouch } from "@optcg/ui/firstTouch";
import { analyticsBeforeSend } from "./app/analytics";
import { API_URL } from "./apiClient";
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
installErrorReporting({ app: "planner", url: `${API_URL}/client-errors`, release: BUILD_SHA });

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
