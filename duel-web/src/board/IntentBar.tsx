import { useContext } from "react";
import { intentLabel, type Intent, type PlayerView } from "../net/protocol";
import { splitCardActions } from "./cardActions";
import { isReplacePlay } from "./dragIntents";
import { actionKeyTags } from "./hotkeys";
import { filterIntentsForSelection } from "./intentFilter";
import { PromptSlotContext } from "./promptSlot";
import { splitPrimaryIntent } from "./primaryIntent";
import { PrimaryActionButton, WaitingIndicator, intentBtnClass } from "./PrimaryDock";
import type { WaitingOnOpponent } from "./waitingOnOpponent";
import { useDuelSettings } from "../settings";

type Props = {
  intents: Intent[];
  view?: PlayerView;
  disabled?: boolean;
  filterHandIndex?: number | null;
  selectedBoardId?: string | null;
  /** End turn needs a second tap (gameplay setting); `reason` fills the armed label. */
  confirmEndTurn?: { reason: string | null } | null;
  onSend: (intent: Intent) => void;
  /** Full-board play: ask which Character to replace instead of sending. */
  onChooseReplace?: (handIndex: number) => void;
  /**
   * The defend tray owns the block / counter choices: hide the secondary
   * actions and let the tray relabel the primary ("Take hit", "Confirm
   * counter"). `onPress` replaces sending the primary intent itself.
   */
  defend?: { label: string; onPress?: () => void };
  /** Relabels a Pass counter primary ("Resolve" once the defender is safe). */
  counterLabel?: string;
  /** Replaces "No actions for this card" while something else already answers it. */
  emptyHint?: string;
  /**
   * The selected card's own actions are shown on the card (a popover), so this
   * bar keeps only the phase-wide ones and a hint. `count` shifts the hotkey
   * numbers of the bar's buttons past the card's; `active` says a popover is up.
   */
  onCard?: { count: number; active: boolean };
  /** Full-wording copies of the card popover's DON!! chips ("Give 2 DON!! (+2000)"). */
  quickActions?: { id: string; label: string; onPress: () => void }[];
  /**
   * Desktop: the primary lives in the floating board dock, not in this rail
   * (one End turn button, not two). Keep / Mulligan stay together here.
   */
  hidePrimary?: boolean;
  /** Phones and landscape: the wait for the opponent shows in the primary's slot. */
  waiting?: WaitingOnOpponent | null;
  /** Why the rail is empty when it is not your move (desktop shows the wait in the board dock). */
  idle?: "prompt" | "opponent" | null;
};

/** What the empty action rail says. */
export function emptyIntentText(o: {
  mulliganWaiting: boolean;
  idle: "prompt" | "opponent" | null;
  nothingSelected: boolean;
  hasIntents: boolean;
}): string {
  if (o.mulliganWaiting) return "Waiting for opponent to finish mulligan…";
  if (o.idle === "prompt") return "Answer the prompt to continue";
  if (o.idle === "opponent") return "Waiting for your opponent…";
  if (o.nothingSelected && o.hasIntents) return "Select a card for actions";
  return "No legal actions right now";
}

export function IntentBar({
  intents,
  view,
  disabled,
  filterHandIndex,
  selectedBoardId,
  confirmEndTurn = null,
  onSend,
  onChooseReplace,
  defend,
  counterLabel,
  emptyHint,
  onCard,
  quickActions = [],
  hidePrimary = false,
  waiting = null,
  idle = null,
}: Props) {
  const handIndex = filterHandIndex ?? null;
  const boardId = selectedBoardId ?? null;
  // The primary comes from every legal intent, not the selection-filtered
  // list, so its slot never changes when a card is tapped.
  const { primary, rest } = splitPrimaryIntent(intents);
  const selected = defend ? [] : filterIntentsForSelection(rest, { handIndex, boardId });
  const split = splitCardActions(selected);
  const shown = onCard ? split.bar : [...split.card, ...split.bar];
  const keyTags = actionKeyTags(shown, onCard?.count ?? 0);
  // The keys work either way; the setting only hides their tabs.
  const showKeyTags = useDuelSettings().shortcutTags;
  const mulliganPhase = view?.phase === "mulligan";
  const nothingSelected = handIndex == null && boardId == null;
  const setPromptSlot = useContext(PromptSlotContext).setSlot;

  if (shown.length === 0 && quickActions.length === 0 && !primary && waiting) {
    return (
      <div className="intent-bar intent-bar-waiting">
        <WaitingIndicator waiting={waiting} />
      </div>
    );
  }

  if (shown.length === 0 && quickActions.length === 0 && !primary) {
    return (
      <div className="intent-bar">
        <p className="intent-empty">
          {emptyIntentText({
            mulliganWaiting: Boolean(mulliganPhase && view?.you.mulliganDone),
            idle,
            nothingSelected,
            hasIntents: intents.length > 0,
          })}
        </p>
        {/* A hand pick's Confirm / None land here on phones, where End turn sits. */}
        {idle === "prompt" ? <div className="intent-prompt-slot" ref={setPromptSlot} /> : null}
      </div>
    );
  }

  return (
    <div
      className={`intent-bar${mulliganPhase ? " intent-bar-mulligan" : ""}${
        defend ? " intent-bar-defend" : ""
      }`}
    >
      <h2>{mulliganPhase ? "Mulligan" : "Actions"}</h2>
      <div className="intent-layout">
        <div className="intent-row">
          {shown.length === 0 && quickActions.length === 0 && !defend ? (
            <p className="intent-empty">
              {emptyHint ??
                (onCard?.active
                  ? "Choose an action on the card"
                  : nothingSelected
                    ? "Select a card for actions"
                    : "No actions for this card")}
            </p>
          ) : null}
          {quickActions.map((q) => (
            <button key={q.id} type="button" className="intent-btn" disabled={disabled} onClick={q.onPress}>
              {q.label}
            </button>
          ))}
          {shown.map((intent, idx) => (
            <button
              key={`${intent.type}-${idx}`}
              type="button"
              className={intentBtnClass(intent)}
              disabled={disabled}
              data-key-num={keyTags[idx]!.num ?? undefined}
              data-key-letter={keyTags[idx]!.letter ?? undefined}
              data-key-tag={(showKeyTags && keyTags[idx]!.tag) || undefined}
              onClick={() =>
                onChooseReplace && isReplacePlay(intent)
                  ? onChooseReplace(intent.handIndex as number)
                  : onSend(intent)
              }
            >
              {onChooseReplace && isReplacePlay(intent)
                ? `${intentLabel({ type: "play_card", handIndex: intent.handIndex }, view)} (choose replacement)`
                : intentLabel(intent, view)}
            </button>
          ))}
        </div>
        {primary && !hidePrimary ? (
          <div className={`intent-primary${showKeyTags ? "" : " no-key-tag"}`}>
            <PrimaryActionButton
              primary={primary}
              view={view}
              disabled={disabled}
              confirmEndTurn={confirmEndTurn}
              defend={defend}
              counterLabel={counterLabel}
              onSend={onSend}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
