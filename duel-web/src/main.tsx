import { Analytics } from "@vercel/analytics/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { analyticsBeforeSend } from "./analytics";
import { App } from "./App";
import { DuelSessionProvider } from "./state/DuelSession";
import "./styles.css";
import "./ui.css";
import "./board.css";
import "./interactions.css";
import "./auth/username.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <DuelSessionProvider>
        <App />
      </DuelSessionProvider>
    </BrowserRouter>
    <Analytics beforeSend={analyticsBeforeSend} />
  </StrictMode>,
);
