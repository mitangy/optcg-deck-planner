import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { deleteThread } from "./client";
import { lowCreditText, type Credit } from "./credit";
import { askContext, gameMessageContext, requestAction, type LogPoseAsk } from "./ask";
import { CompassIcon } from "./Compass";
import { ChatMessages } from "./ChatMessageList";
import { ChatsMenu } from "./ChatsMenu";
import type { DeckEditor } from "./proposals";
import { DockHandle, ResizeHandles, SheetGrip, useDrawerSize, useHeaderMove, useSheetHeight, type DockPreview } from "./PanelResize";
import { DOCK_W_DEFAULT, type Dock, type DockSides } from "./panelDock";
import type { Rect } from "./panelMotion";
import { useLayerRoom, usePanelMotion, usePhoneViewport } from "./panelEffects";
import { ChatNotice, CreditMeter, LimitCard } from "./PanelParts";
import { RequestAccessView, RequestsList } from "./AccessViews";
import { OwnerTabs } from "./OwnerTabs";
import { UsageView } from "./UsageView";
import { useFeedback } from "./Feedback";
import { ModelPicker } from "./ModelPicker";
import type { ChatSession } from "./session";
import { canStartNewChat, scopeLabel, type LogPoseScope } from "./scopes";
import type { Chat } from "./useChat";
import { DRAWER_QUERY, SHORT_QUERY, useMedia } from "./useMedia";
import type { LogPoseGame, LogPosePage, OwnClaude } from "./types";

type Request = LogPoseAsk & { nonce: number };

/** Where the panel sits: docked to a side or floating, and the room it has (see LogPoseProvider). */
export type PanelDockState = {
  /** Docked to this side (desktop only), or floating. */
  dock: Dock;
  /** Docking is possible on this page (a game board without side columns can't). */
  canDock: boolean;
  inGame: boolean;
  /** On a game board, which sides have a column shown. */
  sides?: DockSides;
  /** The board element a docked panel renders into; null while it has none (the panel waits). */
  embedded: HTMLElement | null;
  /** A modal's element the panel renders into while there is one (and no board column). */
  layer: HTMLElement | null;
  dockW: number;
  onDockW: (w: number) => void;
  onCommitDockW: (w: number) => void;
  onDock: (dock: Dock) => void;
};

/** How the panel opens and closes: it grows out of the compass and shrinks back into it. */
export type PanelMotionState = {
  /** Closed, and shrinking into the compass: `onExited` unmounts the panel once that is done. */
  closing: boolean;
  onExited: () => void;
  /** Where the compass is (or would be): the panel grows out of it and shrinks back into it. */
  origin: () => Rect;
};

export function LogPosePanel({
  page,
  active,
  editor,
  game,
  chat,
  session,
  credit,
  ownClaude,
  onCreditChanged,
  apiBase,
  refreshSession,
  onClose,
  motion,
  dockState,
  quiet,
  request,
  onRequestHandled,
}: {
  page: LogPosePage | null;
  /** The chat the page belongs to (see LogPoseProvider). */
  active: LogPoseScope;
  editor: DeckEditor | null;
  game: LogPoseGame | null;
  chat: Chat;
  session: ChatSession;
  credit: Credit | null;
  ownClaude?: OwnClaude;
  onCreditChanged: () => void;
  apiBase: string;
  refreshSession: () => void;
  onClose: () => void;
  motion: PanelMotionState;
  dockState: PanelDockState;
  /** Opened by the page, not the player: don't take the keyboard. */
  quiet: boolean;
  request: Request | null;
  onRequestHandled: () => void;
}) {
  const { closing, onExited, origin } = motion;
  const { dock, canDock, inGame, sides, embedded, layer, dockW, onDockW, onCommitDockW, onDock } = dockState;
  const chatOn = session.enabled;
  const owner = session.enabled && session.owner === true;
  const waiting = session.enabled ? (session.pendingRequests ?? 0) : 0;
  const [view, setView] = useState<"chat" | "requests" | "usage">("chat");
  const blocked = chatOn && credit?.refusal ? credit : null;
  const showChat = chatOn && view === "chat";
  const phone = !useMedia(DRAWER_QUERY);
  // A short window (a phone on its side) has no room for a second header row: the chat's name moves into the header.
  const short = useMedia(SHORT_QUERY);
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
  const move = useHeaderMove(drawer, panelRef, { dock: phone ? null : dock, enabled: !phone && canDock, inGame, sides, width: dockW, setDock: onDock }, setPreview);
  const pending = !phone && dock !== null && inGame && !embedded;
  const edge = !phone && dock !== null && !inGame;

  // Pops out of the compass when it opens and shrinks back into it when it closes (see usePanelMotion).
  usePanelMotion(panelRef, { closing, pending, embedded, edge, dock, origin, onExited });
  const { sync } = chat;

  // A different page brings its chip back.
  const pageKey = page ? JSON.stringify([page.label, page.deck, page.matchId, game?.label]) : (game?.label ?? "");
  useEffect(() => setDropped(false), [pageKey]);

  // Opening the panel (or moving to a page on another scope) puts the page's chat on show.
  useEffect(() => {
    if (chatOn) void sync();
  }, [chatOn, sync, active.key, chat.busy]);

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

  // Esc closes the drawer on desktop. Inside a modal (the enlarged card) it closes on phones too and is taken before
  // the modal sees it, so the chat closes first and the next Esc closes the card.
  const inLayer = layer !== null && !embedded;
  useEffect(() => {
    if (phone && !inLayer) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || closing) return;
      if (inLayer) e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, inLayer);
    return () => window.removeEventListener("keydown", onKey, inLayer);
  }, [phone, onClose, inLayer, closing]);

  // Beside a modal on desktop: tell the page which side the panel is on and how wide, so the modal makes room.
  useLayerRoom(panelRef, { inLayer, phone, closing, dock });

  // Desktop: focus the composer. Phones wait for a tap so the keyboard doesn't jump up.
  useEffect(() => {
    if (!phone && showChat && !quiet) inputRef.current?.focus({ preventScroll: true });
  }, [phone, showChat, quiet]);

  // Phones: the page behind must not scroll, and the sheet follows the on-screen keyboard.
  usePhoneViewport(panelRef, phone);

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

  const feedback = useFeedback(apiBase, showChat && chat.threadId !== null ? { threadId: chat.threadId } : null);
  const starters = game?.starters ?? page?.starters ?? [];
  const empty = chat.messages.length === 0 && chat.history !== "loading";
  const chipLabel = game?.label ?? page?.label;
  const showChip = Boolean(chipLabel) && !dropped;
  const aboutHint = extra?.hint;

  // The chat on show: the page's own while it is, or the one picked from the Chats list.
  const shown = chat.scope.key === active.key ? active : chat.scope;
  const floating = !phone && dock === null;
  const chatsMenu = <ChatsMenu apiBase={apiBase} active={active} threadId={chat.threadId} busy={chat.busy} onPick={chat.openThread} />;
  const scopeBar = (
    <div className="lp-scope">
      <span className="lp-scope-label" title={scopeLabel(shown)} data-testid="lp-scope-label">
        {scopeLabel(shown)}
      </span>
      {chatsMenu}
    </div>
  );
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
      <header
        className="lp-head"
        data-owner={owner ? "true" : undefined}
        data-movable={phone ? undefined : "true"}
        data-scope-inline={showChat && short ? "true" : undefined}
        {...(phone ? {} : move.header)}
      >
        <span className="lp-head-icon" aria-hidden="true">
          <CompassIcon />
        </span>
        {showChat && short ? (
          <>
            <h2 id="lp-title" className="lp-title lp-title-scope" title={scopeLabel(shown)} data-testid="lp-scope-label">
              <span className="lp-sr">Log Pose: </span>
              {scopeLabel(shown)}
            </h2>
            {chatsMenu}
          </>
        ) : (
          <h2 id="lp-title" className="lp-title">
            Log Pose
          </h2>
        )}
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
        {view !== "chat" ? (
          <button type="button" className="lp-btn lp-btn-quiet" onClick={() => setView("chat")}>
            Back to chat
          </button>
        ) : null}
        {showChat && canStartNewChat(shown.key) ? (
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
      {owner && view !== "chat" ? (
        <OwnerTabs view={view} waiting={waiting} onView={setView} />
      ) : null}
      {showChat && !short ? scopeBar : null}
      {showChat && !owner ? <CreditMeter credit={credit} /> : null}
      {showChat ? <ModelPicker apiBase={apiBase} /> : null}

      <div ref={listRef} className="lp-body" onScroll={onScroll} aria-live="polite" aria-busy={chat.busy}>
        {!chatOn ? (
          <RequestAccessView
            apiBase={apiBase}
            access={session.access ?? "none"}
            onSent={refreshSession}
            freeSpots={session.enabled ? undefined : session.freeSpots}
            spotsLeft={session.enabled ? undefined : session.spotsLeft}
            freeCreditUsd={session.enabled ? undefined : session.freeCreditUsd}
          />
        ) : view === "requests" ? (
          <RequestsList apiBase={apiBase} onChanged={refreshSession} />
        ) : view === "usage" ? (
          <UsageView apiBase={apiBase} />
        ) : null}
        {showChat && page?.pinned ? <div className="lp-pinned">{page.pinned}</div> : null}
        {showChat && chat.history === "loading" ? <p className="lp-note">Loading your last chat…</p> : null}
        {showChat && empty ? (
          <div className="lp-empty">
            <p className="lp-empty-lead">Ask about decks, matchups, rulings or your games.</p>
            {starters.length ? (
              <div className="lp-starters">
                {starters.map((s) => (
                  <button key={s} type="button" className="lp-starter" onClick={() => submit(s)} disabled={chat.busy || blocked !== null}>
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {showChat ? <ChatMessages messages={chat.messages} busy={chat.busy} threadId={chat.threadId} feedback={feedback} editor={editor} game={game} phone={phone} onClose={onClose} submit={submit} /> : null}
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
        {blocked ? (
          <LimitCard
            apiBase={apiBase}
            credit={blocked}
            ownClaude={ownClaude?.onSelect ? { ...ownClaude, onSelect: () => (ownClaude.onSelect?.(), onClose()) } : ownClaude}
            onAsked={onCreditChanged}
          />
        ) : (
          <>
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
        {credit && lowCreditText(credit) ? (
          <p className="lp-low" role="status">
            {lowCreditText(credit)}
          </p>
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
          </>
        )}
        <ChatNotice
          threadId={chat.threadId}
          busy={chat.busy}
          onDelete={async (id) => {
            await deleteThread(apiBase, id);
            newChat();
          }}
        />
      </div>
      ) : null}
    </div>
  );
  if (pending) return null;
  return (
    <>
      {embedded ? createPortal(node, embedded) : layer ? createPortal(node, layer) : node}
      {preview ? createPortal(<div className="logpose lp-dock-preview" data-side={preview.side} aria-hidden="true" style={preview.rect} />, document.body) : null}
    </>
  );
}
