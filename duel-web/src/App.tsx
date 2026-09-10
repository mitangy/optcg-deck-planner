import { Navigate, Route, Routes } from "react-router-dom";
import { LobbyPage } from "./pages/LobbyPage";
import { DuelPage } from "./pages/DuelPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LobbyPage />} />
      <Route path="/duel" element={<DuelPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
