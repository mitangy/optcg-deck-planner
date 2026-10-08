import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { briefFoldsAway, briefSeenKey, briefShown, briefStart } from "./matchBrief";

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

type PinnedProps = {
  you: string;
  opp: string;
  state: BriefState;
  collapsed: boolean;
  onToggle: () => void;
  onGet: () => void;
};

/**
 * The brief as it sits at the top of the Log Pose chat: a header row that folds the rest away, the text, and the
 * button that writes one. It never changes the board; it is part of the panel's own scroll.
 */
function PinnedBrief({ you, opp, state, collapsed, onToggle, onGet }: PinnedProps) {
  const busy = state.kind === "peek" || state.kind === "streaming";
  return (
    <section className="match-brief-pinned" aria-label="Matchup brief" data-collapsed={collapsed ? "true" : undefined}>
      <button type="button" className="mb-toggle" aria-expanded={!collapsed} onClick={onToggle}>
        <span className="mb-heading">
          <span className="mb-title">Matchup brief</span>
          <span className="mb-sub" title={`${you} vs ${opp}`}>
            {you} vs {opp}
          </span>
        </span>
        <svg className="mb-chevron" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {collapsed ? null : (
        <>
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
          {state.kind === "offer" || state.kind === "error" ? (
            <div className="mb-foot">
              <button type="button" className="btn btn-primary btn-sm" onClick={onGet}>
                {state.kind === "error" ? "Try again" : "Get brief"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
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
}): { shown: boolean; trigger: ReactNode; open: boolean; setOpen: (open: boolean) => void } {
  const { enabled, session, openPanel, closePanel, panelOpen } = useLogPose();
  const settings = useDuelSettings();
  const brief = o.source?.brief ?? null;
  const shown = briefShown({ ranked: o.source?.ranked ?? null, role: o.role, brief, logPoseEnabled: enabled, setting: settings.matchBrief });
  const [collapsed, setCollapsed] = useState(false);
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

  const open = shown && panelOpen;
  const setOpen = useCallback((next: boolean) => (next ? openPanel() : closePanel()), [openPanel, closePanel]);

  // Opens the Log Pose panel by itself once per room, during the mulligan, on a wide screen only (a phone's panel is
  // a sheet over the Keep and Mulligan buttons, so there the Brief button just shows its dot). It folds away when
  // the first turn starts, but only if it opened by itself and was left alone.
  const auto = useRef({ opened: false, touched: false });
  useEffect(() => {
    if (!shown || o.layout !== "desktop" || !o.roomMatchId || o.phase !== "mulligan" || readSeen(o.roomMatchId)) return;
    writeSeen(o.roomMatchId);
    auto.current = { opened: true, touched: false };
    openPanel({ quiet: true });
  }, [shown, o.layout, o.roomMatchId, o.phase, openPanel]);
  useEffect(() => {
    if (!auto.current.opened) return;
    if (!panelOpen) {
      auto.current.opened = false;
      return;
    }
    const touch = (e: Event) => {
      if ((e.target as Element | null)?.closest?.(".lp-panel")) auto.current.touched = true;
    };
    document.addEventListener("pointerdown", touch, true);
    document.addEventListener("keydown", touch, true);
    return () => {
      document.removeEventListener("pointerdown", touch, true);
      document.removeEventListener("keydown", touch, true);
    };
  }, [panelOpen]);
  useEffect(() => {
    if (briefFoldsAway({ auto: auto.current.opened, touched: auto.current.touched }, o.phase)) {
      auto.current.opened = false;
      closePanel();
    }
  }, [o.phase, closePanel]);

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
  const getBrief = useCallback(() => {
    written.current.add(contentKey);
    void stream(true);
  }, [contentKey, stream]);
  const toggle = useCallback(() => setCollapsed((c) => !c), []);
  // Kept as one element so the panel's copy only changes when what it shows does.
  const pinned = useMemo(
    () => (shown && brief ? <PinnedBrief you={you} opp={opp} state={state} collapsed={collapsed} onToggle={toggle} onGet={getBrief} /> : null),
    [shown, brief, you, opp, state, collapsed, toggle, getBrief],
  );
  useLogPosePage(shown && brief ? { page: "match-brief", label: `${you} vs ${opp}`, deck, starters: STARTERS, pinned } : null);

  if (!shown || !brief) return { shown: false, trigger: null, open: false, setOpen };

  const busy = state.kind === "peek" || state.kind === "streaming";

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

  return { shown: true, trigger, open, setOpen };
}
