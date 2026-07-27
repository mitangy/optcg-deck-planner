import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  GroupBuyDetail,
  GroupBuyLine,
  GroupBuyMember,
  GroupBuyMemberQty,
  GroupBuyOrderUpdate,
  money,
} from "./api";
import { CardLayoutToggle, useCardLayout } from "./CardLayout";
import {
  buildFilterSummary,
  CardSearchInput,
  CollapsibleFilters,
  compareCardOrder,
  matchesCardSearch,
  SortMenu,
  useCardSorts,
  useShowAltArts,
  type SortKey,
} from "./cardListControls";
import { CardThumb, MobileCardMedia } from "./CardThumb";
import { AltArtsRow, MarketPrice } from "./MarketPrice";
import { blankMassEntryUrl, buildMassEntryExport } from "./tcgplayerMassEntry";
import {
  AuthLoadingSkeleton,
  GroupBuyDetailSkeleton,
  GroupBuysListSkeleton,
} from "./Skeleton";

const NEXT_KEY = "optcg_login_next";

type ShippingSplit = "equal" | "by_cost" | "by_copies";

const SHIPPING_SPLIT_LABELS: Record<ShippingSplit, string> = {
  equal: "Equal among buyers",
  by_cost: "By card cost",
  by_copies: "By copies",
};

/** Same-origin relative paths only — reject protocol-relative //evil.example. */
export function isSafeLoginNext(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("\\") || path.includes("://")) return false;
  try {
    const decoded = decodeURIComponent(path);
    if (decoded.startsWith("//") || decoded.includes("://") || decoded.includes("\\")) {
      return false;
    }
  } catch {
    return false;
  }
  return true;
}

export function rememberLoginNext(path: string) {
  if (!isSafeLoginNext(path)) return;
  try {
    sessionStorage.setItem(NEXT_KEY, path);
  } catch {
    /* ignore */
  }
}

export function consumeLoginNext(): string | null {
  try {
    const next = sessionStorage.getItem(NEXT_KEY);
    if (next) sessionStorage.removeItem(NEXT_KEY);
    return next && isSafeLoginNext(next) ? next : null;
  } catch {
    return null;
  }
}

/** Stable palette for group-buy members — fits the cream/teal product chrome. */
const MEMBER_COLORS = [
  "#0f6a6a",
  "#c65911",
  "#2f6b3a",
  "#355c7d",
  "#9b2c2c",
  "#6b5344",
  "#8a5a12",
  "#3d5a80",
];

/** Matches the shopping mobile breakpoint in styles.css (`max-width: 800px`). */
function useNarrowLayout() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 800px)").matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 800px)");
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

function memberColorIndex(userId: number, members: { user_id: number }[]): number {
  const idx = members.findIndex((m) => m.user_id === userId);
  return (idx >= 0 ? idx : userId) % MEMBER_COLORS.length;
}

function memberColor(userId: number, members: { user_id: number }[]): string {
  return MEMBER_COLORS[memberColorIndex(userId, members)];
}

function MemberSwatch({
  userId,
  members,
  title,
}: {
  userId: number;
  members: { user_id: number }[];
  title?: string;
}) {
  return (
    <span
      className="group-buy-swatch"
      style={{ background: memberColor(userId, members) }}
      title={title}
      aria-hidden={title ? undefined : true}
    />
  );
}

function MemberBreakdown({
  line,
  members,
}: {
  line: GroupBuyLine;
  members: GroupBuyMember[];
}) {
  if (!line.members.length) return <span className="muted">—</span>;
  return (
    <span className="group-buy-who">
      {line.members.map((m: GroupBuyMemberQty) => (
        <span key={m.user_id} className="group-buy-who-chip">
          <MemberSwatch userId={m.user_id} members={members} title={m.display_name} />
          <span>
            {m.display_name} ×{m.qty}
            {m.is_custom ? "*" : ""}
          </span>
        </span>
      ))}
    </span>
  );
}

function MemberColorRail({
  line,
  members,
}: {
  line: GroupBuyLine;
  members: GroupBuyMember[];
}) {
  const active = line.members.filter((m) => m.qty > 0);
  if (!active.length) return null;
  return (
    <span className="group-buy-color-rail" aria-hidden="true">
      {active.map((m) => (
        <span key={m.user_id} style={{ background: memberColor(m.user_id, members) }} />
      ))}
    </span>
  );
}

function cardShellClass(
  base: string,
  line: GroupBuyLine,
  members: GroupBuyMember[],
  excluded: boolean,
): string {
  const active = line.members.filter((m) => m.qty > 0);
  const sole =
    active.length === 1 ? ` gb-user-${memberColorIndex(active[0].user_id, members)}` : "";
  return `${base}${excluded ? " excluded" : ""}${sole}`;
}

/** Viewer opted out of this card (custom qty 0 / Exclude). */
function isLineExcluded(line: GroupBuyLine): boolean {
  return Boolean(line.my_excluded ?? (line.my_qty === 0 && line.my_is_custom));
}

/** Earliest member (member-list order) who still wants copies of this card. */
function primaryWantingMember(
  line: GroupBuyLine,
  members: GroupBuyMember[],
): GroupBuyMemberQty | null {
  const active = line.members.filter((m) => m.qty > 0);
  if (!active.length) return null;
  const order = new Map(members.map((m, i) => [m.user_id, i]));
  return [...active].sort(
    (a, b) => (order.get(a.user_id) ?? 999) - (order.get(b.user_id) ?? 999),
  )[0];
}

function userSortKeyForLine(line: GroupBuyLine, members: GroupBuyMember[]): string {
  const primary = primaryWantingMember(line, members);
  if (!primary) return "zzzz";
  const idx = members.findIndex((m) => m.user_id === primary.user_id);
  const rank = String(idx >= 0 ? idx : 999).padStart(3, "0");
  return `${rank}-${primary.display_name.toLowerCase()}`;
}

type GroupBuyDisplayRow =
  | { kind: "header"; key: string; userId: number; displayName: string }
  | { kind: "line"; key: string; line: GroupBuyLine };

function buildGroupBuyDisplayRows(
  lines: GroupBuyLine[],
  members: GroupBuyMember[],
  groupingByUser: boolean,
): GroupBuyDisplayRow[] {
  if (!groupingByUser) {
    return lines.map((line) => ({ kind: "line" as const, key: line.card_id, line }));
  }
  const rows: GroupBuyDisplayRow[] = [];
  let lastUserId: number | undefined;
  for (const line of lines) {
    const primary = primaryWantingMember(line, members);
    const userId = primary?.user_id ?? -1;
    if (userId !== lastUserId) {
      rows.push({
        kind: "header",
        key: `user-${userId}`,
        userId,
        displayName: primary?.display_name ?? "No buyers",
      });
      lastUserId = userId;
    }
    rows.push({ kind: "line", key: line.card_id, line });
  }
  return rows;
}

function UserGroupHeading({
  userId,
  displayName,
  members,
}: {
  userId: number;
  displayName: string;
  members: GroupBuyMember[];
}) {
  return (
    <div className="group-buy-user-heading">
      {userId >= 0 ? <MemberSwatch userId={userId} members={members} title={displayName} /> : null}
      <span>{displayName}</span>
    </div>
  );
}

function LinePrintingSelect({
  line,
  disabled,
  onChange,
}: {
  line: GroupBuyLine;
  disabled: boolean;
  onChange: (productId: number) => void;
}) {
  const preferredId = line.preferred_product_id ?? null;
  const alts = line.alt_arts ?? [];
  const currentId = line.product_id ?? preferredId;
  if (!preferredId && alts.length === 0) {
    return <span className="muted">—</span>;
  }

  function altOptionLabel(name: string, price: number | null | undefined): string {
    // Keep labels short so the native select caret does not cover the text.
    const cleaned = name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
    const short = cleaned.length > 16 ? `${cleaned.slice(0, 14)}…` : cleaned;
    return `Alt · ${short} · ${money(price)}`;
  }

  return (
    <select
      className="group-buy-printing"
      value={currentId ?? ""}
      disabled={disabled || (preferredId == null && alts.length === 0)}
      aria-label={`Checkout printing for ${line.card_id}`}
      title="Default checkout printing when nobody set alt-art wants (mass entry splits AA wants first)"
      onChange={(e) => {
        const productId = Number(e.target.value);
        if (!productId) return;
        onChange(productId);
      }}
    >
      {preferredId != null ? (
        <option value={preferredId}>Preferred · {money(line.preferred_market_price ?? null)}</option>
      ) : (
        <option value="">No preferred product</option>
      )}
      {alts
        .filter((alt) => alt.product_id !== preferredId)
        .map((alt) => (
          <option key={alt.product_id} value={alt.product_id} title={alt.name}>
            {altOptionLabel(alt.name, alt.market_price)}
          </option>
        ))}
    </select>
  );
}

function BuyQtyEditor({
  cardId,
  qty,
  suggestedQty,
  isCustom,
  excluded,
  disabled,
  onSave,
  onReset,
  onExclude,
}: {
  cardId: string;
  qty: number;
  suggestedQty: number;
  isCustom: boolean;
  excluded: boolean;
  disabled: boolean;
  onSave: (qty: number) => void;
  onReset: () => void;
  onExclude: () => void;
}) {
  const [draft, setDraft] = useState(String(qty));

  useEffect(() => {
    setDraft(String(qty));
  }, [qty, cardId]);

  function commit() {
    const n = Math.max(0, Math.min(999, Math.floor(Number(draft))));
    if (!Number.isFinite(n)) {
      setDraft(String(qty));
      return;
    }
    setDraft(String(n));
    if (n !== qty) onSave(n);
  }

  return (
    <div className={`group-buy-qty${excluded ? " excluded" : ""}`}>
      <div className="group-buy-qty-controls">
        <button
          type="button"
          className="owned-btn"
          aria-label={`Decrease buy qty for ${cardId}`}
          disabled={disabled || qty <= 0}
          onClick={() => onSave(Math.max(0, qty - 1))}
        >
          −
        </button>
        <input
          className="group-buy-qty-input"
          inputMode="numeric"
          aria-label={`Buy quantity for ${cardId}`}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          className="owned-btn"
          aria-label={`Increase buy qty for ${cardId}`}
          disabled={disabled || qty >= 999}
          onClick={() => onSave(Math.min(999, qty + 1))}
        >
          +
        </button>
      </div>
      <div className="group-buy-qty-meta muted">
        {excluded ? (
          <span>Excluded from group buy</span>
        ) : isCustom ? (
          <>
            <span>Shopping suggests {suggestedQty}</span>
            <button type="button" className="ghost" disabled={disabled} onClick={onReset}>
              Use suggested
            </button>
          </>
        ) : (
          <span>From shopping</span>
        )}
      </div>
      {excluded ? (
        <button
          type="button"
          className="btn secondary group-buy-exclude-btn"
          disabled={disabled}
          onClick={onReset}
        >
          Include again
        </button>
      ) : (
        <button
          type="button"
          className="btn secondary group-buy-exclude-btn"
          disabled={disabled}
          onClick={onExclude}
        >
          Exclude from group buy
        </button>
      )}
    </div>
  );
}

export function GroupBuysPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listQ = useQuery({ queryKey: ["group-buys"], queryFn: api.groupBuys });
  const [title, setTitle] = useState("Group buy");
  const [msg, setMsg] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.createGroupBuy({ title: title.trim() || "Group buy" }),
    onSuccess: async (detail) => {
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
      navigate(`/group-buys/${detail.id}`);
    },
    onError: (e: Error) => setMsg(e.message),
  });

  if (listQ.isLoading) return <GroupBuysListSkeleton />;
  if (listQ.error) return <p className="error">{(listQ.error as Error).message}</p>;

  const rows = listQ.data ?? [];

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Group buys</h1>
          <p className="muted">
            Combine friends’ shopping lists into one bulk order to save on shipping.
          </p>
        </div>
      </div>

      <form
        className="group-buy-create"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="Friday night group buy"
          />
        </label>
        <button type="submit" className="btn primary" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Start group buy"}
        </button>
      </form>
      {msg && <p className="error">{msg}</p>}

      {rows.length === 0 ? (
        <p className="muted">No group buys yet. Start one and share the invite link.</p>
      ) : (
        <ul className="group-buy-list">
          {rows.map((g) => (
            <li key={g.id}>
              <Link to={`/group-buys/${g.id}`} className="group-buy-card">
                <div className="group-buy-card-top">
                  <strong>{g.title}</strong>
                  <span className={`group-buy-status status-${g.status}`}>{g.status}</span>
                </div>
                <p className="muted">
                  Host {g.host_name} · {g.member_count} member{g.member_count === 1 ? "" : "s"} ·{" "}
                  {g.cards_still_needed} copies · {money(g.remaining_market)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function GroupBuyDetailPage() {
  const { id } = useParams();
  const groupId = Number(id);
  const qc = useQueryClient();
  const isNarrow = useNarrowLayout();
  const [layout, setLayout] = useCardLayout();
  const [showExcluded, setShowExcluded] = useState(false);
  const unavailableSorts = useMemo(() => ["deck"] as SortKey[], []);
  // Always show still-needed cards; keep still_need sort disabled like shopping's "Still need only".
  const { sorts, setSorts, effectiveSorts } = useCardSorts(true, unavailableSorts);
  const [showAltArts, setShowAltArts] = useShowAltArts();
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [altWantBusyKey, setAltWantBusyKey] = useState<string | null>(null);
  const [orderId, setOrderId] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [shippingCost, setShippingCost] = useState("0");
  const [shippingSplit, setShippingSplit] = useState<ShippingSplit>("equal");
  const sortingByUser = effectiveSorts.includes("user");
  /** Section headers only when User is the primary sort (otherwise groups would fragment). */
  const groupingByUser = effectiveSorts[0] === "user";

  const detailQ = useQuery({
    queryKey: ["group-buy", groupId],
    queryFn: () => api.groupBuy(groupId),
    enabled: Number.isFinite(groupId) && groupId > 0,
  });
  const decksQ = useQuery({ queryKey: ["decks"], queryFn: api.decks });
  const meQ = useQuery({ queryKey: ["me"], queryFn: api.me });

  const detail = detailQ.data;
  const members = detail?.members ?? [];

  const lines = useMemo(() => {
    let list = detail?.lines ?? [];
    // Always still-needed only. Excluded (my qty 0) lines with no remaining group total
    // stay hidden unless "Show excluded" is on. Excluded lines others still need stay visible.
    if (!showExcluded) {
      list = list.filter((l) => !isLineExcluded(l) || l.total_qty > 0);
    }
    list = list.filter((l) => l.total_qty > 0 || (showExcluded && isLineExcluded(l)));
    if (search.trim()) {
      list = list.filter((l) =>
        matchesCardSearch(
          {
            card_id: l.card_id,
            name: l.name,
            color: l.color,
            card_type: l.card_type,
            rarity: l.rarity,
            used_in: l.members.map((m) => m.display_name),
          },
          search,
        ),
      );
    }
    const memberList = detail?.members ?? [];
    return [...list].sort((a, b) =>
      compareCardOrder(
        {
          card_id: a.card_id,
          color: a.color || "",
          still_need: a.total_qty,
          market_price: a.market_price,
          user_sort_key: userSortKeyForLine(a, memberList),
        },
        {
          card_id: b.card_id,
          color: b.color || "",
          still_need: b.total_qty,
          market_price: b.market_price,
          user_sort_key: userSortKeyForLine(b, memberList),
        },
        effectiveSorts,
      ),
    );
  }, [detail, showExcluded, effectiveSorts, search]);

  const displayRows = useMemo(
    () => buildGroupBuyDisplayRows(lines, members, groupingByUser),
    [lines, members, groupingByUser],
  );

  const decks = decksQ.data ?? [];
  const myContribution = useMemo(() => {
    const me = meQ.data;
    if (!detail || !me) return null;
    return detail.members.find((m) => m.user_id === me.id) ?? null;
  }, [detail, meQ.data]);
  const activeDeckIds = myContribution?.deck_ids;
  const allSelected = !activeDeckIds || (decks.length > 0 && activeDeckIds.length === decks.length);
  const selectedDeckCount = allSelected ? decks.length : (activeDeckIds?.length ?? decks.length);

  const filterSummary = useMemo(() => {
    const extra: string[] = [];
    if (showExcluded) extra.push("Excluded");
    if (decks.length > 0 && !allSelected) {
      extra.push(`${selectedDeckCount}/${decks.length} decks`);
    }
    return buildFilterSummary({
      sorts: effectiveSorts,
      showAltArts,
      layout,
      extra: extra.length ? extra : undefined,
    });
  }, [
    effectiveSorts,
    showAltArts,
    layout,
    showExcluded,
    decks.length,
    allSelected,
    selectedDeckCount,
  ]);

  useEffect(() => {
    if (!detail) return;
    setOrderId(detail.external_order_id || "");
    setOrderNotes(detail.order_notes || "");
    setShippingCost(String(detail.shipping_cost ?? 0));
    const split = detail.shipping_split;
    setShippingSplit(
      split === "by_cost" || split === "by_copies" || split === "equal" ? split : "equal",
    );
  }, [detail]);

  const lock = useMutation({
    mutationFn: () => api.lockGroupBuy(groupId),
    onSuccess: async (d) => {
      qc.setQueryData(["group-buy", groupId], d);
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
      setMsg("Group buy locked — quantities frozen for checkout.");
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const unlock = useMutation({
    mutationFn: () => api.unlockGroupBuy(groupId),
    onSuccess: async (d) => {
      qc.setQueryData(["group-buy", groupId], d);
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
      setMsg("Group buy unlocked — live shopping contributions again.");
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const markOrdered = useMutation({
    mutationFn: (body: GroupBuyOrderUpdate) => api.markGroupBuyOrdered(groupId, body),
    onSuccess: async (d) => {
      qc.setQueryData(["group-buy", groupId], d);
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
      setMsg(
        "Order placed — settle shipping below. When cards are in hand, use Mark purchased to update Owned.",
      );
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const saveOrder = useMutation({
    mutationFn: (body: GroupBuyOrderUpdate) => api.updateGroupBuyOrder(groupId, body),
    onSuccess: async (d) => {
      qc.setQueryData(["group-buy", groupId], d);
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
      setMsg("Order details saved.");
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const complete = useMutation({
    mutationFn: () => api.completeGroupBuy(groupId),
    onSuccess: async (d) => {
      qc.setQueryData(["group-buy", groupId], d);
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
      await qc.invalidateQueries({ queryKey: ["shopping"] });
      await qc.invalidateQueries({ queryKey: ["deck"] });
      setMsg(
        "Marked purchased — each member’s buy quantities were added to Owned and removed from shopping.",
      );
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const contribution = useMutation({
    mutationFn: (deckIds: number[] | null) => api.updateGroupBuyContribution(groupId, deckIds),
    onSuccess: (d) => {
      qc.setQueryData(["group-buy", groupId], d);
      setMsg("Updated your contribution decks.");
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const setProduct = useMutation({
    mutationFn: ({ cardId, productId }: { cardId: string; productId: number }) =>
      api.setGroupBuyLineProduct(groupId, cardId, productId),
    onSuccess: (d) => qc.setQueryData(["group-buy", groupId], d),
    onError: (e: Error) => setMsg(e.message),
  });

  const setQty = useMutation({
    mutationFn: ({ cardId, qty }: { cardId: string; qty: number }) =>
      api.setGroupBuyQty(groupId, cardId, qty),
    onSuccess: async (d) => {
      qc.setQueryData(["group-buy", groupId], d);
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const clearQty = useMutation({
    mutationFn: (cardId: string) => api.clearGroupBuyQty(groupId, cardId),
    onSuccess: async (d) => {
      qc.setQueryData(["group-buy", groupId], d);
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const syncQty = useMutation({
    mutationFn: () => api.syncGroupBuyQuantities(groupId),
    onSuccess: async (d) => {
      qc.setQueryData(["group-buy", groupId], d);
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
      setMsg("Your buy quantities reset to shopping still-need.");
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const setAltWant = useMutation({
    mutationFn: ({
      cardId,
      productId,
      qty,
    }: {
      cardId: string;
      productId: number;
      qty: number;
    }) =>
      api.setCardPrinting(
        cardId,
        productId,
        qty,
        activeDeckIds && activeDeckIds.length ? activeDeckIds : undefined,
      ),
    onMutate: async ({ cardId, productId, qty }) => {
      setAltWantBusyKey(`${cardId}:${productId}`);
      await qc.cancelQueries({ queryKey: ["group-buy", groupId] });
      const prev = qc.getQueryData<GroupBuyDetail>(["group-buy", groupId]);
      if (prev) {
        qc.setQueryData<GroupBuyDetail>(["group-buy", groupId], {
          ...prev,
          lines: prev.lines.map((line) =>
            line.card_id === cardId
              ? {
                  ...line,
                  alt_arts: line.alt_arts.map((a) =>
                    a.product_id === productId ? { ...a, wanted: qty } : a,
                  ),
                }
              : line,
          ),
        });
      }
      return { prev };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["group-buy", groupId], ctx.prev);
      setMsg(e.message);
    },
    onSuccess: async (res, vars) => {
      qc.setQueryData<GroupBuyDetail>(["group-buy", groupId], (old) => {
        if (!old) return old;
        return {
          ...old,
          lines: old.lines.map((line) =>
            line.card_id === vars.cardId
              ? {
                  ...line,
                  alt_arts: line.alt_arts.map((a) =>
                    a.product_id === vars.productId ? { ...a, wanted: res.qty } : a,
                  ),
                }
              : line,
          ),
        };
      });
      await qc.invalidateQueries({ queryKey: ["group-buy", groupId] });
      await qc.invalidateQueries({ queryKey: ["shopping"] });
      await qc.invalidateQueries({ queryKey: ["deck"] });
      await qc.invalidateQueries({ queryKey: ["decks"] });
    },
    onSettled: () => setAltWantBusyKey(null),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteGroupBuy(groupId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
      window.location.href = "/group-buys";
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const qtyBusy = setQty.isPending || clearQty.isPending || syncQty.isPending;

  const groupBuyAltRow = (line: GroupBuyLine) => {
    const alts = line.alt_arts ?? [];
    const canEditWants = detail?.status === "open" && (line.my_need ?? 0) > 0;
    return (
      <AltArtsRow
        alts={alts}
        cardNeeded={line.my_need ?? 0}
        editable={canEditWants}
        onWantChange={
          canEditWants
            ? (productId, qty) => setAltWant.mutate({ cardId: line.card_id, productId, qty })
            : undefined
        }
        busyProductId={
          altWantBusyKey?.startsWith(`${line.card_id}:`)
            ? Number(altWantBusyKey.slice(line.card_id.length + 1))
            : null
        }
      />
    );
  };

  async function copyInvite(path: string) {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setInviteMsg("Invite link copied");
    } catch {
      setInviteMsg(url);
    }
  }

  async function exportMassEntry(d: GroupBuyDetail) {
    try {
      // Backend allocates each member's AA wants; local fallback is last-resort
      // only (viewer alt_arts must not be applied against total_qty).
      const exported = await api.exportGroupBuyTcgplayer(d.id);
      const local = buildMassEntryExport(
        d.lines.map((line) => ({
          card_id: line.card_id,
          name: line.name,
          still_need: line.total_qty,
          product_id: line.preferred_product_id ?? line.product_id,
        })),
      );
      const paste = exported.paste_text || local.pasteText;
      const url = exported.url || local.url;
      try {
        await navigator.clipboard.writeText(paste);
      } catch {
        setMsg(paste);
        return;
      }
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        setMsg("Opened Mass Entry (list copied). Add to Cart → Optimize Cart.");
      } else {
        window.open(blankMassEntryUrl(), "_blank", "noopener,noreferrer");
        setMsg("List copied — paste into Mass Entry, then Add to Cart → Optimize Cart.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  if (!Number.isFinite(groupId) || groupId <= 0) {
    return <p className="error">Invalid group buy.</p>;
  }
  if (detailQ.isLoading) return <GroupBuyDetailSkeleton />;
  if (detailQ.error) return <p className="error">{(detailQ.error as Error).message}</p>;
  if (!detail) return <p className="error">Group buy not found.</p>;

  const canEditPrintings = detail.is_host && (detail.status === "open" || detail.status === "locked");
  const showOrderPanel = detail.status === "locked" || detail.status === "ordered" || detail.status === "completed";
  const orderBusy = markOrdered.isPending || saveOrder.isPending || complete.isPending;
  const tableColSpan =
    5 +
    (detail.status === "open" ? 1 : 0) +
    (detail.is_host ? 1 : 0) +
    (showAltArts ? 1 : 0);

  function setContributionDecks(next: number[] | null) {
    if (next && next.length === decks.length) contribution.mutate(null);
    else contribution.mutate(next);
  }

  function toggleContributionDeck(deckId: number) {
    const current = activeDeckIds ?? decks.map((d) => d.id);
    let next: number[];
    if (current.includes(deckId)) {
      next = current.filter((x) => x !== deckId);
      // Keep at least one deck — empty dumps to "all" on the backend.
      if (!next.length) next = current;
    } else {
      next = [...current, deckId];
    }
    setContributionDecks(next);
  }

  function orderBodyFromForm(): GroupBuyOrderUpdate {
    const parsed = Number(shippingCost);
    return {
      external_order_id: orderId.trim(),
      order_notes: orderNotes.trim(),
      shipping_cost: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
      shipping_split: shippingSplit,
    };
  }

  return (
    <section className="group-buy-detail">
      <div className="page-head">
        <div>
          <p className="muted">
            <Link to="/group-buys">Group buys</Link>
          </p>
          <h1>{detail.title}</h1>
          <p className="muted">
            <span className={`group-buy-status status-${detail.status}`}>{detail.status}</span>
            {" · "}
            Host {detail.host_name} · {detail.member_count} members · {detail.unique_cards} cards ·{" "}
            {detail.cards_still_needed} copies · {money(detail.remaining_market)}
          </p>
        </div>
      </div>

      <div className="group-buy-toolbar">
        <button type="button" className="btn secondary" onClick={() => void copyInvite(detail.invite_path)}>
          Copy invite link
        </button>
        {detail.status !== "completed" && (
          <button
            type="button"
            className="btn secondary"
            onClick={() => void exportMassEntry(detail)}
          >
            Open Mass Entry
          </button>
        )}
        {detail.is_host && detail.status === "open" && (
          <button
            type="button"
            className="btn secondary"
            disabled={lock.isPending || orderBusy}
            onClick={() => lock.mutate()}
          >
            {lock.isPending ? "Locking…" : "Lock for checkout"}
          </button>
        )}
        {detail.is_host && detail.status === "locked" && (
          <button
            type="button"
            className="btn secondary"
            disabled={unlock.isPending || orderBusy}
            onClick={() => unlock.mutate()}
          >
            {unlock.isPending ? "Unlocking…" : "Unlock"}
          </button>
        )}
        {detail.is_host && detail.status === "locked" && (
          <button
            type="button"
            className="btn primary"
            disabled={orderBusy}
            onClick={() => {
              const ok = window.confirm(
                "Mark this group buy as ordered?\n\n" +
                  "Use this after placing the bulk TCGPlayer order. Quantities stay frozen; you can still edit shipping and what each person owes. Owned counts are not updated yet.",
              );
              if (ok) markOrdered.mutate(orderBodyFromForm());
            }}
          >
            {markOrdered.isPending ? "Saving…" : "Mark ordered"}
          </button>
        )}
        {detail.is_host && detail.status === "ordered" && (
          <button
            type="button"
            className="btn primary"
            disabled={complete.isPending}
            onClick={() => {
              const ok = window.confirm(
                "Mark this group buy as purchased?\n\n" +
                  "Use this when the cards are received. Each member’s buy quantities are added to Owned and cleared from shopping.",
              );
              if (ok) complete.mutate();
            }}
          >
            {complete.isPending ? "Finishing…" : "Mark purchased"}
          </button>
        )}
        {detail.is_host && (
          <button
            type="button"
            className="ghost danger"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm("Delete this group buy for everyone?")) remove.mutate();
            }}
          >
            Delete
          </button>
        )}
      </div>
      {(inviteMsg || msg) && (
        <p className="buy-bar-msg buy-bar-msg-solo" role="status">
          {inviteMsg || msg}
        </p>
      )}

      <div className="group-buy-members">
        <h2>Members</h2>
        <ul>
          {members.map((m) => (
            <li key={m.user_id}>
              <MemberSwatch userId={m.user_id} members={members} title={m.display_name} />
              <strong>
                {m.display_name}
                {m.role === "host" ? " (host)" : ""}
              </strong>
              <span className="muted">
                {" "}
                · {m.cards_still_needed} copies · cards {money(m.card_cost ?? m.remaining_market)}
                {showOrderPanel ? (
                  <>
                    {" "}
                    · ship {money(m.shipping_share ?? 0)} · owes {money(m.total_owed ?? m.remaining_market)}
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {showOrderPanel && (
        <div className="group-buy-settlement">
          <h2>Order & settlement</h2>
          <p className="muted">
            {detail.status === "locked"
              ? "After checkout, mark ordered. Then settle shipping. Mark purchased only when cards are in hand."
              : detail.status === "ordered"
                ? "Order placed — settle costs below. Mark purchased when cards are received to update Owned."
                : "Purchased — Owned updated. Settlement below is for your records."}{" "}
            Cards {money(detail.cards_subtotal)} + shipping {money(detail.shipping_cost)} ={" "}
            <strong>{money(detail.grand_total)}</strong>
            {detail.ordered_at ? ` · ordered ${new Date(detail.ordered_at).toLocaleString()}` : ""}
          </p>
          {detail.is_host && detail.status !== "completed" ? (
            <form
              className="group-buy-order-form"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                saveOrder.mutate(orderBodyFromForm());
              }}
            >
              <label>
                Order / receipt id
                <input
                  type="text"
                  value={orderId}
                  maxLength={200}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label>
                Shipping cost
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                />
              </label>
              <label>
                Split shipping
                <select
                  value={shippingSplit}
                  onChange={(e) => setShippingSplit(e.target.value as ShippingSplit)}
                >
                  {(Object.keys(SHIPPING_SPLIT_LABELS) as ShippingSplit[]).map((key) => (
                    <option key={key} value={key}>
                      {SHIPPING_SPLIT_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="group-buy-order-notes">
                Notes
                <textarea
                  value={orderNotes}
                  maxLength={4000}
                  rows={3}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Who paid, tracking, Venmo handles…"
                />
              </label>
              <button type="submit" className="btn secondary" disabled={orderBusy}>
                {saveOrder.isPending ? "Saving…" : "Save order details"}
              </button>
            </form>
          ) : (
            <div className="group-buy-order-readonly">
              {detail.external_order_id ? (
                <p>
                  Order id: <strong>{detail.external_order_id}</strong>
                </p>
              ) : null}
              <p className="muted">
                Shipping split:{" "}
                {SHIPPING_SPLIT_LABELS[
                  detail.shipping_split === "by_cost" || detail.shipping_split === "by_copies"
                    ? detail.shipping_split
                    : "equal"
                ]}
              </p>
              {detail.order_notes ? <p>{detail.order_notes}</p> : null}
            </div>
          )}
        <div className="table-wrap desktop-table">
          <table className="data-table group-buy-owe-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Cards</th>
                  <th>Shipping</th>
                  <th>Owes</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id}>
                    <td>
                      <span className="group-buy-member-cell">
                        <MemberSwatch userId={m.user_id} members={members} title={m.display_name} />
                        {m.display_name}
                        {m.role === "host" ? " (host)" : ""}
                      </span>
                    </td>
                    <td>{money(m.card_cost ?? 0)}</td>
                    <td>{money(m.shipping_share ?? 0)}</td>
                    <td>
                      <strong>{money(m.total_owed ?? 0)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detail.status === "open" && myContribution && (
        <div className="group-buy-contribution">
          <h2>Your contribution</h2>
          <p className="muted">
            Defaults follow your shopping still-need for the decks selected under Filters. Edit{" "}
            <strong>Your buy</strong> on any line before the host locks.
          </p>
          <div className="group-buy-contribution-actions">
            <button
              type="button"
              className="btn secondary"
              disabled={syncQty.isPending || detail.status !== "open"}
              onClick={() => syncQty.mutate()}
            >
              {syncQty.isPending ? "Resetting…" : "Reset my qtys to shopping"}
            </button>
          </div>
        </div>
      )}

      <h2 className="group-buy-merged-heading">Merged list</h2>
      {detail.lines.length === 0 ? (
        <p className="muted">Nothing to buy yet — members need cards on their shopping lists.</p>
      ) : (
        <>
          <div className="list-toolbar group-buy-merged-toolbar">
            <div className="list-toolbar-row">
              <CardSearchInput value={search} onChange={setSearch} />
              <CardLayoutToggle layout={layout} onChange={setLayout} />
            </div>
            <CollapsibleFilters summary={filterSummary}>
              <div className="filters">
                <SortMenu
                  sorts={sorts}
                  onChange={setSorts}
                  onlyNeed
                  unavailableKeys={unavailableSorts}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={showAltArts}
                    onChange={(e) => setShowAltArts(e.target.checked)}
                  />
                  Show alt arts
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={showExcluded}
                    onChange={(e) => setShowExcluded(e.target.checked)}
                  />
                  Show excluded
                </label>
              </div>
              {sortingByUser ? (
                <p className="sort-deck-note muted">
                  User sort groups cards by who wants them (member list order). Cards wanted by
                  multiple people stay under their earliest member.
                </p>
              ) : null}
              {detail.status === "open" && myContribution && decks.length > 0 ? (
                <div className="deck-filter">
                  <div className="deck-filter-head">
                    <span>Include decks</span>
                    <button
                      type="button"
                      className="ghost"
                      disabled={contribution.isPending || allSelected}
                      onClick={() => setContributionDecks(null)}
                    >
                      Select all
                    </button>
                  </div>
                  <div className="deck-filter-list">
                    {decks.map((d) => {
                      const checked = allSelected || (activeDeckIds?.includes(d.id) ?? false);
                      return (
                        <label key={d.id} className="deck-chip">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={contribution.isPending}
                            onChange={() => toggleContributionDeck(d.id)}
                          />
                          {d.name}
                        </label>
                      );
                    })}
                  </div>
                  <p className="muted group-buy-deck-filter-note">
                    Unselected decks are left out of your group-buy contribution.
                  </p>
                </div>
              ) : null}
            </CollapsibleFilters>
          </div>

          {search.trim() ? (
            <p className="search-result-note muted">
              Showing {lines.length} match{lines.length === 1 ? "" : "es"} for “{search.trim()}”
            </p>
          ) : null}

          {lines.length === 0 ? (
            <p className="muted">No cards match the current search or filters.</p>
          ) : layout === "grid" ? (
            <div className="card-grid">
              {displayRows.map((row) => {
                if (row.kind === "header") {
                  return (
                    <div key={row.key} className="group-buy-user-section">
                      <UserGroupHeading
                        userId={row.userId}
                        displayName={row.displayName}
                        members={members}
                      />
                    </div>
                  );
                }
                const line = row.line;
                const excluded = isLineExcluded(line);
                return (
                  <article
                    key={row.key}
                    className={cardShellClass("grid-card need", line, members, excluded)}
                  >
                    <MemberColorRail line={line} members={members} />
                    <div className="grid-card-media">
                      <CardThumb src={line.image_url || undefined} alt={line.name} />
                    </div>
                    <div className="grid-card-body">
                      <div className="card-id">{line.card_id}</div>
                      <div className="grid-card-name">{line.name}</div>
                      <div className="grid-card-meta muted">
                        {[excluded ? "Excluded" : "", line.color, `Total ${line.total_qty}`, money(line.remaining_cost)]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      <div className="group-buy-who-row">
                        <MemberBreakdown line={line} members={members} />
                      </div>
                      <div className="grid-card-price">
                        <MarketPrice price={line.market_price} productId={line.product_id} />
                      </div>
                      {detail.status === "open" ? (
                        <div className="grid-card-owned">
                          <span>Your buy</span>
                          <BuyQtyEditor
                            cardId={line.card_id}
                            qty={line.my_qty}
                            suggestedQty={line.my_suggested_qty}
                            isCustom={line.my_is_custom}
                            excluded={excluded}
                            disabled={qtyBusy}
                            onSave={(qty) => setQty.mutate({ cardId: line.card_id, qty })}
                            onReset={() => clearQty.mutate(line.card_id)}
                            onExclude={() => setQty.mutate({ cardId: line.card_id, qty: 0 })}
                          />
                        </div>
                      ) : null}
                      {detail.is_host ? (
                        <div className="grid-card-owned">
                          <span>Printing</span>
                          <LinePrintingSelect
                            line={line}
                            disabled={!canEditPrintings || setProduct.isPending}
                            onChange={(productId) =>
                              setProduct.mutate({ cardId: line.card_id, productId })
                            }
                          />
                        </div>
                      ) : null}
                      {line.tcgplayer_url ? (
                        <a href={line.tcgplayer_url} target="_blank" rel="noreferrer">
                          TCGPlayer
                        </a>
                      ) : null}
                      {showAltArts ? (
                        <div className="grid-card-alts">{groupBuyAltRow(line)}</div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : isNarrow ? (
            <div className="mobile-card-list mobile-card-list-mounted">
              {displayRows.map((row) => {
                if (row.kind === "header") {
                  return (
                    <div key={row.key} className="group-buy-user-section">
                      <UserGroupHeading
                        userId={row.userId}
                        displayName={row.displayName}
                        members={members}
                      />
                    </div>
                  );
                }
                const line = row.line;
                const excluded = isLineExcluded(line);
                return (
                  <article
                    key={row.key}
                    className={cardShellClass("mobile-card need", line, members, excluded)}
                  >
                    <MemberColorRail line={line} members={members} />
                    <div className="mobile-card-top">
                      <MobileCardMedia
                        src={line.image_url || undefined}
                        alt={line.name}
                        cost={line.cost ?? null}
                        rarity={line.rarity}
                      />
                      <div className="mobile-card-info">
                        <div className="card-id">{line.card_id}</div>
                        <div className="mobile-card-name">{line.name}</div>
                        <div className="mobile-card-meta">
                          {[excluded ? "Excluded" : "", line.color, `Total ${line.total_qty}`, money(line.remaining_cost)]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                        <div className="group-buy-who-row">
                          <MemberBreakdown line={line} members={members} />
                        </div>
                        <div className="mobile-card-price-row">
                          <MarketPrice price={line.market_price} productId={line.product_id} />
                          {line.tcgplayer_url ? (
                            <a href={line.tcgplayer_url} target="_blank" rel="noreferrer">
                              TCGPlayer
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {detail.status === "open" ? (
                      <div className="mobile-card-owned">
                        <span>Your buy</span>
                        <BuyQtyEditor
                          cardId={line.card_id}
                          qty={line.my_qty}
                          suggestedQty={line.my_suggested_qty}
                          isCustom={line.my_is_custom}
                          excluded={excluded}
                          disabled={qtyBusy}
                          onSave={(qty) => setQty.mutate({ cardId: line.card_id, qty })}
                          onReset={() => clearQty.mutate(line.card_id)}
                          onExclude={() => setQty.mutate({ cardId: line.card_id, qty: 0 })}
                        />
                      </div>
                    ) : null}
                    {detail.is_host && (line.product_id || line.alt_arts.length) ? (
                      <div className="mobile-card-owned">
                        <span>Printing</span>
                        <LinePrintingSelect
                          line={line}
                          disabled={!canEditPrintings || setProduct.isPending}
                          onChange={(productId) =>
                            setProduct.mutate({ cardId: line.card_id, productId })
                          }
                        />
                      </div>
                    ) : null}
                    {showAltArts ? (
                      <div className="mobile-card-alts">{groupBuyAltRow(line)}</div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="table-wrap desktop-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Card</th>
                    {detail.status === "open" ? <th>Your buy</th> : null}
                    <th>Total</th>
                    <th>Who</th>
                    <th>Market</th>
                    <th>Est.</th>
                    {detail.is_host ? (
                      <th title="Default printing when no alt-art wants are set">Printing</th>
                    ) : null}
                    {showAltArts ? <th>Alt arts</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row) => {
                    if (row.kind === "header") {
                      return (
                        <tr key={row.key} className="group-buy-user-header-row">
                          <td colSpan={tableColSpan}>
                            <UserGroupHeading
                              userId={row.userId}
                              displayName={row.displayName}
                              members={members}
                            />
                          </td>
                        </tr>
                      );
                    }
                    const line = row.line;
                    const excluded = isLineExcluded(line);
                    const active = line.members.filter((m) => m.qty > 0);
                    const soleClass =
                      active.length === 1
                        ? ` gb-user-${memberColorIndex(active[0].user_id, members)}`
                        : "";
                    return (
                      <tr
                        key={row.key}
                        className={`${excluded ? "excluded" : ""}${soleClass}`.trim() || undefined}
                      >
                        <td className="card-cell">
                          <MemberColorRail line={line} members={members} />
                          <CardThumb src={line.image_url || undefined} alt={line.name} />
                          <div>
                            <div className="card-id">{line.card_id}</div>
                            <div>{line.name}</div>
                            {excluded ? <div className="muted">Excluded</div> : null}
                            {line.tcgplayer_url ? (
                              <a href={line.tcgplayer_url} target="_blank" rel="noreferrer">
                                TCGPlayer
                              </a>
                            ) : null}
                          </div>
                        </td>
                        {detail.status === "open" ? (
                          <td>
                            <BuyQtyEditor
                              cardId={line.card_id}
                              qty={line.my_qty}
                              suggestedQty={line.my_suggested_qty}
                              isCustom={line.my_is_custom}
                              excluded={excluded}
                              disabled={qtyBusy}
                              onSave={(qty) => setQty.mutate({ cardId: line.card_id, qty })}
                              onReset={() => clearQty.mutate(line.card_id)}
                              onExclude={() => setQty.mutate({ cardId: line.card_id, qty: 0 })}
                            />
                          </td>
                        ) : null}
                        <td>{line.total_qty}</td>
                        <td>
                          <MemberBreakdown line={line} members={members} />
                        </td>
                        <td>
                          <MarketPrice price={line.market_price} productId={line.product_id} />
                        </td>
                        <td>{money(line.remaining_cost)}</td>
                        {detail.is_host ? (
                          <td>
                            <LinePrintingSelect
                              line={line}
                              disabled={!canEditPrintings || setProduct.isPending}
                              onChange={(productId) =>
                                setProduct.mutate({ cardId: line.card_id, productId })
                              }
                            />
                          </td>
                        ) : null}
                        {showAltArts ? (
                          <td className="alt-arts-cell">{groupBuyAltRow(line)}</td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {detail.status === "open" ? (
        <p className="muted group-buy-footnote">* Custom quantity (not shopping still-need)</p>
      ) : null}
    </section>
  );
}

export function GroupBuyJoinPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const meQ = useQuery({ queryKey: ["me"], queryFn: api.me });
  const previewQ = useQuery({
    queryKey: ["group-buy-invite", token],
    queryFn: () => api.groupBuyInvitePreview(token),
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

  return (
    <section className="group-buy-join">
      <h1>Join group buy</h1>
      <p>
        <strong>{preview.title}</strong>
      </p>
      <p className="muted">
        Hosted by {preview.host_name} · {preview.member_count} member
        {preview.member_count === 1 ? "" : "s"} · {preview.status}
      </p>
      {err && <p className="error">{err}</p>}
      {meQ.data ? (
        <button
          type="button"
          className="btn primary"
          disabled={join.isPending || preview.status !== "open"}
          onClick={() => join.mutate()}
        >
          {join.isPending
            ? "Joining…"
            : preview.status === "open"
              ? "Join group buy"
              : `${preview.status[0].toUpperCase()}${preview.status.slice(1)} — cannot join`}
        </button>
      ) : (
        <Link
          className="btn primary"
          to={`/login?next=${encodeURIComponent(`/group-buy/join/${token}`)}`}
          onClick={() => rememberLoginNext(`/group-buy/join/${token}`)}
        >
          Sign in to join
        </Link>
      )}
      <p className="muted">
        <Link to="/group-buys">Back to group buys</Link>
      </p>
    </section>
  );
}
