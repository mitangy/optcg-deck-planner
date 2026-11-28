import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AUTO_PREFIX, type DeckContext } from "./client";
import { canAsk, gameMessageContext, type LogPoseAsk } from "./ask";
import { logPoseChrome } from "./chrome";
import type { DeckEditor } from "./proposals";
import { clampDockW, fitDock, readDock, readDockW, writeDock, writeDockW, type Dock, type DockSides } from "./panelDock";
import { compassRect, type Rect } from "./panelMotion";
import { SourceHooksContext, type SourceHooks } from "./sourceHooks";
import { createSessionManager, type ChatSession, type SessionManager } from "./session";
import { GENERAL_SCOPE, type LogPoseScope } from "./scopes";
import { LogPoseCompass } from "./Compass";
import { useOwnedSlot, useRegisterSlot } from "./ownedSlot";
import { useChat, NOT_SENT } from "./useChat";
import { useCredit } from "./useCredit";
import { DRAWER_QUERY } from "./mediaQueries";
import { useMediaQuery } from "@optcg/ui/hooks";
import type { DockHosts, GameAskResult, LogPoseGame, LogPosePage, OwnClaude } from "./types";

export type { DockHosts, GameAskResult, LogPoseGame, LogPosePage, OwnClaude } from "./types";

type LogPoseValue = {
  enabled: boolean | null;
  apiBase: string;
  session: SessionManager;
  setPage: (owner: object, page: LogPosePage | null) => void;
  setEditor: (owner: object, editor: DeckEditor | null) => void;
  setLayer: (owner: object, el: HTMLElement | null) => void;
  setGame: (owner: object, game: LogPoseGame | null) => void;
  openPanel: (opts?: { quiet?: boolean }) => void;
  closePanel: () => void;
  /** Turns false the moment the panel is closed, while it is still shrinking into the compass. */
  panelOpen: boolean;
  dock: Dock;
  setDock: (dock: Dock) => void;
  setDockHost: (owner: object, hosts: DockHosts | null) => void;
  available: boolean;
  openLogPose: (ask?: LogPoseAsk) => boolean;
  askGame: (text: string, opts?: { auto?: boolean; signal?: AbortSignal }) => Promise<GameAskResult>;
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

export function useLogPoseAsk(): ((ask: LogPoseAsk) => void) | null {
  const { available, openLogPose } = useContext(LogPoseContext);
  return useMemo(() => (available ? (ask: LogPoseAsk) => void openLogPose(ask) : null), [available, openLogPose]);
}

export function useLogPose() {
  return useContext(LogPoseContext);
}

export function useLogPosePage(page: LogPosePage | null) {
  const { setPage } = useContext(LogPoseContext);
  const { pinned, ...plain } = page ?? {};
  const key = page ? JSON.stringify(plain) : "";
  const value = useMemo(() => (key ? { ...(JSON.parse(key) as LogPosePage), pinned } : null), [key, pinned]);
  useRegisterSlot(setPage, value);
}

// Kept as a value (it carries the app's save function), so memoize the editor to change only when the deck does.
export function useLogPoseDeckEditor(editor: DeckEditor | null) {
  const { setEditor } = useContext(LogPoseContext);
  useRegisterSlot(setEditor, editor);
}

export function useLogPoseLayer(el: HTMLElement | null) {
  const { setLayer } = useContext(LogPoseContext);
  useRegisterSlot(setLayer, el);
}

// Kept as a value like the deck editor: memoize it and let `context()` read the latest game from a ref.
export function useLogPoseGame(game: LogPoseGame | null) {
  const { setGame } = useContext(LogPoseContext);
  useRegisterSlot(setGame, game);
}

export function useLogPoseDock() {
  const { dock, panelOpen, setDock } = useContext(LogPoseContext);
  return { dock, open: panelOpen, setDock };
}

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

// The panel (chat, markdown, citations) is most of this package's weight and only matters once someone opens Log Pose.
const LogPosePanel = lazy(() => import("./Panel").then((m) => ({ default: m.LogPosePanel })));

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
  hidden?: boolean;
  launcher?: boolean;
  defaultPage?: LogPosePage | null;
  account?: string | number | null;
  sources?: SourceHooks;
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

  const wideEnough = useMediaQuery(DRAWER_QUERY);
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

  const chatOn = enabled === true;
  const requestable = session !== null && !session.enabled && session.access !== undefined;
  const chrome = logPoseChrome({ enabled, hidden, launcher, open: open || mounted, requestable });

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
          <Suspense fallback={null}>
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
          </Suspense>
        ) : null}
      </SourceHooksContext.Provider>
    </LogPoseContext.Provider>
  );
}
