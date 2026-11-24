import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api";
import { PlannerLandingPage } from "../pages/LandingPage";
import { PublicCardScreen } from "../cards/PublicCardScreen";
import { PublicMetaScreen } from "../meta/PublicMetaScreen";
import { KEEP_PRERENDER_WHILE_LOADING } from "./prerendered";
import { useMe } from "../auth/useMe";
import { CardPage } from "../cards/CardPage";
import { MetaPage } from "../meta/MetaPage";
import { AuthLoadingSkeleton } from "../ui/Skeleton";
import { Shell } from "./Shell";
import { ShoppingPage } from "./lazyPages";
import { renderCardPageActions } from "../pages/shopping/lightboxActions";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isLoading, isError, isFetching, refetch } = useMe();
  if (isLoading) return <AuthLoadingSkeleton label="Loading…" />;
  // A failed check says nothing about whether the visitor is signed in, so don't bounce them to the sign-in page.
  if (isError && user === undefined) {
    return (
      <main className="app-main">
        <div className="empty-state" role="alert">
          <h2>Can't reach the server</h2>
          <p>We couldn't check your sign-in. Your decks and collection are safe.</p>
          <button type="button" className="btn primary" disabled={isFetching} onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      </main>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Shell user={user}>{children}</Shell>;
}

export function HomeRoute() {
  const { data: user, isLoading, refetch } = useMe();
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
