import { useEffect, useRef, useState, type FormEvent } from "react";
import { CHAT_MAX_LENGTH, type ChatLine, type Seat } from "../net/protocol";

type Props = {
  lines: readonly ChatLine[];
  /** Your seat, or null when spectating (read-only). */
  mySeat: Seat | null;
  onSend: (text: string) => void;
};

function speaker(seat: Seat, mySeat: Seat | null): string {
  if (mySeat == null) return `Seat ${seat}`;
  return seat === mySeat ? "You" : "Opponent";
}

/** Collapsible match chat; mirrors the battle log panel's placement. */
export function ChatPanel({ lines, mySeat, onSend }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [seenCount, setSeenCount] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const unread = open ? 0 : Math.max(0, lines.length - seenCount);
  const canSend = mySeat != null;

  useEffect(() => {
    if (!open) return;
    setSeenCount(lines.length);
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, lines]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
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
            <form className="chat-form" onSubmit={submit}>
              <input
                ref={inputRef}
                className="chat-input"
                value={draft}
                maxLength={CHAT_MAX_LENGTH}
                placeholder="Message…"
                aria-label="Chat message"
                autoComplete="off"
                onChange={(e) => setDraft(e.target.value)}
                // Keep board shortcuts (Esc clears DON!! selection) from firing while typing.
                onKeyDown={(e) => e.stopPropagation()}
              />
              <button type="submit" className="chat-send" disabled={!draft.trim()}>
                Send
              </button>
            </form>
          ) : (
            <p className="chat-readonly">Spectators can read chat but not send.</p>
          )}
        </>
      ) : null}
    </aside>
  );
}
