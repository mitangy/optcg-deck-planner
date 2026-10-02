import { useEffect, useLayoutEffect } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { SiteFooter } from "@optcg/site-legal";
import { AuthCompletePage } from "./pages/AuthCompletePage";
import { DeckConfigurePage } from "./pages/DeckConfigurePage";
import { DeckListPage } from "./pages/DeckListPage";
import { NewDeckPage } from "./pages/NewDeckPage";
import { DemoPage } from "./pages/DemoPage";
import { DuelPage } from "./pages/DuelPage";
import { HotseatPage } from "./pages/HotseatPage";
import { LegalPage } from "./pages/LegalPage";
import { LobbyPage } from "./pages/LobbyPage";
import { SettingsPage } from "./pages/SettingsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { MatchLogPage } from "./pages/MatchLogPage";
import { UsernameSetupPage } from "./pages/UsernameSetupPage";
import { useDuelSettings } from "./settings";
import { showsSiteFooter } from "./siteFooter";
import { applyTheme, LIGHT_QUERY } from "./theme";
import { useMediaQuery } from "./board/useMediaQuery";

export function App() {
  const { reduceMotion, theme, colorMode } = useDuelSettings();
  // Re-applies when the device switches light / dark while on "Match my device".
  const deviceLight = useMediaQuery(LIGHT_QUERY);
  const { pathname } = useLocation();
  // Before paint, so switching theme (or loading it from the account) never
  // flashes the old palette.
  useLayoutEffect(() => applyTheme(theme, colorMode), [theme, colorMode, deviceLight]);
  // CSS mirrors its prefers-reduced-motion rules under [data-motion="reduce"].
  useEffect(() => {
    if (reduceMotion) document.documentElement.dataset.motion = "reduce";
    else delete document.documentElement.dataset.motion;
  }, [reduceMotion]);

  return (
    <>
      <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/decks" element={<DeckListPage />} />
        <Route path="/decks/new" element={<NewDeckPage />} />
        <Route path="/decks/:deckId/configure" element={<DeckConfigurePage />} />
        <Route path="/decks/configure" element={<Navigate to="/decks" replace />} />
        <Route path="/duel" element={<DuelPage />} />
        <Route path="/hotseat" element={<HotseatPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/history/:matchId" element={<MatchLogPage />} />
        <Route path="/auth/complete" element={<AuthCompletePage />} />
        <Route path="/welcome/username" element={<UsernameSetupPage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/terms" element={<LegalPage kind="terms" />} />
        <Route path="/privacy" element={<LegalPage kind="privacy" />} />
        <Route path="/cookies" element={<LegalPage kind="cookies" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showsSiteFooter(pathname) && <SiteFooter Link={Link} className="site-footer-centered" />}
    </>
  );
}
