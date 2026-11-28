import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { reloadOnStaleChunk, startUpdateChecks } from "@optcg/ui/appShell";
import { captureFirstTouch } from "@optcg/ui/firstTouch";
import { watchAccountSync } from "./account/accountSync";
import { App } from "./App";
import { DuelSessionProvider } from "./state/DuelSession";
// The landing and leader pages load on demand now, but their sheets (7 KB) still go first, where they sat when the
// pages were imported by the app: the sheets below override them at equal specificity, and a lazy sheet would win instead (#1501).
import "./pages/playOnline.css";
import "./pages/leaders.css";
import "./pages/landing973.css";
import "@optcg/ui/tokens.css";
import "./styles.css";
import "./themes.css";
import "./ui.css";
import "./interactions.css";
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

const AnalyticsHost = lazy(() => import("./AnalyticsHost"));

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
    <Suspense fallback={null}>
      <AnalyticsHost />
    </Suspense>
  </StrictMode>,
);
