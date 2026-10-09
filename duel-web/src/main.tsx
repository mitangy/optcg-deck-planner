import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { analyticsBeforeSend } from "./analytics";
import { startAccountSync } from "./account/accountSync";
import { App } from "./App";
import { startUpdateChecks } from "./appVersion";
import { DuelSessionProvider } from "./state/DuelSession";
import "./styles.css";
import "./themes.css";
import "./ui.css";
import "./board.css";
import "./interactions.css";
import "./auth/username.css";
import "./light.css";
import "./metaDecks.css";
import "@optcg/site-legal/siteLegal.css";
import "@optcg/analyst-client/logPose.css";
import "./logPose.css";

// Signed-in players get their settings and playmat / card back from the account.
void startAccountSync();
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
