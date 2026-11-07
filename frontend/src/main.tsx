import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { startUpdateChecks } from "@optcg/ui/appShell";
import { captureFirstTouch } from "@optcg/ui/firstTouch";
import { analyticsBeforeSend } from "./analytics";
import App from "./App";
import { readMetaSeed, releasePrerenderedRoot } from "./prerendered";
import "@optcg/ui/tokens.css";
import "./styles.css";
import "@optcg/deck-analytics/ui/deckAnalytics.css";
import "@optcg/site-legal/siteLegal.css";
import "@optcg/patch-notes/whatsNew.css";
import "@optcg/analyst-client/logPose.css";
import "./logPose.css";
import "./friends/friends.css";
import { qk } from "./queryKeys";

// Before routing can rewrite the URL: remember where a new visitor came from (#905).
captureFirstTouch();
startUpdateChecks();

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
