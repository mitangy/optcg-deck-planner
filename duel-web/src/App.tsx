import { Navigate, Route, Routes } from "react-router-dom";
import { LobbyPage } from "./pages/LobbyPage";
import { DuelPage } from "./pages/DuelPage";
import { DemoPage } from "./pages/DemoPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LobbyPage />} />
      <Route path="/duel" element={<DuelPage />} />
      <Route path="/demo" element={<DemoPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
