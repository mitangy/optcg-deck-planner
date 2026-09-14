import { Navigate, Route, Routes } from "react-router-dom";
import { AuthCompletePage } from "./pages/AuthCompletePage";
import { DeckConfigurePage } from "./pages/DeckConfigurePage";
import { DeckListPage } from "./pages/DeckListPage";
import { NewDeckPage } from "./pages/NewDeckPage";
import { DemoPage } from "./pages/DemoPage";
import { DuelPage } from "./pages/DuelPage";
import { HotseatPage } from "./pages/HotseatPage";
import { LobbyPage } from "./pages/LobbyPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LobbyPage />} />
      <Route path="/decks" element={<DeckListPage />} />
      <Route path="/decks/new" element={<NewDeckPage />} />
      <Route path="/decks/:deckId/configure" element={<DeckConfigurePage />} />
      <Route path="/decks/configure" element={<Navigate to="/decks" replace />} />
      <Route path="/duel" element={<DuelPage />} />
      <Route path="/hotseat" element={<HotseatPage />} />
      <Route path="/auth/complete" element={<AuthCompletePage />} />
      <Route path="/demo" element={<DemoPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
