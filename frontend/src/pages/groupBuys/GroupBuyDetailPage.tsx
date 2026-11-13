import { CardLayoutToggle, useCardLayout } from "../../ui/CardLayout";
import { AltArtsRow } from "../../cards/MarketPrice";
import { ReceiptImportPanel, type ReceiptApplyDraft } from "./ReceiptImport";
import { GroupBuyDetailSkeleton } from "../../ui/Skeleton";
import { shownProductId } from "../../cards/altArt";
import { api, GroupBuyDetail, GroupBuyLine, GroupBuyOrderUpdate, money } from "../../api";
import { useMe } from "../../auth/useMe";
import { contributionSummary, contributionUpdate, type ContributionUpdate } from "./contribution";
import { buildFilterSummary, CardSearchInput, CollapsibleFilters, SortMenu, useCardSorts, useShowAltArts, type SortKey } from "../../ui/cardListControls";
import { CardWorkspace } from "../../ui/CardWorkspace";
import { SortableTh, sortByColumn, useColumnSort } from "../../ui/columnSort";
import { applyDisplayArtOptimistic, invalidateDisplayArtViews } from "../../cards/displayArtViews";
import { altIncBlocked, myArtSplit } from "./groupBuyArt";
import { invalidateOwnedViews } from "../collection/ownedCollection";
import { blankMassEntryUrl } from "../shopping/tcgplayerMassEntry";
import { useNarrowLayout } from "../../hooks/useNarrowLayout";
import { Select } from "@optcg/ui/popups";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BuyQtyEditor } from "./BuyQtyEditor";
import { GroupBuyLines } from "./GroupBuyLines";
import { GroupBuyMembersList, GroupBuyOrderDetails, GroupBuySettlement, hasOrderPanel } from "./GroupBuyPanels";
import { groupBuyOweValue } from "./lineRows";
import { MemberSwatch } from "./memberColors";
import { ArtWantChips, SkippedBadge } from "./memberParts";
import { SHIPPING_SPLIT_LABELS, ShippingSplit } from "./shipping";
import { useGroupBuyLines } from "./useGroupBuyLines";
import { COLSORT_GB_CARDS_KEY, COLSORT_GB_OWE_KEY } from "../../storage/keys";
import { DeckIncludeFilter } from "../../ui/DeckIncludeFilter";
import { qk } from "../../cache/queryKeys";
import { copyText } from "@optcg/ui/clipboard";

export function GroupBuyDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
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
  const [spreadBusyId, setSpreadBusyId] = useState<string | null>(null);
  // Cards edited on this page stay listed even at 0, so you can still pick an alt (#868).
  const [keepVisible, setKeepVisible] = useState<ReadonlySet<string>>(() => new Set());
  const keepCardVisible = (cardId: string) =>
    setKeepVisible((prev) => (prev.has(cardId) ? prev : new Set(prev).add(cardId)));
  const [orderId, setOrderId] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [shippingCost, setShippingCost] = useState("0");
  const [taxCost, setTaxCost] = useState("0");
  const [shippingSplit, setShippingSplit] = useState<ShippingSplit>("equal");
  const [receiptDraft, setReceiptDraft] = useState<ReceiptApplyDraft | null>(null);
  const [receiptResetKey, setReceiptResetKey] = useState(0);
  const sortingByUser = effectiveSorts.includes("user");

  const detailQ = useQuery({
    queryKey: qk.groupBuy.detail(groupId),
    queryFn: () => api.groupBuy(groupId),
    enabled: Number.isFinite(groupId) && groupId > 0,
  });
  const decksQ = useQuery({ queryKey: qk.decks(), queryFn: api.decks });
  const meQ = useMe();

  const detail = detailQ.data;
  const members = detail?.members ?? [];

  const { lines, displayRows, tableRows, cardsSort, onCardsSort } = useGroupBuyLines(
    detail?.lines ?? [],
    members,
    search,
    effectiveSorts,
    COLSORT_GB_CARDS_KEY,
    { showExcluded, keepVisible },
  );
  const { sort: oweSort, onSort: onOweSort } = useColumnSort(COLSORT_GB_OWE_KEY);
  const oweMembers = useMemo(() => sortByColumn(members, oweSort, groupBuyOweValue), [members, oweSort]);

  const decks = decksQ.data ?? [];
  const myContribution = useMemo(() => {
    const me = meQ.data;
    if (!detail || !me) return null;
    return detail.members.find((m) => m.user_id === me.id) ?? null;
  }, [detail, meQ.data]);
  const activeDeckIds = myContribution?.deck_ids;
  const allSelected = !activeDeckIds || (decks.length > 0 && activeDeckIds.length === decks.length);
  const selectedDeckCount = allSelected ? decks.length : (activeDeckIds?.length ?? decks.length);

  const includeSingles = myContribution?.include_singles ?? true;
  const includeExtraCopies = myContribution?.include_extra_copies ?? false;

  const filterSummary = useMemo(() => {
    const extra: string[] = [];
    if (showExcluded) extra.push("Excluded");
    extra.push(
      ...contributionSummary({
        deckCount: decks.length,
        selectedDeckCount,
        allDecksSelected: allSelected,
        includeSingles,
        includeExtraCopies,
      }),
    );
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
    includeSingles,
    includeExtraCopies,
  ]);

  useEffect(() => {
    if (!detail) return;
    setOrderId(detail.external_order_id || "");
    setOrderNotes(detail.order_notes || "");
    setShippingCost(String(detail.shipping_cost ?? 0));
    setTaxCost(String(detail.tax_cost ?? 0));
    const split = detail.shipping_split;
    setShippingSplit(
      split === "by_cost" || split === "by_copies" || split === "equal" ? split : "equal",
    );
  }, [detail]);

  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const rename = useMutation({
    mutationFn: (title: string) => api.setGroupBuyTitle(groupId, title),
    onSuccess: async (d) => {
      qc.setQueryData(qk.groupBuy.detail(groupId), d);
      await qc.invalidateQueries({ queryKey: qk.groupBuys() });
      setRenaming(false);
    },
    onError: (e: Error) => setMsg(e.message),
  });

  function saveTitle() {
    const next = titleDraft.trim();
    if (!next || rename.isPending) return;
    rename.mutate(next);
  }

  const lock = useMutation({
    mutationFn: () => api.lockGroupBuy(groupId),
    onSuccess: async (d) => {
      qc.setQueryData(qk.groupBuy.detail(groupId), d);
      await qc.invalidateQueries({ queryKey: qk.groupBuys() });
      setMsg("Group buy locked — quantities frozen for checkout.");
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const unlock = useMutation({
    mutationFn: () => api.unlockGroupBuy(groupId),
    onSuccess: async (d) => {
      qc.setQueryData(qk.groupBuy.detail(groupId), d);
      await qc.invalidateQueries({ queryKey: qk.groupBuys() });
      setMsg("Group buy unlocked — live shopping contributions again.");
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const markOrdered = useMutation({
    mutationFn: (body: GroupBuyOrderUpdate) => api.markGroupBuyOrdered(groupId, body),
    onSuccess: async (d) => {
      qc.setQueryData(qk.groupBuy.detail(groupId), d);
      await qc.invalidateQueries({ queryKey: qk.groupBuys() });
      setMsg(
        "Order placed — settle shipping below. Import a TCGPlayer receipt, then Mark purchased for matched copies.",
      );
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const saveOrder = useMutation({
    mutationFn: (body: GroupBuyOrderUpdate) => api.updateGroupBuyOrder(groupId, body),
    onSuccess: async (d) => {
      qc.setQueryData(qk.groupBuy.detail(groupId), d);
      await qc.invalidateQueries({ queryKey: qk.groupBuys() });
      setMsg("Order details saved.");
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const complete = useMutation({
    mutationFn: (draft: ReceiptApplyDraft) =>
      api.applyGroupBuyReceipt(groupId, {
        receipt_text: draft.receiptText,
        card_ids: draft.selectedCardIds,
        allow_partial: true,
      }),
    onSuccess: async (d, draft) => {
      qc.setQueryData(qk.groupBuy.detail(groupId), d);
      await qc.invalidateQueries({ queryKey: qk.groupBuys() });
      // Mark purchased / Undo change Owned on the server.
      invalidateOwnedViews(qc);
      setReceiptDraft(null);
      setReceiptResetKey((k) => k + 1);
      setMsg(
        d.status === "completed"
          ? `Marked purchased — ${draft.stagedCopies} matched copies (${draft.lineCount} lines) added to Owned.`
          : `Marked purchased — ${draft.stagedCopies} matched copies (${draft.lineCount} lines) added to Owned. Remaining pool stays ordered until another receipt covers it.`,
      );
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const undoPurchase = useMutation({
    mutationFn: () => api.undoGroupBuyReceiptApply(groupId),
    onSuccess: async (d) => {
      qc.setQueryData(qk.groupBuy.detail(groupId), d);
      await qc.invalidateQueries({ queryKey: qk.groupBuys() });
      // Mark purchased / Undo change Owned on the server.
      invalidateOwnedViews(qc);
      setReceiptDraft(null);
      setReceiptResetKey((k) => k + 1);
      setMsg(
        "Undid Mark purchased — pool quantities and who owes what are restored. Receipt paste is still saved.",
      );
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const contribution = useMutation({
    mutationFn: (body: ContributionUpdate) => api.updateGroupBuyContribution(groupId, body),
    onSuccess: (d) => {
      // No success banner: it would push the whole page down under the checkbox you just
      // clicked (#1177). The ticked box and the updated list are the feedback.
      qc.setQueryData(qk.groupBuy.detail(groupId), d);
      setMsg(null);
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const setQty = useMutation({
    mutationFn: ({ cardId, qty }: { cardId: string; qty: number }) =>
      api.setGroupBuyQty(groupId, cardId, qty),
    onMutate: ({ cardId }) => keepCardVisible(cardId),
    onSuccess: async (d) => {
      qc.setQueryData(qk.groupBuy.detail(groupId), d);
      await qc.invalidateQueries({ queryKey: qk.groupBuys() });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const setExtraSkip = useMutation({
    mutationFn: ({ cardId, productId, skip }: { cardId: string; productId: number; skip: number }) =>
      api.setGroupBuyExtraSkip(groupId, cardId, productId, skip),
    onMutate: ({ cardId }) => keepCardVisible(cardId),
    onSuccess: async (d) => {
      qc.setQueryData(qk.groupBuy.detail(groupId), d);
      await qc.invalidateQueries({ queryKey: qk.groupBuys() });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const clearQty = useMutation({
    mutationFn: (cardId: string) => api.clearGroupBuyQty(groupId, cardId),
    onSuccess: async (d) => {
      qc.setQueryData(qk.groupBuy.detail(groupId), d);
      await qc.invalidateQueries({ queryKey: qk.groupBuys() });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const syncQty = useMutation({
    mutationFn: () => api.syncGroupBuyQuantities(groupId),
    onSuccess: async (d) => {
      qc.setQueryData(qk.groupBuy.detail(groupId), d);
      await qc.invalidateQueries({ queryKey: qk.groupBuys() });
      setMsg("Your buy quantities reset to shopping still-need.");
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const setAltWant = useMutation({
    mutationFn: async ({
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
      keepCardVisible(cardId);
      setAltWantBusyKey(`${cardId}:${productId}`);
      await qc.cancelQueries({ queryKey: qk.groupBuy.detail(groupId) });
      const prev = qc.getQueryData<GroupBuyDetail>(qk.groupBuy.detail(groupId));
      if (prev) {
        qc.setQueryData<GroupBuyDetail>(qk.groupBuy.detail(groupId), {
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
      if (ctx?.prev) qc.setQueryData(qk.groupBuy.detail(groupId), ctx.prev);
      setMsg(e.message);
    },
    onSuccess: async (res, { cardId, productId }) => {
      // The server may clamp the want; show the stored value.
      qc.setQueryData<GroupBuyDetail>(qk.groupBuy.detail(groupId), (cur) =>
        cur
          ? {
              ...cur,
              lines: cur.lines.map((line) =>
                line.card_id === cardId
                  ? {
                      ...line,
                      alt_arts: line.alt_arts.map((a) =>
                        a.product_id === productId ? { ...a, wanted: res.qty } : a,
                      ),
                    }
                  : line,
              ),
            }
          : cur,
      );
      await qc.invalidateQueries({ queryKey: qk.groupBuy.detail(groupId) });
      await qc.invalidateQueries({ queryKey: qk.groupBuys() });
      await qc.invalidateQueries({ queryKey: qk.shopping.all() });
      await qc.invalidateQueries({ queryKey: qk.deck.all() });
      await qc.invalidateQueries({ queryKey: qk.decks() });
    },
    onSettled: () => setAltWantBusyKey(null),
  });

  /** "One of each art" (#1292): spreads each of your decks' copies of a card over every art. */
  const spreadArts = useMutation({
    mutationFn: ({ cardId }: { cardId: string }) =>
      api.spreadCardArts(cardId, activeDeckIds && activeDeckIds.length ? activeDeckIds : undefined),
    onMutate: ({ cardId }) => {
      keepCardVisible(cardId);
      setSpreadBusyId(cardId);
    },
    onError: (e: Error) => setMsg(e.message),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.groupBuy.detail(groupId) });
      await qc.invalidateQueries({ queryKey: qk.groupBuys() });
      await qc.invalidateQueries({ queryKey: qk.shopping.all() });
      await qc.invalidateQueries({ queryKey: qk.deck.all() });
      await qc.invalidateQueries({ queryKey: qk.decks() });
    },
    onSettled: () => setSpreadBusyId(null),
  });

  /** Which art each card displays is your own view choice: saved like Master Shopping (#874). */
  const setDisplayArt = useMutation({
    mutationFn: ({ cardId, productId }: { cardId: string; productId: number }) =>
      api.setDisplayArt(cardId, productId),
    onMutate: async ({ cardId, productId }) => {
      await qc.cancelQueries({ queryKey: qk.groupBuy.detail(groupId) });
      const prev = qc.getQueryData<GroupBuyDetail>(qk.groupBuy.detail(groupId));
      if (prev) {
        qc.setQueryData<GroupBuyDetail>(qk.groupBuy.detail(groupId), {
          ...prev,
          lines: prev.lines.map((line) =>
            line.card_id === cardId ? { ...line, display_art: productId } : line,
          ),
        });
      }
      applyDisplayArtOptimistic(qc, cardId, productId);
      return { prev };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.groupBuy.detail(groupId), ctx.prev);
      setMsg(e.message);
    },
    onSettled: () => invalidateDisplayArtViews(qc),
  });

  const leave = useMutation({
    mutationFn: () => api.leaveGroupBuy(groupId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.groupBuys() });
      navigate("/group-buys");
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteGroupBuy(groupId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.groupBuys() });
      window.location.href = "/group-buys";
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const qtyBusy =
    setQty.isPending || clearQty.isPending || syncQty.isPending || setExtraSkip.isPending;

  const groupBuyAltRow = (line: GroupBuyLine) => {
    const alts = line.alt_arts ?? [];
    const canEditWants = detail?.status === "open" && (line.my_need ?? 0) > 0;
    const baseCount = myArtSplit(line).base;
    const baseControl =
      baseCount > 0 ? (
        <span className="alt-want-label" title="Copies you buy as the base art">
          Buy ×{baseCount}
        </span>
      ) : null;
    return (
      <AltArtsRow
        base={{
          name: line.name,
          image_url: line.base_image_url || undefined,
          market_price: line.preferred_market_price ?? null,
          product_id: line.preferred_product_id ?? null,
        }}
        baseOwnedControl={baseControl}
        alts={alts}
        cardId={line.card_id}
        cardNeeded={line.my_need ?? 0}
        editable={canEditWants}
        blockWantInc={altIncBlocked(line)}
        blockWantIncTitle="No Base copies left; raise Your buy first"
        onWantChange={
          canEditWants
            ? (productId, qty) => setAltWant.mutate({
                  cardId: line.card_id,
                  productId,
                  qty,
                })
            : undefined
        }
        tileExtra={(productId) => (
          <>
            <ArtWantChips line={line} productId={productId} members={members} />
            <SkippedBadge line={line} productId={productId} />
          </>
        )}
        onSpread={canEditWants ? () => spreadArts.mutate({ cardId: line.card_id }) : undefined}
        spreadBusy={spreadBusyId === line.card_id}
        shownProductId={shownProductId(line)}
        onShow={(productId) => setDisplayArt.mutate({ cardId: line.card_id, productId })}
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
    setInviteMsg((await copyText(url)) ? "Invite link copied" : url);
  }

  async function exportMassEntry(d: GroupBuyDetail) {
    try {
      // Backend is source of truth (per-member AA allocation). Never open a
      // client-built deep link alongside backend paste — local export omits
      // alt wants, and pasting into a pre-filled Mass Entry doubles qty.
      const exported = await api.exportGroupBuyTcgplayer(d.id);
      const paste = exported.paste_text.trim();
      if (!paste) {
        setMsg("Nothing to export — no copies in this group buy.");
        return;
      }
      // Clipboard may be blocked; still open Mass Entry when we have a URL.
      const copied = await copyText(paste);
      const copies = exported.copy_count;
      const cards = exported.included_count;
      if (exported.url) {
        window.open(exported.url, "_blank", "noopener,noreferrer");
        setMsg(
          copied
            ? `Opened Mass Entry for ${copies} group copies (${cards} lines). List copied as backup — paste only if the form is empty, then Add to Cart → Optimize Cart.`
            : `Opened Mass Entry for ${copies} group copies. If the form is empty, copy the list from the app and paste it, then Add to Cart → Optimize Cart.`,
        );
      } else {
        window.open(blankMassEntryUrl(), "_blank", "noopener,noreferrer");
        if (copied) {
          setMsg(
            `List too long for a direct link — copied ${copies} group copies. Paste into Mass Entry (do not paste twice), then Add to Cart → Optimize Cart.`,
          );
        } else {
          setMsg(paste);
        }
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

  const showOrderPanel = hasOrderPanel(detail);
  const orderBusy = markOrdered.isPending || saveOrder.isPending || complete.isPending;
  const receiptReady = Boolean(receiptDraft?.canApply);

  function updateContribution(patch: Partial<ContributionUpdate>) {
    contribution.mutate(
      contributionUpdate(
        {
          deck_ids: activeDeckIds ?? null,
          include_singles: includeSingles,
          include_extra_copies: includeExtraCopies,
        },
        patch,
      ),
    );
  }

  function setContributionDecks(next: number[] | null) {
    updateContribution({ deck_ids: next && next.length === decks.length ? null : next });
  }

  function orderBodyFromForm(): GroupBuyOrderUpdate {
    const parsedShip = Number(shippingCost);
    const parsedTax = Number(taxCost);
    return {
      external_order_id: orderId.trim(),
      order_notes: orderNotes.trim(),
      shipping_cost: Number.isFinite(parsedShip) && parsedShip >= 0 ? parsedShip : 0,
      shipping_split: shippingSplit,
      tax_cost: Number.isFinite(parsedTax) && parsedTax >= 0 ? parsedTax : 0,
    };
  }

  return (
    <section className="group-buy-detail">
      <div className="page-head">
        <div>
          <p className="muted">
            <Link to="/group-buys">Group buys</Link>
          </p>
          {detail.is_host && renaming ? (
            <div className="gb-title-edit">
              <input
                type="text"
                className="gb-title-input"
                data-testid="gb-title-input"
                aria-label="Group buy name"
                value={titleDraft}
                maxLength={200}
                autoFocus
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveTitle();
                  } else if (e.key === "Escape") {
                    setRenaming(false);
                  }
                }}
              />
              <button
                type="button"
                className="btn primary"
                data-testid="gb-title-save"
                disabled={!titleDraft.trim() || rename.isPending}
                onClick={saveTitle}
              >
                Save
              </button>
              <button type="button" className="btn secondary" onClick={() => setRenaming(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="gb-title-row">
              <h1>{detail.title}</h1>
              {detail.is_host && (
                <button
                  type="button"
                  className="ghost"
                  data-testid="gb-rename"
                  onClick={() => {
                    setTitleDraft(detail.title);
                    setRenaming(true);
                  }}
                >
                  Rename
                </button>
              )}
            </div>
          )}
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
        {detail.is_host && (detail.status === "locked" || detail.status === "ordered") && (
          <button
            type="button"
            className="btn primary"
            disabled={complete.isPending || !receiptReady}
            title={
              receiptReady
                ? undefined
                : "Import and match a TCGPlayer receipt first"
            }
            onClick={() => {
              if (!receiptDraft?.canApply) {
                setMsg("Import and match a TCGPlayer receipt before Mark purchased.");
                return;
              }
              const ok = window.confirm(
                "Mark purchased for matched receipt cards?\n\n" +
                  `${receiptDraft.lineCount} card line(s), ${receiptDraft.stagedCopies} copies will be added to Owned.\n` +
                  "Pool cards missing from the receipt are left ordered until another receipt covers them." +
                  (detail.status === "locked" ? "\n\nThis will also mark the pool as ordered." : ""),
              );
              if (ok) complete.mutate(receiptDraft);
            }}
          >
            {complete.isPending
              ? "Finishing…"
              : receiptReady
                ? `Mark purchased (${receiptDraft?.stagedCopies ?? 0})`
                : "Mark purchased"}
          </button>
        )}
        {detail.is_host && detail.can_undo_purchase && (
          <button
            type="button"
            className="btn secondary"
            disabled={undoPurchase.isPending || complete.isPending}
            onClick={() => {
              const ok = window.confirm(
                "Undo the latest Mark purchased?\n\n" +
                  "This restores the shopping pool and each person’s owed amounts, and removes those receipt copies from Owned. " +
                  "Your imported receipt paste stays saved so you can Mark purchased again.",
              );
              if (ok) undoPurchase.mutate();
            }}
          >
            {undoPurchase.isPending ? "Undoing…" : "Undo Mark purchased"}
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
        {!detail.is_host && (
          <button
            type="button"
            className="ghost danger"
            disabled={leave.isPending || detail.status !== "open"}
            title={detail.status !== "open" ? "Ask the host to unlock first" : undefined}
            onClick={() => {
              if (window.confirm("Leave this group buy? Your quantities are removed from the pool.")) {
                leave.mutate();
              }
            }}
          >
            Leave group buy
          </button>
        )}
      </div>
      {detail.is_host &&
      (detail.status === "locked" || detail.status === "ordered") &&
      !receiptReady ? (
        <p className="group-buy-receipt-gate muted" role="status">
          {detail.has_receipt
            ? "Matching saved receipt… Mark purchased unlocks when the match finishes."
            : "Import and match a TCGPlayer receipt below to enable Mark purchased."}
        </p>
      ) : null}
      {(inviteMsg || msg) && (
        <p className="buy-bar-msg buy-bar-msg-solo" role="status">
          {inviteMsg || msg}
        </p>
      )}

      <GroupBuyMembersList detail={detail} />

      {showOrderPanel && (
        <GroupBuySettlement detail={detail}>
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
                <Select
                  value={shippingSplit}
                  onChange={setShippingSplit}
                  options={(Object.keys(SHIPPING_SPLIT_LABELS) as ShippingSplit[]).map((key) => ({
                    value: key,
                    label: SHIPPING_SPLIT_LABELS[key],
                  }))}
                />
              </label>
              <label>
                Tax
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={taxCost}
                  onChange={(e) => setTaxCost(e.target.value)}
                  aria-describedby="group-buy-tax-hint"
                />
                <span id="group-buy-tax-hint" className="group-buy-field-hint">
                  Always split by card cost
                </span>
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
            <GroupBuyOrderDetails detail={detail} />
          )}
          <div className="table-wrap desktop-table">
            <table className="data-table group-buy-owe-table">
              <thead>
                <tr>
                  <SortableTh label="Member" colKey="member" firstDir="asc" sort={oweSort} onSort={onOweSort} />
                  <SortableTh label="Cards" colKey="cards" firstDir="desc" sort={oweSort} onSort={onOweSort} />
                  <SortableTh label="Shipping" colKey="shipping" firstDir="desc" sort={oweSort} onSort={onOweSort} />
                  <SortableTh label="Tax" colKey="tax" firstDir="desc" sort={oweSort} onSort={onOweSort} />
                  <SortableTh label="Owes" colKey="owes" firstDir="desc" sort={oweSort} onSort={onOweSort} />
                </tr>
              </thead>
              <tbody>
                {oweMembers.map((m) => (
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
                    <td>{money(m.tax_share ?? 0)}</td>
                    <td>
                      <strong className="group-buy-owes">{money(m.total_owed ?? 0)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GroupBuySettlement>
      )}

      {detail.is_host && (detail.status === "locked" || detail.status === "ordered") && (
        <ReceiptImportPanel
          key={receiptResetKey}
          groupId={groupId}
          isHost={detail.is_host}
          status={detail.status}
          initialReceiptText={detail.receipt_text || ""}
          onDraftChange={setReceiptDraft}
          onError={(message) => setMsg(message)}
          onReceiptSaved={() => {
            void qc.invalidateQueries({ queryKey: qk.groupBuy.detail(groupId) });
          }}
        />
      )}

      {detail.status === "open" && myContribution && (
        <div className="group-buy-contribution">
          <h2>Your contribution</h2>
          <p className="muted">
            Defaults follow your shopping still-need for the decks, singles and extra copies selected under Filters. Edit{" "}
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
          <CardWorkspace
            rail={
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
                  columnSortKey={COLSORT_GB_CARDS_KEY}
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
              {detail.status === "open" && myContribution ? (
                <DeckIncludeFilter
                  heading="Include"
                  decks={decks}
                  selectedIds={allSelected ? decks.map((d) => d.id) : (activeDeckIds ?? [])}
                  onChange={setContributionDecks}
                  onSelectAll={() => setContributionDecks(null)}
                  selectAllLabel="Select all decks"
                  selectAllDisabled={allSelected}
                  showSelectAll={decks.length > 0}
                  disabled={contribution.isPending}
                  otherChips={[
                    {
                      key: "singles",
                      label: "Cards not in a deck",
                      checked: includeSingles,
                      onChange: (v) => updateContribution({ include_singles: v }),
                    },
                    {
                      key: "extra-copies",
                      label: "Extra copies",
                      checked: includeExtraCopies,
                      onChange: (v) => updateContribution({ include_extra_copies: v }),
                    },
                  ]}
                  note={
                    <p className="muted group-buy-deck-filter-note">
                      Unchecked decks and cards are left out of your contribution. Extra copies adds
                      the alt arts you marked as Extra copy.
                    </p>
                  }
                />
              ) : null}
            </CollapsibleFilters>
          </div>
            }
          >

          {search.trim() ? (
            <p className="search-result-note muted">
              Showing {lines.length} match{lines.length === 1 ? "" : "es"} for “{search.trim()}”
            </p>
          ) : null}

          {lines.length === 0 ? (
            <p className="muted">No cards match the current search or filters.</p>
          ) : (
            <GroupBuyLines
              layout={layout}
              isNarrow={isNarrow}
              members={members}
              displayRows={displayRows}
              tableRows={tableRows}
              cardsSort={cardsSort}
              onCardsSort={onCardsSort}
              renderBuyEditor={
                detail.status === "open"
                  ? (line, excluded) => (
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
                        deckQty={line.my_deck_qty ?? 0}
                        extras={line.my_extras ?? []}
                        onExtraSkip={(productId, skip) =>
                          setExtraSkip.mutate({ cardId: line.card_id, productId, skip })
                        }
                      />
                    )
                  : undefined
              }
              renderAltRow={showAltArts ? groupBuyAltRow : undefined}
            />
          )}
          </CardWorkspace>
        </>
      )}
      {detail.status === "open" ? (
        <p className="muted group-buy-footnote">* Custom quantity (not shopping still-need)</p>
      ) : null}
    </section>
  );
}
