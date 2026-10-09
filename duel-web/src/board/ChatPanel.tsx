import { useEffect, useRef, useState, type FormEvent } from "react";
import { CHAT_MAX_LENGTH, type ChatLine, type Seat } from "../net/protocol";
import { parseChatCommand } from "./chatCommand";
import { unreadChatCount } from "./chatUnread";
import { playerLabel } from "./playerNames";

type Props = {
  lines: readonly ChatLine[];
  /** Your seat, or null when spectating (read-only). */
  mySeat: Seat | null;
  onSend: (text: string) => void;
  /** Concede the match; undefined when conceding is unavailable (`/ff` then shows a hint). */
  onConcede?: () => void;
  /** Start expanded (wide layouts, where chat has its own rail slot). */
  defaultOpen?: boolean;
};

function speaker(seat: Seat, mySeat: Seat | null): string {
  if (mySeat == null) return playerLabel(seat);
  return seat === mySeat ? "You" : "Opponent";
}

/** Collapsible match chat; mirrors the battle log panel's placement. */
export function ChatPanel({ lines, mySeat, onSend, onConcede, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState("");
  /** Inline result of a `/ff`: asks to confirm, or says conceding is unavailable. */
  const [command, setCommand] = useState<"confirm" | "unavailable" | null>(null);
  const [lastSeenId, setLastSeenId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const unread = open ? 0 : unreadChatCount(lines, lastSeenId);
  const canSend = mySeat != null;

  useEffect(() => {
    if (!open) return;
    setLastSeenId(lines.length ? lines[lines.length - 1].id : null);
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, lines]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (parseChatCommand(text)) {
      setDraft("");
      setCommand(onConcede ? "confirm" : "unavailable");
      inputRef.current?.focus();
      return;
    }
    setCommand(null);
    onSend(text);
    setDraft("");
    inputRef.current?.focus();
  }

  return (
    <aside className={`chat-panel${open ? "" : " collapsed"}`} aria-label="Match chat">
      <button
        type="button"
        className="chat-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>Chat</span>
        {unread > 0 ? (
          <span className="chat-unread" aria-label={`${unread} unread`}>
            {unread}
          </span>
        ) : (
          <span className="chat-count">{lines.length || ""}</span>
        )}
      </button>
      {open ? (
        <>
          <div className="chat-body" ref={scrollerRef} role="log" aria-live="polite">
            {lines.length === 0 ? (
              <p className="chat-empty">
                {canSend ? "Say hi to your opponent." : "No messages yet."}
              </p>
            ) : (
              <ul className="chat-lines">
                {lines.map((l) => (
                  <li
                    key={l.id}
                    className={`chat-line${mySeat != null && l.seat === mySeat ? " mine" : ""}`}
                  >
                    <span className="chat-who">{speaker(l.seat, mySeat)}</span>
                    <span className="chat-text">{l.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {canSend ? (
            <div className="chat-form-wrap">
              {command ? (
                <div className="chat-command" role="status">
                  {command === "confirm" ? (
                    <>
                      <span>Concede this match?</span>
                      <button
                        type="button"
                        className="chat-command-confirm"
                        onClick={() => {
                          setCommand(null);
                          onConcede?.();
                        }}
                      >
                        Confirm concede
                      </button>
                      <button type="button" className="chat-command-cancel" onClick={() => setCommand(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <span>You can't concede here</span>
                  )}
                </div>
              ) : null}
            <form className="chat-form" onSubmit={submit}>
              <input
                ref={inputRef}
                className="chat-input"
                value={draft}
                maxLength={CHAT_MAX_LENGTH}
                placeholder="Message…"
                aria-label="Chat message"
                autoComplete="off"
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (command === "unavailable") setCommand(null);
                }}
                // Keep board shortcuts (Esc clears DON!! selection) from firing while typing.
                onKeyDown={(e) => e.stopPropagation()}
              />
              <button type="submit" className="chat-send" disabled={!draft.trim()}>
                Send
              </button>
            </form>
            </div>
          ) : (
            <p className="chat-readonly">Spectators can read chat but not send.</p>
          )}
        </>
      ) : null}
    </aside>
  );
}
