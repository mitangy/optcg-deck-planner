import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api";
import { PlannerLandingPage } from "../LandingPage";
import { PublicCardScreen } from "../PublicCardScreen";
import { PublicMetaScreen } from "../PublicMetaScreen";
import { KEEP_PRERENDER_WHILE_LOADING } from "../prerendered";
import { useMe } from "../auth/useMe";
import { CardPage } from "../CardPage";
import { MetaPage } from "../MetaPage";
import { AuthLoadingSkeleton } from "../Skeleton";
import { Shell } from "./Shell";
import { ShoppingPage } from "../lazyPages";
import { renderCardPageActions } from "../pages/shopping/lightboxActions";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useMe();
  if (isLoading) return <AuthLoadingSkeleton label="Loading…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Shell user={user}>{children}</Shell>;
}

/** `/` is the public landing page for visitors and the shopping list for signed-in players (#804). */
export function HomeRoute() {
  const { data: user, isLoading, refetch } = useMe();
  // A pre-rendered page keeps showing the landing page while the session loads (see prerendered.ts).
  if (isLoading && !KEEP_PRERENDER_WHILE_LOADING) return <AuthLoadingSkeleton label="Loading…" />;
  if (!user) {
    return (
      <PlannerLandingPage
        onDevLogin={async () => {
          await api.devLogin();
          await refetch();
        }}
      />
    );
  }
  return (
    <Shell user={user}>
      <ShoppingPage />
    </Shell>
  );
}

/** Meta browsing is public: signed-in users get the app shell, everyone else the slim public header. */
export function MetaRoute() {
  const { data: user, isLoading } = useMe();
  if (isLoading && !KEEP_PRERENDER_WHILE_LOADING) return <AuthLoadingSkeleton label="Loading…" />;
  if (user) {
    return (
      <Shell user={user}>
        <MetaPage user={user} />
      </Shell>
    );
  }
  return <PublicMetaScreen />;
}

/** A card's page is public: signed-in users get the app shell (and their owned/alert controls), everyone else the slim public header. */
export function CardRoute() {
  const { data: user, isLoading } = useMe();
  if (isLoading && !KEEP_PRERENDER_WHILE_LOADING) return <AuthLoadingSkeleton label="Loading…" />;
  if (user) {
    return (
      <Shell user={user}>
        <CardPage renderActions={renderCardPageActions} />
      </Shell>
    );
  }
  return <PublicCardScreen />;
}
