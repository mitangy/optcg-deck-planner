import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { BUILD_SHA, createAnalyticsBeforeSend, reloadOnStaleChunk, startUpdateChecks } from "@optcg/ui/appShell";
import { installErrorReporting } from "@optcg/ui/errorReporting";
import { captureFirstTouch } from "@optcg/ui/firstTouch";
import { watchAccountSync } from "./account/accountSync";
import { App } from "./App";
import { AppErrorBoundary } from "./board/CrashScreen";
import { getApiBaseUrl } from "./config";
import { getMatchContext } from "./matchContext";
import { DuelSessionProvider } from "./state/DuelSession";
import "@optcg/ui/tokens.css";
import "./styles.css";
import "./themes.css";
import "./ui.css";
import "./board.css";
import "./interactions.css";
import "./popupScale.css";
import "./auth/username.css";
import "./deckList.css";
import "./newDeck.css";
import "./light.css";
import "./metaDecks.css";
import "./events/events.css";
import "@optcg/site-legal/siteLegal.css";
import "@optcg/patch-notes/whatsNew.css";
import "@optcg/analyst-client/logPose.css";
import "./logPose.css";

const analyticsBeforeSend = createAnalyticsBeforeSend();

captureFirstTouch();
watchAccountSync();
startUpdateChecks();
// A tab opened before a deploy asks for lazy-route chunks that no longer exist: reload instead of a blank page.
reloadOnStaleChunk();
// A guest has no session cookie: the latest game token (if any) says who hit the error.
installErrorReporting({
  app: "duel",
  url: `${getApiBaseUrl()}/client-errors`,
  release: BUILD_SHA,
  headers: () => {
    const token = getMatchContext().gameToken;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <DuelSessionProvider>
          <App />
        </DuelSessionProvider>
      </BrowserRouter>
    </AppErrorBoundary>
    <Analytics beforeSend={analyticsBeforeSend} />
    <SpeedInsights beforeSend={analyticsBeforeSend} />
  </StrictMode>,
);
