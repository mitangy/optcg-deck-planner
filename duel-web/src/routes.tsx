import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { CardDataGate } from "./cards/CardDataGate";
import { AdminPage, AdminUserPage, AuthCompletePage, DeckConfigurePage, DeckListPage, DemoPage, DuelPage, EventRulesPage, HistoryPage, HotseatPage, LeaderboardPage, LeaderPage, LeadersIndexPage, LegalPage, MatchLogPage, MetaDecksPage, NewDeckPage, OptcgSimOnlinePage, PlayOnlinePage, PlayOnPhonePage, ProfilePage, ReplayPage, SettingsPage, TournamentPage, TournamentsPage, UsernameSetupPage, WhatsNewPage } from "./lazyRoutes";
import { LobbyPage } from "./pages/LobbyPage";

export type AppRoute = { path: string; element: ReactElement };

export const APP_ROUTES: readonly AppRoute[] = [
  { path: "/", element: <LobbyPage /> },
  { path: "/play-one-piece-tcg-online", element: <PlayOnlinePage /> },
  { path: "/optcg-sim-online", element: <OptcgSimOnlinePage /> },
  { path: "/play-optcg-on-phone", element: <PlayOnPhonePage /> },
  { path: "/leaders", element: <LeadersIndexPage /> },
  { path: "/leaders/:slug", element: <LeaderPage /> },
  { path: "/watch/:roomId", element: <LobbyPage /> },
  { path: "/decks", element: <CardDataGate><DeckListPage /></CardDataGate> },
  { path: "/decks/meta", element: <MetaDecksPage /> },
  { path: "/decks/new", element: <NewDeckPage /> },
  { path: "/decks/:deckId/configure", element: <DeckConfigurePage /> },
  { path: "/decks/configure", element: <Navigate to="/decks" replace /> },
  { path: "/duel", element: <DuelPage /> },
  { path: "/hotseat", element: <HotseatPage /> },
  { path: "/profile", element: <CardDataGate><ProfilePage /></CardDataGate> },
  { path: "/settings", element: <SettingsPage /> },
  { path: "/leaderboard", element: <LeaderboardPage /> },
  { path: "/tournaments", element: <TournamentsPage /> },
  { path: "/tournaments/:code", element: <TournamentPage /> },
  { path: "/history", element: <HistoryPage /> },
  { path: "/history/:matchId", element: <MatchLogPage /> },
  { path: "/replay/:matchId", element: <ReplayPage /> },
  { path: "/admin", element: <AdminPage /> },
  { path: "/admin/users/:id", element: <AdminUserPage /> },
  { path: "/auth/complete", element: <AuthCompletePage /> },
  { path: "/welcome/username", element: <UsernameSetupPage /> },
  { path: "/demo", element: <DemoPage /> },
  { path: "/whats-new", element: <WhatsNewPage /> },
  { path: "/events/:eventId/rules", element: <EventRulesPage /> },
  { path: "/terms", element: <LegalPage kind="terms" /> },
  { path: "/privacy", element: <LegalPage kind="privacy" /> },
  { path: "/cookies", element: <LegalPage kind="cookies" /> },
  { path: "/conduct", element: <LegalPage kind="conduct" /> },
  { path: "*", element: <Navigate to="/" replace /> },
];
