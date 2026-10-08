import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AnalystError,
  errorText,
  fetchThread,
  streamAnalyst,
  type ChatContext,
  type ChatRequest,
  type DeckContext,
  type GameChatContext,
  type TurnPlan,
} from "./client";
import { askContext, canAsk, gameMessageContext, messageContext, requestAction, type LogPoseAsk } from "./ask";
import { placeAt, type Citation, type PlacedCitation } from "./citations";
import { logPoseChrome } from "./chrome";
import { DeckEditCard } from "./DeckEditCard";
import { isEmptyAnswer, type DeckEditor, type DeckEditProposal } from "./proposals";
import { DockHandle, ResizeHandles, SheetGrip, useDrawerSize, useHeaderMove, useSheetHeight, type DockPreview } from "./PanelResize";
import { clampDockW, DOCK_W_DEFAULT, readDock, readDockW, writeDock, writeDockW, type Dock } from "./panelDock";
import { compassRect, growOrigin, popFrames, POP_MS, slideFrames, type Rect } from "./panelMotion";
import { CitedAnswer, SourceHooksContext, type SourceHooks } from "./Sources";
import { RequestAccessView, RequestsList } from "./AccessViews";
import { ModelPicker } from "./ModelPicker";
import { createSessionManager, type ChatSession, type SessionManager } from "./session";
import { readThreadId, writeThreadId } from "./threadStore";

/** What the current page tells Log Pose: shown as the "Looking at" chip and sent with each message. */
export type LogPosePage = {
  /** Short page id sent as context.page (e.g. "deck-editor"). */
  page?: string;
  /** Chip text: "Looking at: <label>". Without it no chip is shown and no deck / match is sent. */
  label?: string;
  deck?: DeckContext;
  matchId?: string;
  /** Prompt chips offered while the thread is empty. */
  starters?: string[];
  /**
   * Content the page keeps at the top of the chat, above the messages (the matchup brief on a board). Passed by
   * value, not through JSON: memoize it so it only changes when what it shows does.
   */
  pinned?: ReactNode;
};

/**
 * A live game the page lets Log Pose see and plan for (the duel board in a casual or practice game). While one is
 * registered every message carries `context.game`, taken when the message is sent.
 */
export type LogPoseGame = {
  /** Chip text: "Looking at: <label>". */
  label: string;
  /** The game as it is right now, or null when it can't be read (the message goes without it). */
  context: () => GameChatContext | null;
  /** The Turn plan card for a plan under an answer. `ask` sends a message as the player. */
  renderPlan: (plan: TurnPlan, ctx: { busy: boolean; ask: (text: string) => void }) => ReactNode;
  /** Prompt chips offered while the thread is empty, instead of the page's. */
  starters?: string[];
};

/**
 * Where a game board lets Log Pose dock: `columns` is false when the board has no side columns (narrow window,
 * landscape phone), and the panel then floats. `left` / `right` are the elements the panel renders into.
 */
export type DockHosts = { columns: boolean; left: HTMLElement | null; right: HTMLElement | null };

type LogPoseValue = {
  /** null until the session endpoint answers. */
  enabled: boolean | null;
  apiBase: string;
  session: SessionManager;
  setPage: (owner: object, page: LogPosePage | null) => void;
  /** Registers the deck the page has open, so Apply cards for it can save changes. */
  setEditor: (owner: object, editor: DeckEditor | null) => void;
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
  setGame: () => {},
  openPanel: () => {},
  closePanel: () => {},
  panelOpen: false,
  dock: null,
  setDock: () => {},
  setDockHost: () => {},
  available: false,
  openLogPose: () => false,
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
  const owner = useRef({}).current;
  const { pinned, ...plain } = page ?? {};
  const key = page ? JSON.stringify(plain) : "";
  useEffect(() => {
    setPage(owner, key ? { ...(JSON.parse(key) as LogPosePage), pinned } : null);
    return () => setPage(owner, null);
  }, [key, pinned, owner, setPage]);
}

/**
 * Registers the deck the calling page has open while it is mounted (null for none). Unlike the page context this
 * is kept as a value, not through JSON, because it carries the app's save function: memoize the editor so it
 * only changes when the deck does.
 */
export function useLogPoseDeckEditor(editor: DeckEditor | null) {
  const { setEditor } = useContext(LogPoseContext);
  const owner = useRef({}).current;
  useEffect(() => {
    setEditor(owner, editor);
    return () => setEditor(owner, null);
  }, [editor, owner, setEditor]);
}

/**
 * Registers the live game the calling page shows while it is mounted (null for none). Kept as a value like the
 * deck editor: memoize it, and let `context()` read the latest game from a ref.
 */
export function useLogPoseGame(game: LogPoseGame | null) {
  const { setGame } = useContext(LogPoseContext);
  const owner = useRef({}).current;
  useEffect(() => {
    setGame(owner, game);
    return () => setGame(owner, null);
  }, [game, owner, setGame]);
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
export function useLogPoseDockHost(columns: boolean, left: HTMLElement | null, right: HTMLElement | null) {
  const { setDockHost } = useContext(LogPoseContext);
  const owner = useRef({}).current;
  useEffect(() => {
    setDockHost(owner, { columns, left, right });
    return () => setDockHost(owner, null);
  }, [columns, left, right, owner, setDockHost]);
}

/** Sent when the player taps Ask again on an edit whose deck changed. */
const ASK_AGAIN = "My deck changed. Update that suggestion for the deck as it is now.";

/** Desktop and tablets (a fine pointer, or 640px and wider) get the resizable drawer; anything else gets the phone sheet. */
export const DRAWER_QUERY = "(min-width: 640px), (pointer: fine)";

function useMedia(query: string): boolean {
  const get = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  const [match, setMatch] = useState(get);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

type Msg = { role: "user" | "assistant"; text: string; citations: PlacedCitation[]; proposals?: DeckEditProposal[]; plans?: TurnPlan[]; stopped?: boolean };

function useChat(apiBase: string, session: SessionManager, isOpen: () => boolean, onUnread: () => void) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [threadId, setThreadId] = useState<number | null>(() => readThreadId());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<"idle" | "loading" | "done">("idle");
  const abort = useRef<AbortController | null>(null);

  const keepThread = useCallback((id: number) => {
    setThreadId(id);
    writeThreadId(id);
  }, []);

  const loadHistory = useCallback(() => {
    if (history !== "idle") return;
    const id = readThreadId();
    if (!id) {
      setHistory("done");
      return;
    }
    setHistory("loading");
    fetchThread(apiBase, id)
      .then((t) => {
        if (!t) {
          writeThreadId(null);
          setThreadId(null);
        } else setMessages((cur) => (cur.length ? cur : t.messages.map((m) => ({ role: m.role, text: m.text, citations: m.citations ?? [], proposals: m.proposals ?? [] }))));
      })
      .catch(() => setError("Could not load your last chat."))
      .finally(() => setHistory("done"));
  }, [apiBase, history]);

  const send = useCallback(
    async (text: string, context: ChatContext | undefined) => {
      const message = text.trim();
      if (!message || busy) return;
      const ctrl = new AbortController();
      abort.current = ctrl;
      setBusy(true);
      setStatus("");
      setError(null);
      setMessages((cur) => [...cur, { role: "user", text: message, citations: [] }, { role: "assistant", text: "", citations: [] }]);
      const patchLast = (fn: (m: Msg) => Msg) =>
        setMessages((cur) => {
          const last = cur[cur.length - 1];
          return last?.role === "assistant" ? [...cur.slice(0, -1), fn(last)] : cur;
        });
      const body: ChatRequest = { message };
      if (threadId) body.thread_id = threadId;
      if (context) body.context = context;
      try {
        await streamAnalyst(
          session,
          "/chat",
          body,
          {
            onThread: keepThread,
            onStatus: setStatus,
            onText: (delta) => patchLast((m) => ({ ...m, text: m.text + delta })),
            // A citation follows the text streamed so far.
            onCite: (cites: Citation[]) => patchLast((m) => ({ ...m, citations: [...m.citations, ...placeAt(cites, m.text.length)] })),
            // A suggested deck edit shows as an Apply card under this answer.
            onProposal: (p) => patchLast((m) => ({ ...m, proposals: [...(m.proposals ?? []).filter((x) => x.id !== p.id), p] })),
            // A turn plan shows as a Turn plan card under this answer.
            onPlan: (plan) => patchLast((m) => ({ ...m, plans: [...(m.plans ?? []).filter((x) => x.id !== plan.id), plan] })),
            onDone: (d) => {
              if (typeof d.thread_id === "number") keepThread(d.thread_id);
              if (!isOpen()) onUnread();
            },
            onError: (e) => setError(errorText(e)),
          },
          ctrl.signal,
        );
      } catch (e) {
        if (ctrl.signal.aborted) patchLast((m) => ({ ...m, stopped: true }));
        else setError(e instanceof AnalystError ? errorText(e) : errorText({}));
      } finally {
        if (abort.current === ctrl) abort.current = null;
        // Drop an empty answer bubble (error before any text), unless it was stopped on purpose.
        setMessages((cur) => {
          const last = cur[cur.length - 1];
          return last?.role === "assistant" && isEmptyAnswer(last) ? cur.slice(0, -1) : cur;
        });
        setBusy(false);
        setStatus("");
      }
    },
    [busy, threadId, session, keepThread, isOpen, onUnread],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  const reset = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    writeThreadId(null);
    setThreadId(null);
    setMessages([]);
    setError(null);
    setStatus("");
    setBusy(false);
    setHistory("done");
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  return { messages, busy, status, error, history, loadHistory, send, stop, reset };
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
  children: ReactNode;
}) {
  const [session, setSession] = useState<ChatSession | null>(null);
  const manager = useMemo(() => createSessionManager(apiBase, setSession), [apiBase]);
  useEffect(() => {
    void manager.refresh();
  }, [manager, account]);
  const enabled = session ? session.enabled : null;

  const [page, setPageState] = useState<LogPosePage | null>(null);
  const pageOwner = useRef<object | null>(null);
  const setPage = useCallback((owner: object, next: LogPosePage | null) => {
    if (next) {
      pageOwner.current = owner;
      setPageState(next);
    } else if (pageOwner.current === owner) {
      pageOwner.current = null;
      setPageState(null);
    }
  }, []);

  const [editor, setEditorState] = useState<DeckEditor | null>(null);
  const editorOwner = useRef<object | null>(null);
  const setEditor = useCallback((owner: object, next: DeckEditor | null) => {
    if (next) {
      editorOwner.current = owner;
      setEditorState(next);
    } else if (editorOwner.current === owner) {
      editorOwner.current = null;
      setEditorState(null);
    }
  }, []);

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
  const chat = useChat(apiBase, manager, isOpen, markUnread);

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
    },
    [manager],
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
  const [hosts, setHosts] = useState<DockHosts | null>(null);
  const hostsOwner = useRef<object | null>(null);
  const setDockHost = useCallback((owner: object, next: DockHosts | null) => {
    if (next) {
      hostsOwner.current = owner;
      setHosts(next);
    } else if (hostsOwner.current === owner) {
      hostsOwner.current = null;
      setHosts(null);
    }
  }, []);
  const inGame = hosts !== null;
  const dockable = wideEnough && (!inGame || hosts.columns);
  const dockedTo: Dock = dockable ? dock : null;
  const embedded = dockedTo && hosts ? hosts[dockedTo] : null;

  const [game, setGameState] = useState<LogPoseGame | null>(null);
  const gameOwner = useRef<object | null>(null);
  const setGame = useCallback((owner: object, next: LogPoseGame | null) => {
    if (next) {
      gameOwner.current = owner;
      setGameState(next);
    } else if (gameOwner.current === owner) {
      gameOwner.current = null;
      setGameState(null);
    }
  }, []);

  const value = useMemo<LogPoseValue>(
    () => ({ enabled, apiBase, session: manager, setPage, setEditor, setGame, openPanel, closePanel, panelOpen: open && !hidden, dock, setDock, setDockHost, available, openLogPose }),
    [enabled, apiBase, manager, setPage, setEditor, setGame, openPanel, closePanel, open, hidden, dock, setDock, setDockHost, available, openLogPose],
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
            editor={editor}
            game={game}
            chat={chat}
            session={session}
            apiBase={apiBase}
            refreshSession={() => void manager.refresh()}
            onClose={closePanel}
            closing={!open}
            onExited={exited}
            origin={() => compassAt.current ?? compassRect({ w: window.innerWidth, h: window.innerHeight })}
            dock={dockedTo}
            canDock={dockable}
            inGame={inGame}
            embedded={embedded}
            dockW={dockW}
            onDockW={setDockW}
            onCommitDockW={commitDockW}
            onDock={setDock}
            quiet={quiet}
            request={request}
            onRequestHandled={handled}
          />
        ) : null}
      </SourceHooksContext.Provider>
    </LogPoseContext.Provider>
  );
}

/** The round compass launcher (bottom-right). Its needle swings while Log Pose is working. */
export function LogPoseCompass({
  working,
  unread,
  requests = 0,
  requestOnly = false,
  onClick,
}: {
  working: boolean;
  unread: boolean;
  /** Access requests waiting for an owner: shown as a count badge (not the unread dot). */
  requests?: number;
  /** Chat isn't on for this player: the compass opens the access request. */
  requestOnly?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="logpose lp-compass"
      aria-label="Log Pose"
      title={
        requestOnly
          ? "Request access to Log Pose"
          : working
            ? "Log Pose is working…"
            : requests > 0
              ? `Log Pose: ${requests} access request${requests === 1 ? "" : "s"} waiting`
              : unread
                ? "Log Pose has a new answer"
                : "Ask Log Pose"
      }
      data-working={working ? "true" : undefined}
      onClick={onClick}
    >
      <CompassIcon />
      {requests > 0 ? (
        <span className="lp-compass-count" data-testid="lp-compass-count">
          {requests > 9 ? "9+" : requests}
          <span className="lp-sr">{" access requests waiting"}</span>
        </span>
      ) : unread ? (
        <span className="lp-compass-dot" aria-hidden="true" />
      ) : null}
    </button>
  );
}

function CompassIcon() {
  return (
    <svg className="lp-compass-svg" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle className="lp-compass-bezel" cx="24" cy="24" r="19" />
      <circle className="lp-compass-face" cx="24" cy="24" r="15.5" />
      <g className="lp-compass-ticks">
        <path d="M24 9.5v3M24 35.5v3M9.5 24h3M35.5 24h3" />
      </g>
      <g className="lp-needle">
        <path className="lp-needle-n" d="M24 11.5 28 24h-8z" />
        <path className="lp-needle-s" d="M24 36.5 20 24h8z" />
      </g>
      <circle className="lp-compass-pin" cx="24" cy="24" r="2" />
    </svg>
  );
}

type Chat = ReturnType<typeof useChat>;

type Request = LogPoseAsk & { nonce: number };

function LogPosePanel({
  page,
  editor,
  game,
  chat,
  session,
  apiBase,
  refreshSession,
  onClose,
  closing,
  onExited,
  origin,
  dock,
  canDock,
  inGame,
  embedded,
  dockW,
  onDockW,
  onCommitDockW,
  onDock,
  quiet,
  request,
  onRequestHandled,
}: {
  page: LogPosePage | null;
  editor: DeckEditor | null;
  game: LogPoseGame | null;
  chat: Chat;
  session: ChatSession;
  apiBase: string;
  refreshSession: () => void;
  onClose: () => void;
  /** Closed, and shrinking into the compass: `onExited` unmounts the panel once that is done. */
  closing: boolean;
  onExited: () => void;
  /** Where the compass is (or would be): the panel grows out of it and shrinks back into it. */
  origin: () => Rect;
  /** Docked to this side (desktop only), or floating. */
  dock: Dock;
  /** Docking is possible on this page (a game board without side columns can't). */
  canDock: boolean;
  inGame: boolean;
  /** The board element a docked panel renders into; null while it has none (the panel waits). */
  embedded: HTMLElement | null;
  dockW: number;
  onDockW: (w: number) => void;
  onCommitDockW: (w: number) => void;
  onDock: (dock: Dock) => void;
  /** Opened by the page, not the player: don't take the keyboard. */
  quiet: boolean;
  request: Request | null;
  onRequestHandled: () => void;
}) {
  const chatOn = session.enabled;
  const owner = session.enabled && session.owner === true;
  const waiting = session.enabled ? (session.pendingRequests ?? 0) : 0;
  const [view, setView] = useState<"chat" | "requests">("chat");
  const showChat = chatOn && view === "chat";
  const phone = !useMedia(DRAWER_QUERY);
  const [draft, setDraft] = useState("");
  /** Context for the next message only: the hint a Why? was about. */
  const [extra, setExtra] = useState<LogPoseAsk["context"] | null>(null);
  const handled = useRef(0);
  const [dropped, setDropped] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const drawer = useDrawerSize();
  const sheet = useSheetHeight(panelRef, phone);
  const [preview, setPreview] = useState<DockPreview | null>(null);
  const move = useHeaderMove(drawer, panelRef, { dock: phone ? null : dock, enabled: !phone && canDock, inGame, width: dockW, setDock: onDock }, setPreview);
  const pending = !phone && dock !== null && inGame && !embedded;
  const edge = !phone && dock !== null && !inGame;

  // Pops out of the compass when it opens and shrinks back into it when it closes. A docked panel slides from its
  // edge, and one inside the board just appears. No animation (reduced motion, no Web Animations) is an instant open / close.
  const playing = useRef<Animation | null>(null);
  const phase = useRef<"in" | "out" | null>(null);
  useLayoutEffect(() => {
    if (pending) {
      if (closing) onExited();
      return;
    }
    const el = panelRef.current;
    const want = closing ? "out" : "in";
    if (phase.current === want) return;
    phase.current = want;
    const done = closing ? onExited : undefined;
    const reduced = document.documentElement.dataset.motion === "reduce" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!el || embedded || reduced || typeof el.animate !== "function") {
      playing.current?.cancel();
      done?.();
      return;
    }
    playing.current?.cancel();
    let frames;
    if (edge && dock) frames = slideFrames(dock, !closing);
    else {
      const o = growOrigin(origin(), el.getBoundingClientRect());
      el.style.transformOrigin = `${o.x}px ${o.y}px`;
      frames = popFrames(!closing);
    }
    const a = el.animate(frames, { duration: POP_MS, easing: closing ? "ease-in" : "ease-out", fill: closing ? "forwards" : "none" });
    playing.current = a;
    a.onfinish = () => {
      if (playing.current !== a) return;
      playing.current = null;
      el.style.removeProperty("transform-origin");
      done?.();
    };
  }, [closing, pending, embedded, edge, dock, origin, onExited]);
  const { loadHistory } = chat;

  // A different page brings its chip back.
  const pageKey = page ? JSON.stringify([page.label, page.deck, page.matchId, game?.label]) : (game?.label ?? "");
  useEffect(() => setDropped(false), [pageKey]);

  useEffect(() => {
    if (chatOn) loadHistory();
  }, [chatOn, loadHistory]);

  // A Why? from elsewhere in the app: send it once the last chat has loaded, or fill the composer while an answer streams.
  const { send: chatSend, history: chatHistory, busy: chatBusy } = chat;
  useEffect(() => {
    if (!request) return;
    const action = requestAction(request, { busy: chatBusy, history: chatHistory });
    if (action === "wait") return;
    if (handled.current === request.nonce) return;
    handled.current = request.nonce;
    onRequestHandled();
    setView("chat");
    setDropped(false);
    if (action === "send") {
      stick.current = true;
      void chatSend(request.prompt, askContext(page, request.context));
    } else {
      setDraft(request.prompt);
      setExtra(request.context ?? null);
      if (!phone) inputRef.current?.focus({ preventScroll: true });
      requestAnimationFrame(resize);
    }
  }, [request, chatHistory, chatBusy, chatSend, onRequestHandled, page, phone]);

  // Esc closes the drawer on desktop.
  useEffect(() => {
    if (phone) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phone, onClose]);

  // Desktop: focus the composer. Phones wait for a tap so the keyboard doesn't jump up.
  useEffect(() => {
    if (!phone && showChat && !quiet) inputRef.current?.focus({ preventScroll: true });
  }, [phone, showChat, quiet]);

  // Phones: the sheet covers the screen, so the page behind must not scroll; and it follows
  // the visual viewport so the composer stays above the on-screen keyboard.
  useEffect(() => {
    if (!phone) return;
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = "hidden";
    const vv = window.visualViewport;
    const el = panelRef.current;
    const fit = () => {
      if (!vv || !el) return;
      el.style.setProperty("--lp-vv-height", `${Math.round(vv.height)}px`);
      el.style.setProperty("--lp-vv-top", `${Math.round(vv.offsetTop)}px`);
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    return () => {
      body.style.overflow = prev;
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
      el?.style.removeProperty("--lp-vv-height");
      el?.style.removeProperty("--lp-vv-top");
    };
  }, [phone]);

  // Keep the newest text in view while it streams, unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && showChat && stick.current) el.scrollTop = el.scrollHeight;
    else if (el && !showChat) el.scrollTop = 0;
  }, [chat.messages, chat.status, chat.error, chat.busy, showChat, embedded]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  const resize = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const submit = (text: string) => {
    if (chat.busy || !text.trim()) return;
    stick.current = true;
    const context = gameMessageContext(page, game, dropped);
    void chat.send(text, extra ? { ...context, ...extra } : context);
    setExtra(null);
    setDraft("");
    requestAnimationFrame(resize);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(draft);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(draft);
    }
  };

  const newChat = () => {
    chat.reset();
    setExtra(null);
    setDropped(false);
    setDraft("");
    inputRef.current?.focus({ preventScroll: true });
  };

  const starters = game?.starters ?? page?.starters ?? [];
  const empty = chat.messages.length === 0 && chat.history !== "loading";
  const chipLabel = game?.label ?? page?.label;
  const showChip = Boolean(chipLabel) && !dropped;
  const aboutHint = extra?.hint;

  const floating = !phone && dock === null;
  const node = (
    <div
      ref={panelRef}
      className="logpose lp-panel"
      role="dialog"
      aria-modal={phone ? "true" : undefined}
      aria-labelledby="lp-title"
      data-phone={phone ? "true" : undefined}
      data-sized={floating && drawer.size ? "true" : undefined}
      data-dock={!phone && dock ? dock : undefined}
      data-embedded={embedded ? "true" : undefined}
      data-moving={move.moving ? "true" : undefined}
      data-closing={closing ? "true" : undefined}
      style={
        edge
          ? { width: dockW }
          : floating && drawer.size
            ? { width: drawer.size.w, height: drawer.size.h, ...(drawer.pos ? { right: drawer.pos.r, bottom: drawer.pos.b } : {}) }
            : undefined
      }
    >
      {phone ? <SheetGrip {...sheet} /> : embedded ? null : edge && dock ? <DockHandle side={dock} width={dockW} onWidth={onDockW} onCommit={onCommitDockW} onReset={() => onCommitDockW(DOCK_W_DEFAULT)} /> : <ResizeHandles drawer={drawer} panelRef={panelRef} />}
      <header className="lp-head" data-owner={owner ? "true" : undefined} data-movable={phone ? undefined : "true"} {...(phone ? {} : move.header)}>
        <span className="lp-head-icon" aria-hidden="true">
          <CompassIcon />
        </span>
        <h2 id="lp-title" className="lp-title">
          Log Pose
        </h2>
        {!phone ? (
          <button
            type="button"
            className="lp-btn lp-btn-icon lp-move"
            aria-label="Move Log Pose"
            aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
            title="Drag the header to move, or to a screen edge to dock (double-click to reset). Arrow keys here move it; toward an edge docks, away undocks."
            {...move.grip}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="M10 3v14M3 10h14M10 3 8 5M10 3l2 2M10 17l-2-2M10 17l2-2M3 10l2-2M3 10l2 2M17 10l-2-2M17 10l-2 2" />
            </svg>
          </button>
        ) : null}
        {owner && view === "chat" ? (
          <button type="button" className="lp-btn lp-btn-quiet lp-requests-btn" onClick={() => setView("requests")}>
            Requests
            {waiting > 0 ? <span className="lp-count">{waiting > 99 ? "99+" : waiting}</span> : null}
          </button>
        ) : null}
        {view === "requests" ? (
          <button type="button" className="lp-btn lp-btn-quiet" onClick={() => setView("chat")}>
            Back to chat
          </button>
        ) : null}
        {showChat ? (
          <button type="button" className="lp-btn lp-btn-quiet" onClick={newChat}>
            New chat
          </button>
        ) : null}
        <button type="button" className="lp-btn lp-btn-icon" onClick={onClose} aria-label="Close Log Pose" title="Close">
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </header>
      {showChat ? <ModelPicker apiBase={apiBase} /> : null}

      <div ref={listRef} className="lp-body" onScroll={onScroll} aria-live="polite" aria-busy={chat.busy}>
        {!chatOn ? (
          <RequestAccessView apiBase={apiBase} access={session.access ?? "none"} onSent={refreshSession} />
        ) : view === "requests" ? (
          <RequestsList apiBase={apiBase} onChanged={refreshSession} />
        ) : null}
        {showChat && page?.pinned ? <div className="lp-pinned">{page.pinned}</div> : null}
        {showChat && chat.history === "loading" ? <p className="lp-note">Loading your last chat…</p> : null}
        {showChat && empty ? (
          <div className="lp-empty">
            <p className="lp-empty-lead">Ask about decks, matchups, rulings or your games.</p>
            {starters.length ? (
              <div className="lp-starters">
                {starters.map((s) => (
                  <button key={s} type="button" className="lp-starter" onClick={() => submit(s)} disabled={chat.busy}>
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {(showChat ? chat.messages : []).map((m, i) =>
          m.role === "assistant" && isEmptyAnswer(m) ? null : m.role === "user" ? (
            <div key={i} className="lp-msg lp-msg-user">
              <p>{m.text}</p>
            </div>
          ) : (
            <div key={i} className="lp-msg lp-msg-assistant">
              {m.text ? <CitedAnswer text={m.text} citations={m.citations} done={!(chat.busy && i === chat.messages.length - 1)} /> : null}
              {m.stopped ? <p className="lp-stopped">Stopped.</p> : null}
              {(m.proposals ?? []).map((p) => (
                <DeckEditCard key={p.id} proposal={p} editor={editor} busy={chat.busy} onAskAgain={() => submit(ASK_AGAIN)} />
              ))}
              {game
                ? (m.plans ?? []).map((plan) => (
                    <Fragment key={plan.id}>{game.renderPlan(plan, { busy: chat.busy, ask: submit })}</Fragment>
                  ))
                : null}
            </div>
          ),
        )}
        {showChat && chat.busy ? (
          <p className="lp-status" role="status">
            <span className="lp-status-dot" aria-hidden="true" />
            <span className="lp-status-text">{chat.status || "Thinking…"}</span>
          </p>
        ) : null}
        {showChat && chat.error ? (
          <p className="lp-error" role="alert">
            {chat.error}
          </p>
        ) : null}
      </div>

      {showChat ? (
      <div className="lp-foot">
        {showChip || aboutHint ? (
          <div className="lp-context">
            {showChip ? (
              <span className="lp-chip" title={`Looking at: ${chipLabel}`}>
                <span className="lp-chip-text">Looking at: {chipLabel}</span>
                <button type="button" className="lp-chip-x" onClick={() => setDropped(true)} aria-label={`Don't send ${chipLabel} with the next message`}>
                  <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                    <path d="M6 6l8 8M14 6l-8 8" />
                  </svg>
                </button>
              </span>
            ) : null}
            {aboutHint ? (
              <span className="lp-chip" title={`About: ${aboutHint.title}`}>
                <span className="lp-chip-text">About: {aboutHint.title}</span>
                <button type="button" className="lp-chip-x" onClick={() => setExtra(null)} aria-label={`Don't send the ${aboutHint.title} hint with the next message`}>
                  <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                    <path d="M6 6l8 8M14 6l-8 8" />
                  </svg>
                </button>
              </span>
            ) : null}
          </div>
        ) : null}
        <form className="lp-composer" onSubmit={onSubmit}>
          <textarea
            ref={inputRef}
            className="lp-input"
            rows={1}
            value={draft}
            placeholder={chat.busy ? "Log Pose is answering…" : "Ask Log Pose…"}
            aria-label="Message Log Pose"
            disabled={chat.busy}
            onChange={(e) => {
              setDraft(e.target.value);
              resize();
            }}
            onKeyDown={onKeyDown}
          />
          {chat.busy ? (
            <button type="button" className="lp-btn lp-btn-send lp-btn-stop" onClick={chat.stop}>
              Stop
            </button>
          ) : (
            <button type="submit" className="lp-btn lp-btn-send" disabled={!draft.trim()}>
              Send
            </button>
          )}
        </form>
      </div>
      ) : null}
    </div>
  );
  if (pending) return null;
  return (
    <>
      {embedded ? createPortal(node, embedded) : node}
      {preview ? createPortal(<div className="logpose lp-dock-preview" data-side={preview.side} aria-hidden="true" style={preview.rect} />, document.body) : null}
    </>
  );
}
