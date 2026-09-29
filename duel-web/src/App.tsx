import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthCompletePage } from "./pages/AuthCompletePage";
import { DeckConfigurePage } from "./pages/DeckConfigurePage";
import { DeckListPage } from "./pages/DeckListPage";
import { NewDeckPage } from "./pages/NewDeckPage";
import { DemoPage } from "./pages/DemoPage";
import { DuelPage } from "./pages/DuelPage";
import { HotseatPage } from "./pages/HotseatPage";
import { LobbyPage } from "./pages/LobbyPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UsernameSetupPage } from "./pages/UsernameSetupPage";
import { useDuelSettings } from "./settings";

export function App() {
  const { reduceMotion } = useDuelSettings();
  // CSS mirrors its prefers-reduced-motion rules under [data-motion="reduce"].
  useEffect(() => {
    if (reduceMotion) document.documentElement.dataset.motion = "reduce";
    else delete document.documentElement.dataset.motion;
  }, [reduceMotion]);

  return (
    <Routes>
      <Route path="/" element={<LobbyPage />} />
      <Route path="/decks" element={<DeckListPage />} />
      <Route path="/decks/new" element={<NewDeckPage />} />
      <Route path="/decks/:deckId/configure" element={<DeckConfigurePage />} />
      <Route path="/decks/configure" element={<Navigate to="/decks" replace />} />
      <Route path="/duel" element={<DuelPage />} />
      <Route path="/hotseat" element={<HotseatPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/auth/complete" element={<AuthCompletePage />} />
      <Route path="/welcome/username" element={<UsernameSetupPage />} />
      <Route path="/demo" element={<DemoPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
