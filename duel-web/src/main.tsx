import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { createAnalyticsBeforeSend, reloadOnStaleChunk, startUpdateChecks } from "@optcg/ui/appShell";
import { captureFirstTouch } from "@optcg/ui/firstTouch";
import { watchAccountSync } from "./account/accountSync";
import { App } from "./App";
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <DuelSessionProvider>
        <App />
      </DuelSessionProvider>
    </BrowserRouter>
    <Analytics beforeSend={analyticsBeforeSend} />
    <SpeedInsights beforeSend={analyticsBeforeSend} />
  </StrictMode>,
);
