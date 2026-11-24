import { useContext } from "react";
import { intentLabel } from "./intentLabel";
import { noActionReason } from "./noActionReason";
import type { Intent, PlayerView } from "../../net/protocol";
import { splitCardActions } from "../input/cardActions";
import { isReplacePlay } from "../combat/dragIntents";
import { actionKeyTags } from "../input/hotkeys";
import { filterIntentsForSelection } from "./intentFilter";
import { PromptSlotContext } from "./promptSlot";
import { splitPrimaryIntent } from "./primaryIntent";
import { PrimaryActionButton, WaitingIndicator, intentBtnClass } from "./PrimaryDock";
import type { WaitingOnOpponent } from "../match/waitingOnOpponent";
import { useDuelSettings } from "../../settings";

type Props = {
  intents: Intent[];
  view?: PlayerView;
  disabled?: boolean;
  filterHandIndex?: number | null;
  selectedBoardId?: string | null;
  confirmEndTurn?: { reason: string | null } | null;
  onSend: (intent: Intent) => void;
  onChooseReplace?: (handIndex: number) => void;
  defend?: { label: string; onPress?: () => void };
  counterLabel?: string;
  onCard?: { count: number; active: boolean };
  waiting?: WaitingOnOpponent | null;
  idle?: "prompt" | "opponent" | null;
};

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
  onCard,
  waiting = null,
  idle = null,
}: Props) {
  const handIndex = filterHandIndex ?? null;
  const boardId = selectedBoardId ?? null;
  const { primary, rest } = splitPrimaryIntent(intents);
  const selected = defend ? [] : filterIntentsForSelection(rest, { handIndex, boardId });
  const split = splitCardActions(selected);
  const shown = onCard ? split.bar : [...split.card, ...split.bar];
  const keyTags = actionKeyTags(shown, onCard?.count ?? 0);
  const showKeyTags = useDuelSettings().shortcutTags;
  const mulliganPhase = view?.phase === "mulligan";
  const nothingSelected = handIndex == null && boardId == null;
  const setPromptSlot = useContext(PromptSlotContext).setSlot;

  if (shown.length === 0 && !primary && waiting) {
    return (
      <div className="intent-bar intent-bar-waiting">
        <WaitingIndicator waiting={waiting} />
      </div>
    );
  }

  if (shown.length === 0 && !primary) {
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
          {shown.length === 0 && !defend ? (
            <p className="intent-empty">
              {onCard?.active
                ? "Choose an action on the card"
                : nothingSelected
                  ? "Select a card for actions"
                  : (view ? noActionReason(view, { handIndex, boardId }) : null) ?? "No actions for this card"}
            </p>
          ) : null}
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
                  ? onChooseReplace(intent.handIndex)
                  : onSend(intent)
              }
            >
              {onChooseReplace && isReplacePlay(intent)
                ? `${intentLabel({ type: "play_card", handIndex: intent.handIndex }, view)} (choose replacement)`
                : intentLabel(intent, view)}
            </button>
          ))}
        </div>
        {primary ? (
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
