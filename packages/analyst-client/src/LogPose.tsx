import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AUTO_PREFIX, type DeckContext } from "./client";
import { canAsk, gameMessageContext, type LogPoseAsk } from "./ask";
import { logPoseChrome } from "./chrome";
import type { DeckEditor } from "./proposals";
import { clampDockW, fitDock, readDock, readDockW, writeDock, writeDockW, type Dock, type DockSides } from "./panelDock";
import { compassRect, type Rect } from "./panelMotion";
import { SourceHooksContext, type SourceHooks } from "./Sources";
import { createSessionManager, type ChatSession, type SessionManager } from "./session";
import { GENERAL_SCOPE, type LogPoseScope } from "./scopes";
import { LogPoseCompass } from "./Compass";
import { LogPosePanel } from "./Panel";
import { useOwnedSlot, useRegisterSlot } from "./ownedSlot";
import { useChat, NOT_SENT } from "./useChat";
import { useCredit } from "./useCredit";
import { DRAWER_QUERY, useMedia } from "./useMedia";
import type { DockHosts, GameAskResult, LogPoseGame, LogPosePage, OwnClaude } from "./types";

export type { DockHosts, GameAskResult, LogPoseGame, LogPosePage, OwnClaude } from "./types";

type LogPoseValue = {
  /** null until the session endpoint answers. */
  enabled: boolean | null;
  apiBase: string;
  session: SessionManager;
  setPage: (owner: object, page: LogPosePage | null) => void;
  /** Registers the deck the page has open, so Apply cards for it can save changes. */
  setEditor: (owner: object, editor: DeckEditor | null) => void;
  /** Registers an element the panel renders into while it is set (a modal that would make the panel inert). */
  setLayer: (owner: object, el: HTMLElement | null) => void;
  /** Registers the live game the page has open. */
  setGame: (owner: object, game: LogPoseGame | null) => void;
  /** Opens the panel. `quiet` keeps the keyboard where it is (the composer isn't focused), for a panel that opens by itself. */
  openPanel: (opts?: { quiet?: boolean }) => void;
  closePanel: () => void;
  /** The panel is open (and not hidden by the page). It turns false the moment it is closed, while the panel is still shrinking into the compass. */
  panelOpen: boolean;
  /** The side the player docked the panel to (remembered), or null while it floats. */
  dock: Dock;
  setDock: (dock: Dock) => void;
  /** A board registers its side columns so the panel can dock into them (see useLogPoseDockHost). */
  setDockHost: (owner: object, hosts: DockHosts | null) => void;
  /** Log Pose can answer here: the session is enabled and the page doesn't hide it. */
  available: boolean;
  /** Opens the panel and, with an ask, puts that question to Log Pose. Returns false when it isn't available. */
  openLogPose: (ask?: LogPoseAsk) => boolean;
  /**
   * Sends a message about the live game as the player, without opening the panel (it waits for an answer in
   * flight first). `auto` marks it as the board's own (shown as a muted line, sent with `autopilot` so Log Pose
   * answers choices and plans on). Resolves when the answer has finished, with how it ended.
   */
  askGame: (text: string, opts?: { auto?: boolean; signal?: AbortSignal }) => Promise<GameAskResult>;
  /** Cancels the answer in flight, if any. */
  stopGameAsk: () => void;
};

const NO_HOOKS: SourceHooks = {};

const fallbackSession: SessionManager = {
  current: () => null,
  refresh: async () => ({ enabled: false }),
  getAuth: async () => null,
};

const LogPoseContext = createContext<LogPoseValue>({
  enabled: false,
  apiBase: "",
  session: fallbackSession,
  setPage: () => {},
  setEditor: () => {},
  setLayer: () => {},
  setGame: () => {},
  openPanel: () => {},
  closePanel: () => {},
  panelOpen: false,
  dock: null,
  setDock: () => {},
  setDockHost: () => {},
  available: false,
  openLogPose: () => false,
  askGame: async () => NOT_SENT,
  stopGameAsk: () => {},
});

/** A function that asks Log Pose a question and opens its panel, or null while Log Pose can't answer (signed out, not enabled, hidden page). */
export function useLogPoseAsk(): ((ask: LogPoseAsk) => void) | null {
  const { available, openLogPose } = useContext(LogPoseContext);
  return useMemo(() => (available ? (ask: LogPoseAsk) => void openLogPose(ask) : null), [available, openLogPose]);
}

/** Whether chat is on for this user (false outside a provider), plus the session for review streams. */
export function useLogPose() {
  return useContext(LogPoseContext);
}

/** Registers the page's context and starter prompts while the calling component is mounted. */
export function useLogPosePage(page: LogPosePage | null) {
  const { setPage } = useContext(LogPoseContext);
  const { pinned, ...plain } = page ?? {};
  const key = page ? JSON.stringify(plain) : "";
  const value = useMemo(() => (key ? { ...(JSON.parse(key) as LogPosePage), pinned } : null), [key, pinned]);
  useRegisterSlot(setPage, value);
}

/**
 * Registers the deck the calling page has open while it is mounted (null for none). Unlike the page context this
 * is kept as a value, not through JSON, because it carries the app's save function: memoize the editor so it
 * only changes when the deck does.
 */
export function useLogPoseDeckEditor(editor: DeckEditor | null) {
  const { setEditor } = useContext(LogPoseContext);
  useRegisterSlot(setEditor, editor);
}

/**
 * Lets the panel open inside a modal (e.g. an enlarged card) instead of behind it: while `el` is set, the panel
 * renders into it, so the modal's focus trap and inert page leave it usable. Escape closes the panel before the modal.
 * The panel sets `html[data-lp-layer]` (the side it is on) and `--lp-layer-w` (its width) so the modal can make room.
 */
export function useLogPoseLayer(el: HTMLElement | null) {
  const { setLayer } = useContext(LogPoseContext);
  useRegisterSlot(setLayer, el);
}

/**
 * Registers the live game the calling page shows while it is mounted (null for none). Kept as a value like the
 * deck editor: memoize it, and let `context()` read the latest game from a ref.
 */
export function useLogPoseGame(game: LogPoseGame | null) {
  const { setGame } = useContext(LogPoseContext);
  useRegisterSlot(setGame, game);
}

/**
 * The docking state, for a board that shows Log Pose in a side column: `dock` is the side the player chose, `open`
 * whether the panel is open. Render a host element in that column only while both hold (so a closed panel leaves
 * no empty slot), and register it with `useLogPoseDockHost`.
 */
export function useLogPoseDock() {
  const { dock, panelOpen, setDock } = useContext(LogPoseContext);
  return { dock, open: panelOpen, setDock };
}

/** Registers the board's dock hosts while the calling component is mounted (see DockHosts). */
export function useLogPoseDockHost(columns: boolean, left: HTMLElement | null, right: HTMLElement | null, sides?: DockSides) {
  const { setDockHost } = useContext(LogPoseContext);
  const sideL = sides?.left;
  const sideR = sides?.right;
  const value = useMemo<DockHosts>(
    () => ({ columns, left, right, sides: sideL === undefined || sideR === undefined ? undefined : { left: sideL, right: sideR } }),
    [columns, left, right, sideL, sideR],
  );
  useRegisterSlot(setDockHost, value);
}

/**
 * Mount once around the app. Asks the API whether chat is on for this user and, when it is,
 * shows the compass launcher and the chat panel (unless `hidden`, e.g. during a match).
 */
export function LogPoseProvider({
  apiBase,
  hidden = false,
  launcher = true,
  defaultPage = null,
  account,
  sources,
  ownClaude,
  children,
}: {
  apiBase: string;
  /** Hide the compass and panel (e.g. on a live match); the chat keeps its state. */
  hidden?: boolean;
  /** Show the compass (default). Off: the panel still opens (e.g. from a button on the page) but no launcher is drawn. */
  launcher?: boolean;
  /** Page info for routes whose page component doesn't call useLogPosePage. */
  defaultPage?: LogPosePage | null;
  /** Who is signed in, when the app knows (e.g. user id): the session is asked again when it changes. */
  account?: string | number | null;
  /** Links and card data for the sources Log Pose cites (all optional). */
  sources?: SourceHooks;
  /** Where "Use Log Pose in your own Claude" goes for a player out of credit (their personal connector). Without it the button isn't shown. */
  ownClaude?: OwnClaude;
  children: ReactNode;
}) {
  const [session, setSession] = useState<ChatSession | null>(null);
  const manager = useMemo(() => createSessionManager(apiBase, setSession), [apiBase]);
  useEffect(() => {
    void manager.refresh();
  }, [manager, account]);
  const enabled = session ? session.enabled : null;

  const [page, setPage] = useOwnedSlot<LogPosePage>();

  const [editor, setEditor] = useOwnedSlot<DeckEditor>();

  const [open, setOpen] = useState(false);
  // The panel stays on screen after `open` turns false, while it shrinks into the compass.
  const [mounted, setMounted] = useState(false);
  const openRef = useRef(open);
  openRef.current = open && !hidden;
  const [unread, setUnread] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const compassAt = useRef<Rect | null>(null);
  /** Remembers where the compass is as the panel opens, so the panel grows out of it. */
  const noteCompass = () => {
    const r = document.querySelector(".lp-compass")?.getBoundingClientRect();
    compassAt.current = r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
  };
  const isOpen = useCallback(() => openRef.current, []);
  const markUnread = useCallback(() => setUnread(true), []);
  const creditState = useCredit(apiBase, enabled === true, account);
  const creditHooks = useMemo(() => ({ apply: creditState.apply, refuse: creditState.refuse, refresh: creditState.refresh }), [creditState.apply, creditState.refuse, creditState.refresh]);
  const [game, setGame] = useOwnedSlot<LogPoseGame>();

  const gameRef = useRef<LogPoseGame | null>(null);
  // The chat this page belongs to: the live game's match, else the page's deck or match, else the general chat.
  const activeKey = game?.scope?.key ?? page?.scope?.key ?? defaultPage?.scope?.key ?? GENERAL_SCOPE.key;
  const activeTitle = game?.scope?.title ?? page?.scope?.title ?? defaultPage?.scope?.title ?? GENERAL_SCOPE.title;
  const active = useMemo<LogPoseScope>(() => ({ key: activeKey, title: activeTitle }), [activeKey, activeTitle]);
  const chat = useChat(apiBase, manager, isOpen, markUnread, creditHooks, gameRef, active);
  const chatRef = useRef(chat);
  chatRef.current = chat;

  const available = canAsk(enabled, hidden);
  const [request, setRequest] = useState<(LogPoseAsk & { nonce: number }) | null>(null);
  const nonce = useRef(0);
  const openLogPose = useCallback(
    (ask?: LogPoseAsk) => {
      if (!available) return false;
      if (ask) setRequest({ ...ask, nonce: ++nonce.current });
      if (!openRef.current) noteCompass();
      setOpen(true);
      setQuiet(false);
      setUnread(false);
      return true;
    },
    [available],
  );
  const handled = useCallback(() => setRequest(null), []);
  const openPanel = useCallback(
    (opts?: { quiet?: boolean }) => {
      if (!openRef.current) noteCompass();
      setOpen(true);
      setQuiet(opts?.quiet === true);
      setUnread(false);
      // Not on yet: ask again, so a player approved while this tab was open lands in the chat.
      if (!manager.current()?.enabled) void manager.refresh();
      // A brief or review may have spent credit since the panel was last open.
      else creditState.refresh();
    },
    [manager, creditState.refresh],
  );

  const closePanel = useCallback(() => setOpen(false), []);
  const exited = useCallback(() => {
    if (!openRef.current) setMounted(false);
  }, []);

  // Docking (desktop only): a side the player chose, how wide the strip is outside a game, and the board's side columns.
  const wideEnough = useMedia(DRAWER_QUERY);
  const [dock, setDockState] = useState<Dock>(() => readDock());
  const [dockW, setDockW] = useState(() => readDockW());
  const setDock = useCallback((next: Dock) => {
    setDockState(next);
    writeDock(next);
  }, []);
  const commitDockW = useCallback((w: number) => {
    const v = clampDockW(w, window.innerWidth);
    setDockW(v);
    writeDockW(v);
  }, []);
  const [hosts, setDockHost] = useOwnedSlot<DockHosts>();
  const inGame = hosts !== null;
  const dockable = wideEnough && (!inGame || hosts.columns);
  const dockedTo: Dock = dockable ? fitDock(dock, inGame ? hosts.sides : undefined) : null;
  const embedded = dockedTo && hosts ? hosts[dockedTo] : null;

  const [layer, setLayer] = useOwnedSlot<HTMLElement>();

  gameRef.current = game;
  const pageNow = page ?? defaultPage;
  const pageRef = useRef(pageNow);
  pageRef.current = pageNow;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const askGame = useCallback(async (text: string, opts?: { auto?: boolean; signal?: AbortSignal }): Promise<GameAskResult> => {
    const auto = opts?.auto === true;
    const signal = opts?.signal;
    // An answer may still be streaming (the player's own request, whose plan just started): wait for it, then send.
    for (;;) {
      if (signal?.aborted) return { ...NOT_SENT, aborted: true };
      if (!chatRef.current.busyNow()) break;
      if (!(await chatRef.current.whenIdle(signal))) return { ...NOT_SENT, aborted: true };
    }
    // The match's chat must be the one on show before the message goes (the panel may never have been opened).
    await chatRef.current.sync();
    if (signal?.aborted) return { ...NOT_SENT, aborted: true };
    if (enabledRef.current !== true) return NOT_SENT;
    // The game as it is now, whatever the chip says: the board asked, so the chip's × doesn't apply.
    const context = gameMessageContext(pageRef.current, gameRef.current, false);
    if (!context?.game) return NOT_SENT;
    const sent = auto ? { ...context, game: { ...context.game, autopilot: true } } : context;
    return chatRef.current.send(auto ? `${AUTO_PREFIX}${text}` : text, sent, { auto });
  }, []);
  const stopGameAsk = useCallback(() => chatRef.current.stop(), []);

  const value = useMemo<LogPoseValue>(
    () => ({ enabled, apiBase, session: manager, setPage, setEditor, setLayer, setGame, openPanel, closePanel, panelOpen: open && !hidden, dock, setDock, setDockHost, available, openLogPose, askGame, stopGameAsk }),
    [enabled, apiBase, manager, setPage, setEditor, setLayer, setGame, openPanel, closePanel, open, hidden, dock, setDock, setDockHost, available, openLogPose, askGame, stopGameAsk],
  );

  // A panel left open on a page that hides Log Pose must not come back on the next one.
  useEffect(() => {
    if (hidden) {
      setOpen(false);
      setMounted(false);
    }
  }, [hidden]);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  // No panel to play the closing animation on (the session went away): don't keep the compass hidden.
  useEffect(() => {
    if (!open && mounted && !session) setMounted(false);
  }, [open, mounted, session]);

  // Signed-in players who can ask for access get the compass too, opening a request form instead of the chat.
  const chatOn = enabled === true;
  const requestable = session !== null && !session.enabled && session.access !== undefined;
  const chrome = logPoseChrome({ enabled, hidden, launcher, open: open || mounted, requestable });

  // A panel docked to the screen edge (outside a game) keeps the page out from under it: the page gets room on that side.
  const edgeDock = chrome.panel && !inGame ? dockedTo : null;
  useEffect(() => {
    if (!edgeDock) return;
    const root = document.documentElement;
    root.dataset.lpDock = edgeDock;
    root.style.setProperty("--lp-dock-w", `${dockW}px`);
    return () => {
      delete root.dataset.lpDock;
      root.style.removeProperty("--lp-dock-w");
    };
  }, [edgeDock, dockW]);
  return (
    <LogPoseContext.Provider value={value}>
      <SourceHooksContext.Provider value={sources ?? NO_HOOKS}>
        {children}
        {chrome.compass ? (
          <LogPoseCompass
            working={chat.busy}
            unread={unread}
            requests={session?.enabled ? (session.pendingRequests ?? 0) : 0}
            requestOnly={!chatOn}
            onClick={() => openPanel()}
          />
        ) : null}
        {chrome.panel && session ? (
          <LogPosePanel
            page={page ?? defaultPage}
            active={active}
            editor={editor}
            game={game}
            chat={chat}
            session={session}
            credit={creditState.credit}
            ownClaude={ownClaude}
            onCreditChanged={creditState.refresh}
            apiBase={apiBase}
            refreshSession={() => void manager.refresh()}
            onClose={closePanel}
            motion={{ closing: !open, onExited: exited, origin: () => compassAt.current ?? compassRect({ w: window.innerWidth, h: window.innerHeight }) }}
            dockState={{ dock: dockedTo, canDock: dockable, inGame, sides: hosts?.sides, embedded, layer, dockW, onDockW: setDockW, onCommitDockW: commitDockW, onDock: setDock }}
            quiet={quiet}
            request={request}
            onRequestHandled={handled}
          />
        ) : null}
      </SourceHooksContext.Provider>
    </LogPoseContext.Provider>
  );
}
