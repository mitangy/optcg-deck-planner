import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { DuelSessionProvider } from "./state/DuelSession";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <DuelSessionProvider>
        <App />
      </DuelSessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
