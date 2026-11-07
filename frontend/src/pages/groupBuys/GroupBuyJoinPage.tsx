import { BuildTag } from "@optcg/ui/appShell";
import { CardLayoutToggle, useCardLayout } from "../../CardLayout";
import { AuthLoadingSkeleton, GroupBuyDetailSkeleton } from "../../Skeleton";
import { ThemeToggle } from "../../ThemeToggle";
import { Topbar } from "../../Topbar";
import { api, GroupBuyDetail } from "../../api";
import { useMe } from "../../auth/useMe";
import { buildFilterSummary, CardSearchInput, CollapsibleFilters, SortMenu, useCardSorts, type SortKey } from "../../cardListControls";
import { rememberLoginNext } from "../../loginNext";
import { useNarrowLayout } from "../../useNarrowLayout";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { GroupBuyLines } from "./GroupBuyLines";
import { GroupBuyMembersList, GroupBuyOrderDetails, GroupBuySettlement, hasOrderPanel } from "./GroupBuyPanels";
import { readOnlyAltRow } from "./memberParts";
import { useGroupBuyLines } from "./useGroupBuyLines";
import { COLSORT_GB_PUBLIC_KEY } from "../../storage/keys";
import { qk } from "../../queryKeys";

/** /group-buy/view/:token is the older read-only link; it now shows the invite page (#880). */
export function PublicGroupBuyPage() {
  const { token = "" } = useParams();
  return <Navigate to={`/group-buy/join/${encodeURIComponent(token)}`} replace />;
}

/** Invite link: a read-only view of the whole group buy, with Join / Sign in on top (#880). */
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
        <BuildTag />
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
                <span className={`group-buy-status status-${preview.status}`}>{preview.status}</span>
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
  const isNarrow = useNarrowLayout();
  const [layout, setLayout] = useCardLayout();
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

      <div className="list-toolbar">
        <div className="list-toolbar-row">
          <CardSearchInput value={search} onChange={setSearch} />
          <CardLayoutToggle layout={layout} onChange={setLayout} />
        </div>
        <CollapsibleFilters summary={buildFilterSummary({ sorts })}>
          <div className="filters">
            <SortMenu sorts={sorts} onChange={setSorts} onlyNeed unavailableKeys={unavailableSorts} columnSortKey={COLSORT_GB_PUBLIC_KEY} />
          </div>
        </CollapsibleFilters>
      </div>

      {lines.length ? (
        <GroupBuyLines
          layout={layout}
          isNarrow={isNarrow}
          members={members}
          displayRows={displayRows}
          tableRows={tableRows}
          cardsSort={cardsSort}
          onCardsSort={onCardsSort}
          renderAltRow={(line) => readOnlyAltRow(line, members)}
        />
      ) : (
        <p className="muted">No cards in this group buy.</p>
      )}
    </>
  );
}
