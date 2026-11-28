import { lazy, Suspense, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { FeedbackDialog, SiteFooter } from "@optcg/site-legal";
import { BuildTag } from "@optcg/ui/appShell";
import { submitFeedback } from "./feedback";
import { LogPoseProvider } from "@optcg/analyst-client";
import { ErrorBoundary } from "@optcg/ui/errorBoundary";
import {
  defaultLogPosePage,
  openDeckFor,
  openNewDeckFor,
  PLANNER_SOURCE_HOOKS,
  showsLogPose,
} from "../pages/decks/logPose";
import { LegalPage } from "../pages/LegalPage";
import { useMe } from "../auth/useMe";
import { RouteMeta } from "../seo/RouteMeta";
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
import { AuthLoadingSkeleton } from "../ui/Skeleton";
import { useLogPoseCardLightbox } from "../pages/decks/logPoseCard";
import { MetaRoute, CardRoute, HomeRoute, RequireAuth } from "./routeGuards";

// Pages a first-time visitor to the landing page does not open (#1501).
const LoginPage = lazy(() => import("../auth/LoginPage").then((m) => ({ default: m.LoginPage })));
const PublicSharePage = lazy(() => import("../pages/PublicSharePage").then((m) => ({ default: m.PublicSharePage })));
const WhatsNewPage = lazy(() => import("../pages/WhatsNewPage").then((m) => ({ default: m.WhatsNewPage })));

export default function App() {
  const { pathname } = useLocation();
  const logPosePage = useMemo(() => defaultLogPosePage(pathname), [pathname]);
  const { data: me } = useMe();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const navigate = useNavigate();
  const { openCard, lightbox: cardLightbox } = useLogPoseCardLightbox();
  const sources = useMemo(() => ({ ...PLANNER_SOURCE_HOOKS, openCard, openDeck: openDeckFor((to) => navigate(to)), openNewDeck: openNewDeckFor((to, o) => navigate(to, o)) }), [navigate, openCard]);
  return (
    <LogPoseProvider apiBase={api.apiUrl} hidden={!showsLogPose(pathname)} defaultPage={logPosePage} account={me?.id ?? null} sources={sources}>
      <RouteMeta signedIn={!!me} />
      <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<AuthLoadingSkeleton label="Loading…" />}>
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
      </Suspense>
      </ErrorBoundary>
      <SiteFooter Link={Link} onFeedback={() => setFeedbackOpen(true)} trailing={<BuildTag />} />
      {feedbackOpen ? (
        <FeedbackDialog
          title="Send feedback"
          submit={(payload) => submitFeedback(payload)}
          onClose={() => setFeedbackOpen(false)}
        />
      ) : null}
      {cardLightbox}
    </LogPoseProvider>
  );
}
