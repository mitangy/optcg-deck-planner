import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  computeDisplayedOrder,
  settleAnnouncement,
  settleAt,
  settleSummary,
  type HoldTiming,
} from "./settledOrder";
import { sortByColumn, type ColumnSort, type ColumnValue } from "./columnSort";

/**
 * Lists that hold still while you edit a row (#1498). See `settledOrder.ts` for the rules.
 *
 * `useSettledOrder` sits next to a list's filter+sort memo. Steppers report edits through the scope
 * (`useSettledScope`), the rows you touched keep their place and stay visible (always with live
 * counts), and once you are done with them (pointer left, focus left, touch idle, or the backstop)
 * everything settles into the live order with a short glide.
 */

export type RestoreOp = {
  /** One undo step per key per hold: the first edit's "before" value wins. */
  key: string;
  restore: () => unknown;
};

export type RowHold = { done: boolean; canUndo: boolean; undo: () => void };

export type SettledScope = {
  /** The user changed something on this row (stepper click or input commit). */
  markEdited: (id: string, op?: RestoreOp) => void;
  /** Bulk Mark bought or a scanner add: hold these rows now, settle shortly after. */
  markBulk: (entries: { id: string; op?: RestoreOp }[]) => void;
  /** The scanner added cards and we do not know which: hold everything shown. */
  holdAll: () => void;
  /** A save failed: drop the hold and the done state of that row. */
  clearHold: (id: string) => void;
  row: (id: string) => RowHold | null;
  /** Held or still fading out: keeps its displayed position. */
  pinned: () => ReadonlySet<string>;
};

const SettledContext = createContext<SettledScope | null>(null);

export function SettledScopeProvider({ scope, children }: { scope: SettledScope; children: ReactNode }) {
  return <SettledContext.Provider value={scope}>{children}</SettledContext.Provider>;
}

export function useSettledScope(): SettledScope | null {
  return useContext(SettledContext);
}

export function useRowHold(id: string | undefined): RowHold | null {
  const scope = useSettledScope();
  return scope && id ? scope.row(id) : null;
}

type Hold = HoldTiming & { ops: Map<string, RestoreOp>; scrollY: number };

const GLIDE_MS = 220;
const LEAVE_MS = 250;
const REDUCED_MS = 120;
const HIGHLIGHT_MS = 1500;
const NEAR_PX = 240;

const rowSelector = (id: string) => `[data-row-id="${typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id}"]`;

function rowIdOf(node: EventTarget | null): string | null {
  const el = node instanceof Element ? node.closest<HTMLElement>("[data-row-id]") : null;
  return el?.dataset.rowId ?? null;
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** No pointer seen yet and the device cannot hover: treat the edit as a tap. */
function noHover(): boolean {
  try {
    return window.matchMedia("(hover: none)").matches;
  } catch {
    return false;
  }
}

/**
 * While a row is held its cells change (a covered card loses its buy split, a count gets wider), and an auto
 * table would re-flow every column under the pointer. Pin each table's column widths for the length of the hold.
 */
const tableHolds = (table: HTMLTableElement, ids: readonly string[]) =>
  Array.from(table.querySelectorAll<HTMLElement>("[data-row-id]")).some((r) => ids.includes(r.dataset.rowId ?? ""));

function freezeColumns(ids: readonly string[]) {
  for (const table of Array.from(document.querySelectorAll<HTMLTableElement>("table")).filter((t) => tableHolds(t, ids))) {
    if (table.dataset.colsFrozen || table.getClientRects().length === 0) continue;
    const head = Array.from(table.querySelectorAll<HTMLElement>("thead th"));
    if (head.length === 0) continue;
    const widths = head.map((th) => th.getBoundingClientRect().width);
    const total = table.getBoundingClientRect().width;
    table.dataset.colsFrozen = "1";
    table.style.tableLayout = "fixed";
    table.style.width = `${total}px`;
    head.forEach((th, i) => (th.style.width = `${widths[i]}px`));
  }
}

function unfreezeColumns(ids: readonly string[]) {
  for (const table of Array.from(document.querySelectorAll<HTMLTableElement>("table[data-cols-frozen]")).filter((t) => tableHolds(t, ids))) {
    delete table.dataset.colsFrozen;
    table.style.tableLayout = "";
    table.style.width = "";
    table.querySelectorAll<HTMLElement>("thead th").forEach((th) => (th.style.width = ""));
  }
}

function visibleRowElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-row-id]")).filter((el) => el.getClientRects().length > 0);
}

function nearViewport(r: DOMRect): boolean {
  return r.bottom > -NEAR_PX && r.top < window.innerHeight + NEAR_PX;
}

/** Fade a leaving row out and collapse its height (cards in a grid only fade: the grid reflows on its own). */
function animateLeave(el: HTMLElement, reduced: boolean) {
  const duration = reduced ? REDUCED_MS : LEAVE_MS;
  const opts: KeyframeAnimationOptions = { duration, easing: "ease-out", fill: "forwards" };
  if (reduced || el.closest(".card-grid")) {
    el.animate([{ opacity: 1 }, { opacity: 0 }], opts);
    return;
  }
  if (el.tagName === "TR") {
    for (const cell of Array.from(el.children) as HTMLElement[]) {
      const cs = getComputedStyle(cell);
      cell.animate(
        [
          { opacity: 1, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, borderBottomWidth: cs.borderBottomWidth },
          { opacity: 0, paddingTop: "0px", paddingBottom: "0px", borderBottomWidth: "0px" },
        ],
        opts,
      );
      for (const child of Array.from(cell.children) as HTMLElement[]) {
        const h = child.getBoundingClientRect().height;
        child.style.overflow = "hidden";
        child.animate([{ maxHeight: `${h}px` }, { maxHeight: "0px" }], opts);
      }
    }
    return;
  }
  const cs = getComputedStyle(el);
  const h = el.getBoundingClientRect().height;
  el.style.overflow = "hidden";
  el.animate(
    [
      { opacity: 1, maxHeight: `${h}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, marginBottom: cs.marginBottom },
      { opacity: 0, maxHeight: "0px", paddingTop: "0px", paddingBottom: "0px", marginTop: "0px", marginBottom: "0px" },
    ],
    opts,
  );
}

function highlight(el: HTMLElement) {
  const targets = el.tagName === "TR" ? (Array.from(el.children) as HTMLElement[]) : [el];
  for (const t of targets) {
    t.animate(
      [{ boxShadow: "inset 0 0 0 999px rgba(255, 196, 0, 0.28)" }, { boxShadow: "inset 0 0 0 999px rgba(255, 196, 0, 0)" }],
      { duration: HIGHLIGHT_MS, easing: "ease-out" },
    );
  }
}

type Job = { first: Map<HTMLElement, DOMRect>; leavingIds: Set<string>; scrollComp: number };

export function useSettledOrder<T>({
  target,
  live,
  getId,
  resetKey,
  describeDone,
}: {
  /** The list as the filters and sort want it right now. */
  target: T[];
  /** Every row, unfiltered: held rows always render from here, so their counts stay live. */
  live: T[];
  getId: (item: T) => string;
  /** Any change (sort, filters, search, header sort, deck...) settles at once, with no animation. */
  resetKey: string;
  /** Screen reader line when a held row stops passing the filter, e.g. "Izo covered, 4 of 4." */
  describeDone?: (item: T) => string;
}): { items: T[]; scope: SettledScope; liveRegion: ReactNode } {
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  const [message, setMessage] = useState("");
  const holds = useRef(new Map<string, Hold>());
  const leaving = useRef(new Set<string>());
  const order = useRef<string[]>([]);
  const resetRef = useRef(resetKey);
  const timer = useRef<number | undefined>(undefined);
  const leaveTimer = useRef<number | undefined>(undefined);
  const job = useRef<Job | null>(null);
  const hover = useRef<string | null>(null);
  const focus = useRef<{ id: string | null; input: boolean }>({ id: null, input: false });
  const pointerType = useRef("");
  const announcedDone = useRef(new Set<string>());

  const targetIds = useMemo(() => target.map(getId), [target, getId]);
  const targetSet = useMemo(() => new Set(targetIds), [targetIds]);
  const liveById = useMemo(() => new Map(live.map((i) => [getId(i), i])), [live, getId]);
  const latest = useRef({ targetIds, targetSet, liveById });
  latest.current = { targetIds, targetSet, liveById };

  if (resetRef.current !== resetKey) {
    resetRef.current = resetKey;
    holds.current.clear();
    leaving.current.clear();
    announcedDone.current.clear();
    order.current = [];
    job.current = null;
  }

  const pinnedSet = new Set<string>([...holds.current.keys(), ...leaving.current]);
  const displayedIds = computeDisplayedOrder({
    prev: order.current,
    target: targetIds,
    pinned: pinnedSet,
    live: new Set(liveById.keys()),
  });
  order.current = displayedIds;
  const items = displayedIds.map((id) => liveById.get(id)).filter((i): i is T => i !== undefined);

  const clearTimers = () => {
    window.clearTimeout(timer.current);
    window.clearTimeout(leaveTimer.current);
  };

  const settle = useCallback((animate: boolean) => {
    window.clearTimeout(timer.current);
    if (holds.current.size === 0) return;
    const { targetSet: tSet, targetIds: tIds } = latest.current;
    const before = order.current;
    const summary = settleSummary(before, tIds);
    const out = before.filter((id) => !tSet.has(id));
    holds.current.clear();
    announcedDone.current.clear();
    const shownIds = [...before];
    const text = settleAnnouncement(summary);
    setMessage(text);
    if (!animate || typeof document === "undefined") {
      if (typeof document !== "undefined") unfreezeColumns(shownIds);
      bump();
      return;
    }
    const first = new Map<HTMLElement, DOMRect>();
    for (const el of visibleRowElements()) first.set(el, el.getBoundingClientRect());
    unfreezeColumns(shownIds);
    // Rows above the viewport vanish at once and the scroll position is corrected; the others fade and collapse.
    let scrollComp = 0;
    const fading = new Set<string>();
    for (const id of out) {
      const el = Array.from(first.keys()).find((e) => e.dataset.rowId === id);
      const r = el ? first.get(el) : undefined;
      if (!r) continue;
      if (r.bottom <= 0) scrollComp += r.height;
      else if (r.top < window.innerHeight + NEAR_PX) fading.add(id);
    }
    leaving.current = fading;
    job.current = { first, leavingIds: fading, scrollComp };
    if (scrollComp > 0) document.documentElement.style.overflowAnchor = "none";
    bump();
    if (fading.size > 0) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = window.setTimeout(
        () => {
          leaving.current = new Set();
          bump();
        },
        (reducedMotion() ? REDUCED_MS : LEAVE_MS) + 30,
      );
    }
  }, []);

  const reschedule = useCallback(() => {
    window.clearTimeout(timer.current);
    const at = settleAt([...holds.current.values()]);
    if (at === null || at === Infinity) return;
    timer.current = window.setTimeout(
      () => {
        const next = settleAt([...holds.current.values()]);
        if (next !== null && next <= Date.now()) settle(true);
        else reschedule();
      },
      Math.max(0, at - Date.now()),
    );
  }, [settle]);

  const refreshEngagement = useCallback(() => {
    const now = Date.now();
    for (const [id, h] of holds.current) {
      const inside = hover.current === id;
      const focused = focus.current.id === id;
      if ((h.pointerInside || h.focusInside) && !inside && !focused) h.leftAt = now;
      h.pointerInside = inside;
      h.focusInside = focused;
      h.inputFocused = focused && focus.current.input;
    }
    reschedule();
  }, [reschedule]);

  const newHold = (id: string, now: number): Hold => ({
    ops: new Map(),
    scrollY: typeof window === "undefined" ? 0 : window.scrollY,
    lastInteraction: now,
    leftAt: now,
    pointerInside: hover.current === id,
    focusInside: focus.current.id === id,
    inputFocused: focus.current.id === id && focus.current.input,
    touch: false,
    bulk: false,
  });

  const markEdited = useCallback(
    (id: string, op?: RestoreOp) => {
      // A card that is not on this list (Price check, Add cards) has no row to hold.
      if (!order.current.includes(id)) return;
      const now = Date.now();
      if (holds.current.size === 0) freezeColumns([id]);
      let h = holds.current.get(id);
      if (!h) {
        h = newHold(id, now);
        holds.current.set(id, h);
      }
      if (op && !h.ops.has(op.key)) h.ops.set(op.key, op);
      h.lastInteraction = now;
      h.bulk = false;
      h.touch = pointerType.current === "touch" || (pointerType.current === "" && noHover());
      h.scrollY = window.scrollY;
      h.pointerInside = hover.current === id;
      h.focusInside = focus.current.id === id;
      h.inputFocused = focus.current.id === id && focus.current.input;
      if (!h.pointerInside && !h.focusInside) h.leftAt = now;
      leaving.current.delete(id);
      reschedule();
      bump();
    },
     
    [reschedule],
  );

  const markBulk = useCallback(
    (entries: { id: string; op?: RestoreOp }[]) => {
      const now = Date.now();
      if (holds.current.size === 0 && entries.some((e) => order.current.includes(e.id))) freezeColumns(entries.map((e) => e.id));
      for (const { id, op } of entries) {
        if (!order.current.includes(id)) continue;
        let h = holds.current.get(id);
        if (!h) {
          h = newHold(id, now);
          h.bulk = true;
          holds.current.set(id, h);
        }
        if (op && !h.ops.has(op.key)) h.ops.set(op.key, op);
        h.lastInteraction = now;
        if (!h.pointerInside && !h.focusInside) h.bulk = true;
        leaving.current.delete(id);
      }
      reschedule();
      bump();
    },
     
    [reschedule],
  );

  const holdAll = useCallback(() => markBulk(order.current.map((id) => ({ id }))), [markBulk]);

  const clearHold = useCallback(
    (id: string) => {
      if (!holds.current.delete(id)) return;
      announcedDone.current.delete(id);
      if (holds.current.size === 0) unfreezeColumns([id]);
      reschedule();
      bump();
    },
    [reschedule],
  );

  const undo = useCallback(
    (id: string) => {
      const h = holds.current.get(id);
      if (!h) return;
      const ops = [...h.ops.values()];
      h.ops.clear();
      h.lastInteraction = Date.now();
      reschedule();
      bump();
      for (const op of ops) void Promise.resolve(op.restore()).catch(() => undefined);
    },
    [reschedule],
  );

  // Pointer, focus and scroll watchers: one set of document listeners per list.
  useEffect(() => {
    const onOver = (e: PointerEvent) => {
      pointerType.current = e.pointerType || "mouse";
      hover.current = rowIdOf(e.target);
      refreshEngagement();
    };
    const onOut = (e: PointerEvent) => {
      hover.current = rowIdOf(e.relatedTarget);
      refreshEngagement();
    };
    const onDown = (e: PointerEvent) => {
      pointerType.current = e.pointerType || "mouse";
      if (e.pointerType !== "touch") return;
      const id = rowIdOf(e.target);
      const touching = [...holds.current.values()].some((h) => h.touch);
      if (touching && id && !holds.current.has(id)) settle(true);
      else if (id && holds.current.has(id)) {
        const h = holds.current.get(id)!;
        h.touch = true;
        h.lastInteraction = Date.now();
        h.scrollY = window.scrollY;
        reschedule();
      }
    };
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      focus.current = { id: rowIdOf(t), input: Boolean(t?.matches?.("input.owned")) };
      refreshEngagement();
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as HTMLElement | null;
      focus.current = { id: rowIdOf(next), input: Boolean(next?.matches?.("input.owned")) };
      refreshEngagement();
    };
    const onScroll = () => {
      for (const [id, h] of holds.current) {
        if (!h.touch) continue;
        const el = document.querySelector<HTMLElement>(rowSelector(id));
        const half = Math.max(24, (el?.getBoundingClientRect().height ?? 96) / 2);
        if (Math.abs(window.scrollY - h.scrollY) > half) {
          settle(true);
          return;
        }
      }
    };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("scroll", onScroll);
    };
  }, [refreshEngagement, reschedule, settle]);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(leaveTimer.current);
      unfreezeColumns(order.current);
    },
    [],
  );

  // A reset (sort, filter, search, header sort, deck) drops pending timers; the state itself was cleared during render.
  useEffect(() => {
    clearTimers();
    unfreezeColumns(order.current);
    document.documentElement.style.overflowAnchor = "";
     
  }, [resetKey]);

  // Screen reader: a held row that now passes no filter is "covered".
  const doneIds = [...holds.current.keys()].filter((id) => liveById.has(id) && !targetSet.has(id));
  const doneKey = doneIds.join("|");
  useEffect(() => {
    const now = new Set(doneIds);
    for (const id of [...announcedDone.current]) if (!now.has(id)) announcedDone.current.delete(id);
    for (const id of doneIds) {
      if (announcedDone.current.has(id)) continue;
      announcedDone.current.add(id);
      const item = liveById.get(id);
      const h = holds.current.get(id);
      if (item && describeDone) setMessage(`${describeDone(item)}${h && h.ops.size > 0 ? " Undo available." : ""}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneKey]);

  // Glide, fade and highlight after a settle commits; correct the scroll for rows that vanished above the viewport.
  useLayoutEffect(() => {
    const j = job.current;
    if (!j) return;
    job.current = null;
    const reduced = reducedMotion();
    if (j.scrollComp > 0) {
      window.scrollBy(0, -j.scrollComp);
      requestAnimationFrame(() => {
        document.documentElement.style.overflowAnchor = "";
      });
    }
    for (const [el, from] of j.first) {
      if (!el.isConnected) continue;
      const id = el.dataset.rowId ?? "";
      if (j.leavingIds.has(id)) {
        animateLeave(el, reduced);
        continue;
      }
      const to = el.getBoundingClientRect();
      const dy = from.top - to.top;
      const dx = from.left - to.left;
      if (Math.abs(dy) < 1 && Math.abs(dx) < 1) continue;
      if (!nearViewport(from) && !nearViewport(to)) continue;
      if (reduced) el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: REDUCED_MS, easing: "ease-out" });
      else if (el.closest(".card-grid")) el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: GLIDE_MS, easing: "ease-out" });
      else el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: GLIDE_MS, easing: "ease-out" });
      if (to.bottom > 0 && to.top < window.innerHeight) highlight(el);
    }
  });

  const scope = useMemo<SettledScope>(
    () => ({
      markEdited,
      markBulk,
      holdAll,
      clearHold,
      row: (id) => {
        const h = holds.current.get(id);
        if (!h) return null;
        return {
          done: latest.current.liveById.has(id) && !latest.current.targetSet.has(id),
          canUndo: h.ops.size > 0,
          undo: () => undo(id),
        };
      },
      pinned: () => new Set<string>([...holds.current.keys(), ...leaving.current]),
    }),
    // version: any hold change; targetSet: whether a held row still passes the filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, targetSet, markEdited, markBulk, holdAll, clearHold, undo],
  );

  const liveRegion = (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );

  return { items, scope, liveRegion };
}

/**
 * Header column sort on top of a held list: rows you are editing keep the place they had in the
 * column-sorted table, the rest follow the sort. Without a column sort the list is returned as is.
 */
export function useColumnOrder<T>(
  items: T[],
  sort: ColumnSort,
  getValue: (row: T, key: string) => ColumnValue,
  getId: (row: T) => string,
  scope: SettledScope | null,
): T[] {
  const prev = useRef<string[]>([]);
  if (!sort) {
    prev.current = items.map(getId);
    return items;
  }
  const sorted = sortByColumn(items, sort, getValue);
  const pinned = scope?.pinned() ?? new Set<string>();
  const byId = new Map(items.map((i) => [getId(i), i]));
  const ids = computeDisplayedOrder({
    prev: prev.current,
    target: sorted.map(getId),
    pinned,
    live: new Set(byId.keys()),
  });
  prev.current = ids;
  return ids.map((id) => byId.get(id)).filter((i): i is T => i !== undefined);
}
