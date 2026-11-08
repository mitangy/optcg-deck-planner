import { Fragment } from "react";
import { autoText, isAutoMessage } from "./client";
import type { Msg } from "./chatMessages";
import { CitedAnswer } from "./Sources";
import { DeckEditCard } from "./DeckEditCard";
import { NewDeckCard } from "./NewDeckCard";
import { FeedbackBar, type useFeedback } from "./Feedback";
import { answerStart, targetKey } from "./feedbackModel";
import { isEmptyAnswer, type DeckEditor } from "./proposals";
import type { LogPoseGame } from "./types";

/** Sent when the player taps Ask again on an edit whose deck changed. */
const ASK_AGAIN = "My deck changed. Update that suggestion for the deck as it is now.";

/** The thread's messages: the player's lines, Log Pose's answers with their feedback, edit / deck / plan cards. */
export function ChatMessages({
  messages,
  busy,
  threadId,
  feedback,
  editor,
  game,
  phone,
  onClose,
  submit,
}: {
  messages: Msg[];
  busy: boolean;
  threadId: number | null;
  feedback: ReturnType<typeof useFeedback>;
  editor: DeckEditor | null;
  game: LogPoseGame | null;
  phone: boolean;
  onClose: () => void;
  /** Sends a message as the player (Ask again, a plan card's follow-ups). */
  submit: (text: string) => void;
}) {
  /** Where an answer stands among the thread's stored answers: only saved answers with text count, as the server counts them. */
  const answerNumber = (i: number) => messages.slice(0, i).filter((x) => x.role === "assistant" && x.saved && x.text.trim()).length;
  return (
    <>
      {messages.map((m, i) =>
        m.role === "assistant" && isEmptyAnswer(m) ? null : m.role === "user" ? (
          isAutoMessage(m.text) ? (
            // The board asked on the player's behalf while Log Pose plays their turn: a muted line, not a message of theirs.
            <p key={i} className="lp-auto-line">
              {autoText(m.text)}
            </p>
          ) : (
            <div key={i} className="lp-msg lp-msg-user">
              <p>{m.text}</p>
            </div>
          )
        ) : (
          <div key={i} className="lp-msg lp-msg-assistant">
            {m.text ? <CitedAnswer text={m.text} citations={m.citations} done={!(busy && i === messages.length - 1)} /> : null}
            {m.stopped ? <p className="lp-stopped">Stopped.</p> : null}
            {m.saved && m.text.trim() && threadId !== null && !(busy && i === messages.length - 1)
              ? (() => {
                  const target = { kind: "chat" as const, threadId, index: answerNumber(i), startsWith: answerStart(m.text) };
                  return <FeedbackBar key={targetKey(target)} what="this answer" vote={feedback.votes.get(targetKey(target))} onSend={(rating, note) => feedback.rate(target, rating, note)} />;
                })()
              : null}
            {(m.choices ?? []).map((c) => (
              <p key={c.id} className="lp-auto-choice">
                <span className="lp-auto-tag">Log Pose</span> {c.summary}
              </p>
            ))}
            {(m.proposals ?? []).map((p) => (
              <DeckEditCard key={p.id} proposal={p} editor={editor} busy={busy} live={m.live === true} onNavigate={phone ? onClose : undefined} onAskAgain={() => submit(ASK_AGAIN)} />
            ))}
            {(m.drafts ?? []).map((d) => (
              <NewDeckCard key={d.id} draft={d} live={m.live === true} onOpened={phone ? onClose : undefined} />
            ))}
            {game
              ? (m.plans ?? []).map((plan) => (
                  <Fragment key={plan.id}>{game.renderPlan(plan, { busy: busy, ask: submit })}</Fragment>
                ))
              : null}
          </div>
        ),
      )}
    </>
  );
}
