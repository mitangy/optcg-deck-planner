import { useCardLayout, useListDensity } from "../../ui/CardLayout";
import { AltArtsRow } from "../../cards/MarketPrice";
import { GroupBuyDetailSkeleton } from "../../ui/Skeleton";
import { shownProductId } from "../../cards/altArt";
import { api, GroupBuyDetail, GroupBuyLine, GroupBuyOrderUpdate, money } from "../../api";
import { useMe } from "../../auth/useMe";
import { contributionUpdate, type ContributionUpdate } from "./contribution";
import { useCardSorts, useShowAltArts, type SortKey } from "../../ui/cardListControls";
import { FilterCheck, ListToolbar } from "../../ui/ListToolbar";
import { CardWorkspace } from "../../ui/CardWorkspace";
import { SortableTh, sortByColumn, useColumnSort } from "../../ui/columnSort";
import { applyDisplayArtOptimistic, invalidateDisplayArtViews } from "../../cards/displayArtViews";
import { altIncBlocked, myAltBuyQty, myArtSplit } from "./groupBuyArt";
import { blankMassEntryUrl } from "../shopping/tcgplayerMassEntry";
import { useGroupBuyListNarrow } from "../../hooks/useGroupBuyListNarrow";
import { Select, useConfirm } from "@optcg/ui/popups";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BuyQtyEditor } from "./BuyQtyEditor";
import { GroupBuyLines } from "./GroupBuyLines";
import { GroupBuyMembersList, GroupBuyOrderDetails, GroupBuySettlement, hasOrderPanel } from "./GroupBuyPanels";
import { groupBuyOweValue } from "./lineRows";
import { MemberSwatch } from "./memberColors";
import { GroupBuyActionBar, GroupBuyStepper, PencilIcon, YourShareCard, type ActionDef } from "./GroupBuyHeader";
import { AddOrderDialog } from "./AddOrderDialog";
import { CheckItemsDialog } from "./CheckItemsDialog";
import { NotInOrderPanel } from "./NotInOrderPanel";
import { PackagesSection, StatusChip } from "./PackagesSection";
import { YourCards } from "./YourCards";
import { HandoffPanel } from "./HandoffPanel";
import { MyHandoff } from "./MyHandoff";
import { cardStatus, notOrderedCopies, packageCounts, sellersOnTheWay } from "./groupBuyOrders";
import { useGroupBuyOrders } from "./useGroupBuyOrders";
import { CollapsibleDrawer } from "../../ui/cardListControls";
import { groupBuyActions, stepHint, stepLabel, summaryParts, type GroupBuyActionKey } from "./groupBuyActions";
import { ArtWantChips, SkippedBadge, boughtAltRow } from "./memberParts";
import { SHIPPING_SPLIT_LABELS, ShippingSplit } from "./shipping";
import { useGroupBuyLines } from "./useGroupBuyLines";
import { COLSORT_GB_CARDS_KEY, COLSORT_GB_OWE_KEY } from "../../storage/keys";
import { qk } from "../../cache/queryKeys";
import { copyText } from "@optcg/ui/clipboard";

export function GroupBuyDetailPage() {
  const { confirm, confirmDialog } = useConfirm();
  const { id } = useParams();
  const navigate = useNavigate();
  const groupId = Number(id);
  const qc = useQueryClient();
  const isNarrow = useGroupBuyListNarrow();
  const [layout, setLayout] = useCardLayout();
  const [density, setDensity] = useListDensity("groupBuy");
  const [addOpen, setAddOpen] = useState(false);
  const [checkOrderId, setCheckOrderId] = useState<number | null>(null);
  const [editOrderId, setEditOrderId] = useState<number | null>(null);
  const [cardsOpenPick, setCardsOpenPick] = useState<boolean | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const unavailableSorts = useMemo(() => ["deck"] as SortKey[], []);
  const { sorts, setSorts, effectiveSorts } = useCardSorts(true, unavailableSorts);
  const [showAltArts, setShowAltArts] = useShowAltArts();
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [altWantBusyKey, setAltWantBusyKey] = useState<string | null>(null);
  const [keepVisible, setKeepVisible] = useState<ReadonlySet<string>>(() => new Set());
  const keepCardVisible = (cardId: string) =>
    setKeepVisible((prev) => (prev.has(cardId) ? prev : new Set(prev).add(cardId)));
  const [orderNotes, setOrderNotes] = useState("");
  const [shippingCost, setShippingCost] = useState("0");
  const [taxCost, setTaxCost] = useState("0");
  const [shippingSplit, setShippingSplit] = useState<ShippingSplit>("equal");
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

  const includeSingles = myContribution?.include_singles ?? true;
  const includeExtraCopies = myContribution?.include_extra_copies ?? false;

  useEffect(() => {
    if (!detail) return;
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

  const saveOrder = useMutation({
    mutationFn: (body: GroupBuyOrderUpdate) => api.updateGroupBuyOrder(groupId, body),
    onSuccess: async (d) => {
      qc.setQueryData(qk.groupBuy.detail(groupId), d);
      await qc.invalidateQueries({ queryKey: qk.groupBuys() });
      setMsg("Order details saved.");
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

  const resetInvite = useMutation({
    mutationFn: () => api.resetGroupBuyInvite(groupId),
    onSuccess: (d) => {
      qc.setQueryData(qk.groupBuy.detail(groupId), d);
      setMsg("Invite link reset. The old link no longer works.");
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

  const orderOps = useGroupBuyOrders(groupId, setMsg);

  const qtyBusy =
    setQty.isPending || clearQty.isPending || syncQty.isPending || setExtraSkip.isPending;

  const groupBuyAltRow = (line: GroupBuyLine) => {
    if (line.bought_arts?.length) return boughtAltRow(line);
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
        altBuyQty={(productId) => myAltBuyQty(line, productId)}
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
  const orderBusy = saveOrder.isPending || orderOps.busy;
  const orders = detail.orders ?? [];
  const showPackages = detail.status === "locked" || detail.status === "ordered" || detail.status === "completed";
  const inOrderedPhase = detail.status === "ordered" || detail.status === "completed";
  const everythingArrived = detail.status === "completed" && notOrderedCopies(detail) === 0;
  const canEditArrival = detail.status === "ordered" || everythingArrived;
  const checkOrder = orders.find((o) => o.id === checkOrderId) ?? null;
  const editOrder = orders.find((o) => o.id === editOrderId) ?? null;
  const meId = meQ.data?.id;
  // The long list folds away for the host once packages are being tracked; members and open/locked groups see it.
  const cardsOpen = cardsOpenPick ?? !(detail.is_host && inOrderedPhase && orders.length > 0);

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
      order_notes: orderNotes.trim(),
      shipping_cost: Number.isFinite(parsedShip) && parsedShip >= 0 ? parsedShip : 0,
      shipping_split: shippingSplit,
      tax_cost: Number.isFinite(parsedTax) && parsedTax >= 0 ? parsedTax : 0,
    };
  }

  const actions = groupBuyActions(detail.status, detail.is_host);
  const summary = summaryParts(detail);
  const filterBadge = (showExcluded ? 1 : 0) + (showAltArts ? 0 : 1);

  const defs: Partial<Record<GroupBuyActionKey, ActionDef>> = {
    "copy-invite": { label: "Copy invite link", onClick: () => void copyInvite(detail.invite_path) },
    "mass-entry": { label: "Open Mass Entry", onClick: () => void exportMassEntry(detail) },
    lock: {
      label: lock.isPending ? "Locking…" : "Lock for checkout",
      disabled: lock.isPending || orderBusy,
      onClick: () => lock.mutate(),
    },
    unlock: {
      label: unlock.isPending ? "Unlocking…" : "Unlock",
      disabled: unlock.isPending || orderBusy,
      onClick: () => unlock.mutate(),
    },
    "add-order": { label: "Add order", testId: "gb-add-order", disabled: orderBusy, onClick: () => setAddOpen(true) },
    "reset-invite": {
      label: "Reset invite link",
      testId: "gb-reset-invite",
      disabled: resetInvite.isPending,
      onClick: async () => {
        const ok = await confirm({
          title: "Reset the invite link?",
          message:
            "The current link stops working for everyone who has it. People already in the group buy stay in.",
          confirmLabel: "Reset link",
          danger: false,
        });
        if (ok) {
          setInviteMsg(null);
          resetInvite.mutate();
        }
      },
    },
    delete: {
      label: "Delete group buy",
      danger: true,
      disabled: remove.isPending,
      onClick: async () => {
        const ok = await confirm({ title: "Delete this group buy for everyone?", confirmLabel: "Delete" });
        if (ok) remove.mutate();
      },
    },
    leave: {
      label: "Leave group buy",
      danger: true,
      disabled: leave.isPending || detail.status !== "open",
      title: detail.status !== "open" ? "Ask the host to unlock first" : undefined,
      onClick: async () => {
        const ok = await confirm({
          title: "Leave this group buy?",
          message: "Your quantities are removed from the pool.",
          confirmLabel: "Leave",
        });
        if (ok) leave.mutate();
      },
    },
  };

  return (
    <section className="group-buy-detail">
      {confirmDialog}
      {addOpen ? (
        <AddOrderDialog
          groupId={groupId}
          detail={detail}
          onClose={() => setAddOpen(false)}
          onAdded={async (d, info) => {
            await orderOps.accept(d, info.arrived);
            setAddOpen(false);
            const added = info.orders ?? 1;
            setMsg(
              `${added === 1 ? "Order" : `${added} orders`} added${info.copies ? ` · ${info.copies} ${info.copies === 1 ? "copy" : "copies"}` : ""}${info.arrived ? ", marked arrived" : ""}.` +
                (info.unmatched ? ` ${info.unmatched} ${info.unmatched === 1 ? "line was" : "lines were"} not in this buy and left out.` : ""),
            );
          }}
        />
      ) : null}
      {editOrder ? (
        <AddOrderDialog
          key={editOrder.version}
          groupId={groupId}
          detail={detail}
          order={editOrder}
          onClose={() => setEditOrderId(null)}
          onAdded={async (d, info) => {
            await orderOps.accept(d, false);
            setEditOrderId(null);
            setMsg(
              "Order updated." +
                (info.unmatched ? ` ${info.unmatched} ${info.unmatched === 1 ? "line was" : "lines were"} not in this buy and left out.` : ""),
            );
          }}
        />
      ) : null}
      {checkOrder ? (
        <CheckItemsDialog
          key={checkOrder.version}
          order={checkOrder}
          index={orders.indexOf(checkOrder)}
          lines={detail.lines}
          members={members}
          orders={orders}
          saving={orderOps.saveArrival.isPending}
          error={orderOps.saveArrival.isError ? (orderOps.saveArrival.error as Error).message : null}
          onSave={(draft) =>
            orderOps.saveArrival.mutate({ order: checkOrder, draft }, { onSuccess: () => setCheckOrderId(null) })
          }
          onClose={() => {
            orderOps.saveArrival.reset();
            setCheckOrderId(null);
          }}
        />
      ) : null}
      <div className="page-head gb-head">
        <div>
          <p className="eyebrow gb-back">
            <Link to="/group-buys">← Group buys</Link>
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
                  className="ghost gb-rename-btn"
                  data-testid="gb-rename"
                  aria-label="Rename group buy"
                  title="Rename group buy"
                  onClick={() => {
                    setTitleDraft(detail.title);
                    setRenaming(true);
                  }}
                >
                  <PencilIcon />
                </button>
              )}
              <span className={`group-buy-status status-${detail.status}`}>{stepLabel(detail.status)}</span>
            </div>
          )}
          <p className="muted gb-summary">
            {summary.text} · {summary.moneyLabel} <strong>{money(summary.money)}</strong>
          </p>
          <GroupBuyStepper status={detail.status} />
          <p className="gb-step-hint muted" role="status">
            {stepHint(detail.status, detail.is_host)}
          </p>
        </div>
      </div>

      <GroupBuyActionBar actions={actions} defs={defs} />
      {(inviteMsg || msg) && (
        <p className="buy-bar-msg buy-bar-msg-solo" role="status">
          {inviteMsg || msg}
        </p>
      )}

      {showPackages && !detail.is_host && inOrderedPhase ? (
        <>
          <MyHandoff detail={detail} userId={meId} onMessage={setMsg} />
          <YourCards detail={detail} userId={meId} />
        </>
      ) : null}

      {showPackages ? (
        <PackagesSection
          detail={detail}
          canEdit={canEditArrival}
          busy={orderBusy}
          onAddOrder={() => setAddOpen(true)}
          onEdit={(o) => {
            setMsg(null);
            setEditOrderId(o.id);
          }}
          onMarkArrived={(o) => orderOps.markArrived.mutate(o)}
          onCheck={(o) => {
            setMsg(null);
            setCheckOrderId(o.id);
          }}
          onUndo={async (o) => {
            const ok = await confirm({
              title: "Undo this order's arrival?",
              message: "Its copies come off members' Owned and the order goes back to On the way.",
              confirmLabel: "Undo arrival",
            });
            if (ok) orderOps.undoArrival.mutate(o);
          }}
          onDelete={async (o) => {
            const ok = await confirm({
              title: "Delete this order?",
              message: "Its copies go back to Not in an order yet.",
              confirmLabel: "Delete order",
            });
            if (ok) orderOps.deleteOrder.mutate(o);
          }}
        />
      ) : null}

      {detail.status === "ordered" ? (
        <NotInOrderPanel
          detail={detail}
          busy={orderBusy}
          onMassEntry={() => void exportMassEntry(detail)}
          onClose={async () => {
            const ok = await confirm({
              title: "Close this group buy?",
              message:
                `${notOrderedCopies(detail)} copies are not in any order. They stay on members' Shopping lists, and package tracking ends.`,
              confirmLabel: "Close group buy",
              danger: false,
            });
            if (ok) orderOps.close.mutate();
          }}
        />
      ) : null}

      {detail.is_host && inOrderedPhase ? <HandoffPanel detail={detail} onMessage={setMsg} /> : null}

      {showPackages && detail.is_host && inOrderedPhase ? (
        <div className="gb-yourcards-fold">
          <CollapsibleDrawer label="Your cards">
            <YourCards detail={detail} userId={meId} />
          </CollapsibleDrawer>
        </div>
      ) : null}

      {myContribution ? (
        <YourShareCard
          detail={detail}
          me={myContribution}
          decks={decks}
          activeDeckIds={activeDeckIds}
          allSelected={allSelected}
          includeSingles={includeSingles}
          includeExtraCopies={includeExtraCopies}
          busy={contribution.isPending}
          resetBusy={syncQty.isPending}
          onDecks={setContributionDecks}
          onSelectAll={() => setContributionDecks(null)}
          onFlag={updateContribution}
          onReset={() => syncQty.mutate()}
        />
      ) : null}

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

      {detail.lines.length === 0 ? (
        <p className="muted">Nothing to buy yet — members need cards on their shopping lists.</p>
      ) : (
        <>
          {inOrderedPhase ? (
            <h2 className="group-buy-merged-heading gb-cards-toggle">
              <button type="button" aria-expanded={cardsOpen} onClick={() => setCardsOpenPick(!cardsOpen)}>
                <span aria-hidden="true">{cardsOpen ? "▾" : "▸"}</span> Cards · {detail.lines.length}
              </button>
            </h2>
          ) : (
            <h2 className="group-buy-merged-heading">Cards · {detail.lines.length}</h2>
          )}
          {cardsOpen ? (
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
                  columnSortKey: COLSORT_GB_CARDS_KEY,
                }}
                filterBadge={filterBadge}
                filters={
                  <>
                    <div className="collection-filter-list">
                      <FilterCheck checked={showAltArts} onChange={setShowAltArts}>
                        Show alt arts
                      </FilterCheck>
                      <FilterCheck checked={showExcluded} onChange={setShowExcluded}>
                        Show excluded
                      </FilterCheck>
                    </div>
                    {sortingByUser ? (
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
                density={density}
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
                renderStatus={
                  inOrderedPhase
                    ? (line) => {
                        const chip = cardStatus(packageCounts([line]), sellersOnTheWay(orders, line.card_id));
                        return chip ? <StatusChip {...chip} /> : null;
                      }
                    : undefined
                }
              />
            )}
          </CardWorkspace>
          ) : null}
        </>
      )}
    </section>
  );
}
