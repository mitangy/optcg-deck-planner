import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { analyticsBeforeSend } from "./analytics";
import App from "./App";
import "./styles.css";
import "@optcg/deck-analytics/ui/deckAnalytics.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
    },
  },
});

createRoot(document.getElementById("root")!).render(
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
