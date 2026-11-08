import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { createAnalyticsBeforeSend, startUpdateChecks } from "@optcg/ui/appShell";
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

// Only origin + path reach analytics: auth tokens sit in the hash and invite codes in `?join=`.
const analyticsBeforeSend = createAnalyticsBeforeSend();

// Before routing can rewrite the URL: remember where a new visitor came from (#905).
captureFirstTouch();
// Signed-in players get their settings and playmat / card back from the account.
watchAccountSync();
// Lobby and Settings say when a newer deploy is live than this bundle.
startUpdateChecks();

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
