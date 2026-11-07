import { useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import { FeedbackDialog, SiteFooter } from "@optcg/site-legal";
import { submitFeedback } from "./feedback";
import { LogPoseProvider } from "@optcg/analyst-client";
import {
  defaultLogPosePage,
  openDeckFor,
  openNewDeckFor,
  PLANNER_SOURCE_HOOKS,
  showsLogPose,
} from "./logPose";
import { LegalPage } from "./LegalPage";
import { useMe } from "./auth/useMe";
import { RouteMeta } from "./seo/RouteMeta";
import { WhatsNewPage } from "./WhatsNewPage";
import {
  AlertsRoute,
  CollectionPage,
  DeckDetailPage,
  DecksPage,
  ImportPage,
  FriendDeckPage,
  FriendPage,
  FriendsPage,
  ScanValidatePage,
  GroupBuyDetailPage,
  GroupBuyJoinPage,
  GroupBuysPage,
  PublicGroupBuyPage,
} from "./lazyPages";
import { LoginPage } from "./pages/LoginPage";
import { PublicSharePage } from "./pages/PublicSharePage";
import { MetaRoute, CardRoute, HomeRoute, RequireAuth } from "./app/routeGuards";

export default function App() {
  const { pathname } = useLocation();
  const logPosePage = useMemo(() => defaultLogPosePage(pathname), [pathname]);
  // Shares RequireAuth's cached /auth/me query; signing in or out asks for the chat session again.
  const { data: me } = useMe();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const navigate = useNavigate();
  // A deck Log Pose builds opens the import page with the list filled in (#726).
  const sources = useMemo(() => ({ ...PLANNER_SOURCE_HOOKS, openDeck: openDeckFor((to) => navigate(to)), openNewDeck: openNewDeckFor((to, o) => navigate(to, o)) }), [navigate]);
  return (
    <LogPoseProvider apiBase={api.apiUrl} hidden={!showsLogPose(pathname)} defaultPage={logPosePage} account={me?.id ?? null} sources={sources}>
      <RouteMeta signedIn={!!me} />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/share/:token" element={<PublicSharePage />} />
        <Route path="/meta" element={<MetaRoute />} />
        <Route path="/cards/:cardId" element={<CardRoute />} />
        <Route path="/group-buy/join/:token" element={<GroupBuyJoinPage />} />
        <Route path="/group-buy/view/:token" element={<PublicGroupBuyPage />} />
        <Route path="/whats-new" element={<WhatsNewPage />} />
        <Route path="/terms" element={<LegalPage kind="terms" />} />
        <Route path="/privacy" element={<LegalPage kind="privacy" />} />
        <Route path="/cookies" element={<LegalPage kind="cookies" />} />
        <Route path="/conduct" element={<LegalPage kind="conduct" />} />
        {import.meta.env.DEV && <Route path="/dev/scan-validate" element={<ScanValidatePage />} />}
        <Route path="/" element={<HomeRoute />} />
        <Route
          path="/decks"
          element={
            <RequireAuth>
              <DecksPage />
            </RequireAuth>
          }
        />
        <Route
          path="/decks/:id"
          element={
            <RequireAuth>
              <DeckDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/collection"
          element={
            <RequireAuth>
              <CollectionPage />
            </RequireAuth>
          }
        />
        <Route
          path="/alerts"
          element={
            <RequireAuth>
              <AlertsRoute />
            </RequireAuth>
          }
        />
        <Route
          path="/friends"
          element={
            <RequireAuth>
              <FriendsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/friends/:username"
          element={
            <RequireAuth>
              <FriendPage />
            </RequireAuth>
          }
        />
        <Route
          path="/friends/:username/decks/:deckId"
          element={
            <RequireAuth>
              <FriendDeckPage />
            </RequireAuth>
          }
        />
        <Route
          path="/group-buys"
          element={
            <RequireAuth>
              <GroupBuysPage />
            </RequireAuth>
          }
        />
        <Route
          path="/group-buys/:id"
          element={
            <RequireAuth>
              <GroupBuyDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/import"
          element={
            <RequireAuth>
              <ImportPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SiteFooter Link={Link} onFeedback={() => setFeedbackOpen(true)} />
      {feedbackOpen ? (
        <FeedbackDialog
          title="Send feedback"
          submit={(payload) => submitFeedback(payload)}
          onClose={() => setFeedbackOpen(false)}
        />
      ) : null}
    </LogPoseProvider>
  );
}
