import type { Intent, PlayerView, Seat, TimerMessage } from "../../net/protocol";
import type { DuelSettings } from "../../settings";
import { blockIntentFor, counterIntentForCard } from "../input/cardActions";
import { DefendTray } from "./DefendTray";
import { clockFraction } from "./defendTrayModel";
import type { DragPayload } from "./dragIntents";
import type { useDefendFlow } from "./useDefendFlow";

type DefendFlow = ReturnType<typeof useDefendFlow>;

// The block/counter tray: under the player's hand on phones, or in the rail on wider layouts.
export function BoardDefendTray({
  defend,
  summary,
  railDefend,
  trayHere,
  handCount,
  boardSeat,
  timer,
  now,
  prefs,
  intents,
  you,
  setStagedBlockerId,
  setStagedCounterIds,
  skipBlockToCounter,
  onSendIntent,
  setDragPayload,
  commitDrop,
}: {
  defend: NonNullable<DefendFlow["defend"]>;
  summary: boolean;
  railDefend: boolean;
  trayHere: boolean;
  handCount: number;
  boardSeat: Seat;
  timer: TimerMessage | null;
  now: number;
  prefs: DuelSettings;
  intents: Intent[];
  you: PlayerView["you"];
  setStagedBlockerId: DefendFlow["setStagedBlockerId"];
  setStagedCounterIds: DefendFlow["setStagedCounterIds"];
  skipBlockToCounter: DefendFlow["skipBlockToCounter"];
  onSendIntent: (intent: Intent) => void;
  setDragPayload: (payload: DragPayload | null) => void;
  commitDrop: (payload: DragPayload, clientX: number, clientY: number) => void;
}) {
  return (
    <DefendTray
      model={defend}
      summary={summary}
      layout={railDefend ? "rail" : "tray"}
      handCount={trayHere ? handCount : undefined}
      ownerSeat={boardSeat}
      clock={clockFraction(timer, now, boardSeat)}
      onToggleBlocker={(id) => {
        const block = prefs.oneTapActions || railDefend ? blockIntentFor(intents, id) : null;
        if (block) {
          setStagedBlockerId(null);
          onSendIntent(block);
        } else setStagedBlockerId((cur) => (cur === id ? null : id));
      }}
      onToggleCounter={(id) => {
        const counter =
          prefs.oneTapActions || railDefend ? counterIntentForCard(intents, you.hand, id) : null;
        if (counter) onSendIntent(counter);
        else
          setStagedCounterIds((cur) =>
            cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
          );
      }}
      onCounterEvent={(i) => {
        const intent = defend.events[i]?.intent;
        if (intent) onSendIntent(intent);
      }}
      onSkipBlockCounter={(id) => skipBlockToCounter(id, prefs.oneTapActions || railDefend ? "send" : "stage")}
      counterDrag={
        defend.phase === "counter" || defend.earlyCounters.length > 0
          ? {
              onStart: (cardId) => {
                const handIndex = you.hand.findIndex((c) => c.id === cardId);
                if (handIndex >= 0) setDragPayload({ type: "counter", handIndex });
              },
              onEnd: (cardId, x, y) => {
                const handIndex = you.hand.findIndex((c) => c.id === cardId);
                if (handIndex >= 0) commitDrop({ type: "counter", handIndex }, x, y);
                else setDragPayload(null);
              },
              onCancel: () => setDragPayload(null),
            }
          : undefined
      }
    />
  );
}
