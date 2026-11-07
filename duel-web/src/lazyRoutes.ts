import { lazy } from "react";

/**
 * Route modules that load on demand (B-01). The lobby, the SEO landings and the legal pages stay in the entry
 * chunk because most visits end there; the board, the deck editor and the account pages are fetched when the
 * route (or a prefetch below) asks for them. Each page keeps its named export, so the prerender entry and the
 * unit tests keep importing them directly.
 */
export const loadDuelPage = () => import("./pages/DuelPage");
export const loadHotseatPage = () => import("./pages/HotseatPage");
export const loadDemoPage = () => import("./pages/DemoPage");
const loadDeckConfigurePage = () => import("./pages/DeckConfigurePage");
const loadNewDeckPage = () => import("./pages/NewDeckPage");
const loadSettingsPage = () => import("./pages/SettingsPage");
const loadHistoryPage = () => import("./pages/HistoryPage");
const loadMatchLogPage = () => import("./pages/MatchLogPage");
const loadTournamentsPage = () => import("./tournaments/TournamentsPage");
const loadTournamentPage = () => import("./tournaments/TournamentPage");

export const DuelPage = lazy(() => loadDuelPage().then((m) => ({ default: m.DuelPage })));
export const HotseatPage = lazy(() => loadHotseatPage().then((m) => ({ default: m.HotseatPage })));
export const DemoPage = lazy(() => loadDemoPage().then((m) => ({ default: m.DemoPage })));
export const DeckConfigurePage = lazy(() => loadDeckConfigurePage().then((m) => ({ default: m.DeckConfigurePage })));
export const NewDeckPage = lazy(() => loadNewDeckPage().then((m) => ({ default: m.NewDeckPage })));
export const SettingsPage = lazy(() => loadSettingsPage().then((m) => ({ default: m.SettingsPage })));
export const HistoryPage = lazy(() => loadHistoryPage().then((m) => ({ default: m.HistoryPage })));
export const MatchLogPage = lazy(() => loadMatchLogPage().then((m) => ({ default: m.MatchLogPage })));
export const TournamentsPage = lazy(() => loadTournamentsPage().then((m) => ({ default: m.TournamentsPage })));
export const TournamentPage = lazy(() => loadTournamentPage().then((m) => ({ default: m.TournamentPage })));

// The replay viewer carries the rules engine and its card data, so it loads only when someone opens /replay.
export const ReplayPage = lazy(() => import("./pages/ReplayPage"));
// Staff only, so nobody else downloads it.
export const AdminPage = lazy(() => import("./admin/AdminPage"));
export const AdminUserPage = lazy(() => import("./admin/UserPage"));

let boardPrefetched = false;

/**
 * Fetches the board chunks so pressing Play opens the board with no wait. Safe to call from hover / focus
 * handlers and the idle prefetch: it downloads once, and a failed download (offline) is retried by the real
 * navigation, so the error is swallowed here.
 */
export function prefetchBoard(): void {
  if (boardPrefetched) return;
  boardPrefetched = true;
  void Promise.all([loadDuelPage(), loadHotseatPage()]).catch(() => {
    boardPrefetched = false;
  });
}

/** Runs `prefetchBoard` once the browser is idle (a timeout stands in where `requestIdleCallback` is missing). Returns a cancel. */
export function prefetchBoardWhenIdle(): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(prefetchBoard, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(prefetchBoard, 2000);
  return () => window.clearTimeout(id);
}
