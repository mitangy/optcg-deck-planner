import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AnalystError,
  CitedAnswer,
  errorText,
  placeAt,
  streamAnalyst,
  useLogPose,
  useLogPosePage,
  type PlacedCitation,
} from "@optcg/analyst-client";
import { lookupCard } from "../cards/atlas";
import { deckContext, setBoardBrief } from "../logPose";
import type { BriefTicketWire } from "../net/protocol";
import { useDuelSettings } from "../settings";
import { briefOpenAfter, briefSeenKey, briefShown, briefStart, type BriefOpen } from "./matchBrief";

export type BriefLayout = "desktop" | "portrait" | "landscape";

type BriefState =
  | { kind: "peek" }
  | { kind: "offer" }
  | { kind: "streaming"; text: string; citations: PlacedCitation[]; status: string }
  | { kind: "ready"; text: string; citations: PlacedCitation[] }
  | { kind: "error"; text: string; citations: PlacedCitation[]; message: string };

const STARTERS = ["What should I mulligan for?", "What are their key turns?", "How do I play around their best cards?"];

/** Room ids whose brief has opened by itself, for browsers without sessionStorage. */
const seenInMemory = new Set<string>();

function readSeen(roomMatchId: string): boolean {
  if (seenInMemory.has(roomMatchId)) return true;
  try {
    return globalThis.sessionStorage?.getItem(briefSeenKey(roomMatchId)) === "1";
  } catch {
    return false;
  }
}

function writeSeen(roomMatchId: string): void {
  seenInMemory.add(roomMatchId);
  try {
    globalThis.sessionStorage?.setItem(briefSeenKey(roomMatchId), "1");
  } catch {
    /* kept in memory only */
  }
}

function CompassGlyph() {
  return (
    <svg className="hud-brief-icon" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="7.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M13.2 6.8 11.4 11.4 6.8 13.2 8.6 8.6z" fill="currentColor" />
    </svg>
  );
}

type Rect = { top: number; left?: number; right?: number; width: number; maxHeight: number };

/** Where the fixed card sits: over the right-hand side panels (desktop) or under the top bar (phone portrait). */
function useCardRect(open: boolean, layout: BriefLayout): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useLayoutEffect(() => {
    if (!open || layout === "landscape") {
      setRect(null);
      return;
    }
    const bar = () => document.querySelector<HTMLElement>(".arena .hud-bar")?.getBoundingClientRect().bottom ?? 0;
    const measure = () => {
      if (layout === "portrait") {
        setRect({ top: bar() + 8, left: 16, right: 16, width: 0, maxHeight: Math.min(window.innerHeight * 0.38, 320) });
        return;
      }
      const col = document.querySelector<HTMLElement>('[data-panel-col="right"]');
      const r = col?.getBoundingClientRect();
      if (r && r.width > 0) setRect({ top: r.top, left: r.left, width: r.width, maxHeight: Math.min(r.height * 0.7, 520) });
      else setRect({ top: bar() + 8, right: 16, width: 360, maxHeight: Math.min(window.innerHeight * 0.6, 520) });
    };
    measure();
    window.addEventListener("resize", measure);
    const col = layout === "desktop" ? document.querySelector('[data-panel-col="right"]') : null;
    const ro = col && typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (col && ro) ro.observe(col);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [open, layout]);
  return rect;
}

/**
 * The Log Pose matchup brief for a casual or practice game: a Brief button for the top bar (or the landscape
 * rail) and a dismissible card that never moves the board. Everything it is about comes from the game server's
 * signed ticket; the analyst checks it again, and a ranked game never gets one. Nothing renders (and no
 * request is made) unless `briefShown` says so.
 */
export function useMatchBrief(o: {
  source: { brief: BriefTicketWire | null; ranked: boolean | null } | null | undefined;
  role: "player" | "spectator";
  roomMatchId: string | null;
  phase: string | null | undefined;
  over: boolean;
  layout: BriefLayout;
}): { shown: boolean; trigger: ReactNode; card: ReactNode; landscapeBody: ReactNode; open: boolean; setOpen: (open: boolean) => void } {
  const { enabled, session, openPanel } = useLogPose();
  const settings = useDuelSettings();
  const brief = o.source?.brief ?? null;
  const shown = briefShown({ ranked: o.source?.ranked ?? null, role: o.role, brief, logPoseEnabled: enabled, setting: settings.matchBrief });
  const [ui, setUi] = useState<BriefOpen>({ open: false, autoClosed: false });
  const [state, setState] = useState<BriefState>({ kind: "peek" });
  const abort = useRef<AbortController | null>(null);
  const ticketRef = useRef<string | null>(null);
  ticketRef.current = brief?.ticket ?? null;
  const autoRef = useRef(settings.matchBriefAuto);
  autoRef.current = settings.matchBriefAuto;
  /** The matchups already written automatically in this visit: a brief is written at most once per game by itself. */
  const written = useRef<Set<string>>(new Set());
  // The ticket is new on every reconnect, but it is the same brief while the leaders and deck are.
  const contentKey = brief ? `${brief.leaderId}|${brief.opponentId}|${brief.deck.join(",")}` : "";

  const stream = useCallback(
    async (generate: boolean): Promise<{ cached: boolean; failed: boolean }> => {
      const ticket = ticketRef.current;
      if (!ticket) return { cached: false, failed: true };
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      let text = "";
      let citations: PlacedCitation[] = [];
      let failure: string | null = null;
      let cached = false;
      const live = generate;
      if (generate) setState({ kind: "streaming", text: "", citations: [], status: "" });
      try {
        await streamAnalyst(
          session,
          "/brief",
          { ticket, generate },
          {
            onStatus: (status) => live && setState((s) => (s.kind === "streaming" ? { ...s, status } : s)),
            onText: (delta) => {
              text += delta;
              if (live) setState((s) => (s.kind === "streaming" ? { ...s, text } : s));
            },
            onCite: (cites) => {
              citations = [...citations, ...placeAt(cites, text.length)];
              if (live) setState((s) => (s.kind === "streaming" ? { ...s, citations } : s));
            },
            onDone: (d) => {
              cached = d.cached === true;
            },
            onError: (e) => {
              failure = errorText(e);
            },
          },
          ctrl.signal,
        );
      } catch (e) {
        if (ctrl.signal.aborted) return { cached: false, failed: true };
        failure = e instanceof AnalystError ? errorText(e) : errorText({});
      }
      if (abort.current !== ctrl) return { cached: false, failed: true };
      abort.current = null;
      if (failure || (!cached && !live) || !text.trim()) {
        if (failure || live) {
          setState({ kind: "error", text, citations, message: failure ?? "Log Pose didn't write a brief this time." });
          return { cached, failed: true };
        }
        return { cached: false, failed: false };
      }
      setState({ kind: "ready", text, citations });
      return { cached: true, failed: false };
    },
    [session],
  );

  // A free look for a saved brief; a new one is written only on the tap (or with the automatic setting on).
  useEffect(() => {
    if (!shown) return;
    setState({ kind: "peek" });
    let live = true;
    void stream(false).then((r) => {
      if (!live || r.failed || r.cached) return;
      const action = briefStart({ cached: false, auto: autoRef.current, requested: false });
      if (action === "generate" && !written.current.has(contentKey)) {
        written.current.add(contentKey);
        void stream(true);
      } else setState({ kind: "offer" });
    });
    return () => {
      live = false;
      abort.current?.abort();
      abort.current = null;
    };
  }, [shown, contentKey, stream]);

  // Opens by itself once per room, during the mulligan; folds away when the first turn starts.
  useEffect(() => {
    if (!shown || !o.roomMatchId || o.phase !== "mulligan" || readSeen(o.roomMatchId)) return;
    writeSeen(o.roomMatchId);
    setUi((p) => ({ ...p, open: true }));
  }, [shown, o.roomMatchId, o.phase]);
  useEffect(() => {
    setUi((p) => briefOpenAfter(p, o.phase));
  }, [o.phase]);

  const open = shown && ui.open;
  const setOpen = useCallback((next: boolean) => setUi((p) => ({ ...p, open: next })), []);

  // Log Pose may open over the board only while a brief is up.
  useEffect(() => {
    setBoardBrief(shown);
    return () => setBoardBrief(false);
  }, [shown]);

  const you = brief ? lookupCard(brief.leaderId).name || brief.leaderId : "";
  const opp = brief ? lookupCard(brief.opponentId).name || brief.opponentId : "";
  const deck = useMemo(
    () => (brief ? deckContext({ name: "This game", leaderId: brief.leaderId, cards: brief.deck }) : undefined),
    [brief],
  );
  useLogPosePage(shown && brief ? { page: "match-brief", label: `${you} vs ${opp}`, deck, starters: STARTERS } : null);

  const rect = useCardRect(open && o.layout !== "landscape", o.layout);

  useEffect(() => {
    if (!open || o.layout === "landscape") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, o.layout, setOpen]);

  if (!shown || !brief) return { shown: false, trigger: null, card: null, landscapeBody: null, open: false, setOpen };

  const busy = state.kind === "peek" || state.kind === "streaming";
  const ask = () => {
    openPanel();
  };
  const getBrief = () => {
    written.current.add(contentKey);
    void stream(true);
  };

  const body = (
    <>
      <div className="mb-head">
        <div className="mb-heading">
          <h2 className="mb-title">Matchup brief</h2>
          <p className="mb-sub" title={`${you} vs ${opp}`}>
            {you} vs {opp}
          </p>
        </div>
        <button type="button" className="mb-close" aria-label="Close matchup brief" onClick={() => setOpen(false)}>
          ×
        </button>
      </div>
      <div className="mb-body" data-state={state.kind} aria-busy={busy}>
        {state.kind === "peek" ? (
          <p className="mb-status" role="status">
            <span className="lp-status-dot" aria-hidden="true" />
            <span>Checking for a saved brief…</span>
          </p>
        ) : null}
        {state.kind === "offer" ? (
          <p className="mb-note">No brief saved for this matchup yet. Log Pose can write one; the game goes on meanwhile.</p>
        ) : null}
        {state.kind === "streaming" ? (
          <p className="mb-status" role="status">
            <span className="lp-status-dot" aria-hidden="true" />
            <span>{state.status ? `${state.status}… you can keep playing` : "Writing… you can keep playing"}</span>
          </p>
        ) : null}
        {state.kind === "streaming" || state.kind === "ready" || state.kind === "error"
          ? state.text ? (
              <CitedAnswer text={state.text} citations={state.citations} done={state.kind !== "streaming"} />
            ) : null
          : null}
        {state.kind === "error" ? (
          <p className="mb-error" role="alert">
            {state.message}
          </p>
        ) : null}
      </div>
      <div className="mb-foot">
        {state.kind === "offer" || state.kind === "error" ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={getBrief}>
            {state.kind === "error" ? "Try again" : "Get brief"}
          </button>
        ) : null}
        <button type="button" className="btn btn-secondary btn-sm" onClick={ask}>
          Ask Log Pose
        </button>
      </div>
    </>
  );

  const style: CSSProperties | undefined = rect
    ? { top: rect.top, left: rect.left, right: rect.right, width: rect.width || undefined, maxHeight: rect.maxHeight }
    : undefined;
  const card =
    open && o.layout !== "landscape" && typeof document !== "undefined"
      ? createPortal(
          <section className="match-brief logpose" data-layout={o.layout} style={style} role="region" aria-label="Matchup brief">
            {body}
          </section>,
          document.body,
        )
      : null;

  const hidden = o.over;
  const label = "Matchup brief";
  const trigger =
    o.layout === "landscape" ? null : (
      <button
        type="button"
        className={`hud-brief-btn${o.layout === "desktop" ? " hud-brief-text" : " hud-icon-btn"}`}
        aria-label={label}
        aria-expanded={open}
        title={label}
        data-busy={busy ? "true" : undefined}
        style={hidden ? { visibility: "hidden" } : undefined}
        tabIndex={hidden ? -1 : undefined}
        aria-hidden={hidden ? true : undefined}
        onClick={() => setOpen(!open)}
      >
        <CompassGlyph />
        {o.layout === "desktop" ? <span className="hud-brief-label">Brief</span> : null}
        <span className="hud-brief-dot" aria-hidden="true" />
      </button>
    );

  return { shown: true, trigger, card, landscapeBody: <div className="match-brief-lp logpose">{body}</div>, open, setOpen };
}
