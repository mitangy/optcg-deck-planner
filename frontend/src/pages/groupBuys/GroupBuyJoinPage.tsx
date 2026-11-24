import { useCardLayout, useListDensity } from "../../ui/CardLayout";
import { CardWorkspace } from "../../ui/CardWorkspace";
import { FilterCheck, ListToolbar } from "../../ui/ListToolbar";
import { AuthLoadingSkeleton, GroupBuyDetailSkeleton } from "../../ui/Skeleton";
import { ThemeToggle } from "../../ui/ThemeToggle";
import { Topbar } from "../../app/Topbar";
import { api, GroupBuyDetail } from "../../api";
import { useMe } from "../../auth/useMe";
import { useCardSorts, useShowAltArts, type SortKey } from "../../ui/cardListControls";
import { rememberLoginNext } from "../../auth/loginNext";
import { useGroupBuyListNarrow } from "../../hooks/useGroupBuyListNarrow";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { GroupBuyLines } from "./GroupBuyLines";
import { GroupBuyMembersList, GroupBuyOrderDetails, GroupBuySettlement, hasOrderPanel } from "./GroupBuyPanels";
import { stepLabel } from "./groupBuyActions";
import { readOnlyAltRow, wantedAlts } from "./memberParts";
import { useGroupBuyLines } from "./useGroupBuyLines";
import { COLSORT_GB_PUBLIC_KEY } from "../../storage/keys";
import { qk } from "../../cache/queryKeys";

export function PublicGroupBuyPage() {
  const { token = "" } = useParams();
  return <Navigate to={`/group-buy/join/${encodeURIComponent(token)}`} replace />;
}

export function GroupBuyJoinPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const meQ = useMe();
  const previewQ = useQuery({
    queryKey: qk.groupBuy.invite(token),
    queryFn: () => api.groupBuyInvitePreview(token),
    enabled: Boolean(token),
  });
  const detailQ = useQuery({
    queryKey: qk.groupBuy.publicView(token),
    queryFn: () => api.publicGroupBuy(token),
    enabled: Boolean(token),
  });
  const [err, setErr] = useState<string | null>(null);

  const join = useMutation({
    mutationFn: () => api.joinGroupBuy(token),
    onSuccess: (detail) => navigate(`/group-buys/${detail.id}`, { replace: true }),
    onError: (e: Error) => setErr(e.message),
  });

  if (!token) return <p className="error">Missing invite token.</p>;
  if (previewQ.isLoading || meQ.isLoading) {
    return <AuthLoadingSkeleton label="Loading invite…" />;
  }
  if (previewQ.error) return <p className="error">{(previewQ.error as Error).message}</p>;
  const preview = previewQ.data!;
  const nextPath = `/group-buy/join/${token}`;
  const signedIn = Boolean(meQ.data);
  const loginTo = `/login?next=${encodeURIComponent(nextPath)}`;

  return (
    <div className="app public-app">
      <Topbar brandTo={signedIn ? "/group-buys" : "/login"}>
        <ThemeToggle />
        {signedIn ? (
          <Link className="btn secondary" to="/group-buys">
            Group buys
          </Link>
        ) : (
          <Link className="btn secondary" to={loginTo} onClick={() => rememberLoginNext(nextPath)}>
            Sign in
          </Link>
        )}
      </Topbar>
      <main className="app-main">
        <section className="group-buy-detail group-buy-public-view">
          <div className="group-buy-invite-banner">
            <div className="group-buy-invite-info">
              <p className="eyebrow">Group buy invite · read-only preview</p>
              <h1>{preview.title}</h1>
              <p className="muted">
                <span className={`group-buy-status status-${preview.status}`}>{stepLabel(preview.status)}</span>
                {" · "}
                Hosted by {preview.host_name} · {preview.member_count} member
                {preview.member_count === 1 ? "" : "s"}
              </p>
              {err && <p className="error">{err}</p>}
            </div>
            <div className="group-buy-invite-action">
              {preview.status !== "open" ? (
                <button type="button" className="btn primary" disabled>
                  {`${preview.status[0].toUpperCase()}${preview.status.slice(1)} — cannot join`}
                </button>
              ) : signedIn ? (
                <button
                  type="button"
                  className="btn primary"
                  disabled={join.isPending}
                  onClick={() => join.mutate()}
                >
                  {join.isPending ? "Joining…" : "Join group buy"}
                </button>
              ) : (
                <Link className="btn primary" to={loginTo} onClick={() => rememberLoginNext(nextPath)}>
                  Sign in to join
                </Link>
              )}
            </div>
          </div>
          {detailQ.isLoading ? (
            <GroupBuyDetailSkeleton />
          ) : detailQ.error ? (
            <p className="error">{(detailQ.error as Error).message}</p>
          ) : detailQ.data ? (
            <GroupBuyReadOnlyContent detail={detailQ.data} />
          ) : null}
        </section>
      </main>
    </div>
  );
}

function GroupBuyReadOnlyContent({ detail }: { detail: GroupBuyDetail }) {
  const isNarrow = useGroupBuyListNarrow();
  const [layout, setLayout] = useCardLayout();
  const [density, setDensity] = useListDensity("groupBuy");
  const [showAltArts, setShowAltArts] = useShowAltArts();
  const [search, setSearch] = useState("");
  const unavailableSorts = useMemo(() => ["deck"] as SortKey[], []);
  const { sorts, setSorts, effectiveSorts } = useCardSorts(true, unavailableSorts);
  const members = detail.members ?? [];
  const { lines, displayRows, tableRows, cardsSort, onCardsSort } = useGroupBuyLines(
    detail.lines ?? [],
    members,
    search,
    effectiveSorts,
    COLSORT_GB_PUBLIC_KEY,
  );

  return (
    <>
      <GroupBuyMembersList detail={detail} />
      {hasOrderPanel(detail) ? (
        <GroupBuySettlement detail={detail} readOnly>
          <GroupBuyOrderDetails detail={detail} />
        </GroupBuySettlement>
      ) : null}

      <h2 className="group-buy-merged-heading">Cards · {detail.lines?.length ?? 0}</h2>
      <CardWorkspace
        rail={
          <ListToolbar
            className="group-buy-merged-toolbar"
            search={{ value: search, onChange: setSearch }}
            sort={{
              sorts,
              onChange: setSorts,
              onlyNeed: true,
              unavailableKeys: unavailableSorts,
              columnSortKey: COLSORT_GB_PUBLIC_KEY,
            }}
            filterBadge={showAltArts ? 0 : 1}
            filters={
              <>
                <div className="collection-filter-list">
                  <FilterCheck checked={showAltArts} onChange={setShowAltArts}>
                    Show alt arts
                  </FilterCheck>
                </div>
                {effectiveSorts.includes("user") ? (
                  <p className="sort-deck-note muted">
                    User sort groups cards by who wants them (member list order). Cards wanted by
                    multiple people stay under their earliest member.
                  </p>
                ) : null}
              </>
            }
            layout={layout}
            onLayout={setLayout}
            density={density}
            onDensity={setDensity}
          />
        }
      >
      {lines.length ? (
        <GroupBuyLines
          layout={layout}
          density={density}
          isNarrow={isNarrow}
          members={members}
          displayRows={displayRows}
          tableRows={tableRows}
          cardsSort={cardsSort}
          onCardsSort={onCardsSort}
          renderAltRow={showAltArts ? (line) => readOnlyAltRow(line, members) : undefined}
          altsOf={wantedAlts}
        />
      ) : (
        <p className="muted">No cards in this group buy.</p>
      )}
      </CardWorkspace>
    </>
  );
}
