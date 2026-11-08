import type { Dispatch, SetStateAction } from "react";
import type { Intent, PlayerView, Seat } from "../../net/protocol";
import { ChoicePrompt } from "./ChoicePrompt";
import { EffectOrderPrompt } from "./EffectOrderPrompt";
import { canFloat, FloatingPrompt } from "./FloatingPrompt";
import { HandConfirmPrompt } from "./HandConfirmPrompt";
import { HideablePrompt, promptSourceName } from "./HideablePrompt";
import type { handConfirmAnchor } from "../hand/handPrompt";
import { isPromptHidden } from "./promptHide";
import { ReplacePrompt } from "./ReplacePrompt";

/**
 * The one pop-up prompt the board shows for the front pending choice, if any: "which Character do you
 * replace?", a Yes/No on the card just used, a floating search / reveal, the effect order, or the choice
 * itself. Hotseat shows the other seat's choice as a wait notice.
 */
export function PendingChoicePrompt({
  view,
  intents,
  spectating,
  mySeat,
  hotseatPass,
  floatingPrompts,
  replaceOpen,
  replaceCardId,
  replaceHandIndex,
  setReplaceCardId,
  handConfirm,
  hiddenChoiceId,
  setHiddenChoiceId,
  promptBattle,
  wide,
  lp,
  onSendIntent,
  onSendClearing,
}: {
  view: PlayerView;
  intents: Intent[];
  spectating: boolean;
  mySeat: Seat | null;
  /** Hotseat: the device is shared, so the other seat's choice shows a wait notice. */
  hotseatPass: boolean;
  floatingPrompts: boolean;
  replaceOpen: boolean;
  replaceCardId: string | null;
  replaceHandIndex: number;
  setReplaceCardId: Dispatch<SetStateAction<string | null>>;
  handConfirm: ReturnType<typeof handConfirmAnchor>;
  hiddenChoiceId: string | null;
  setHiddenChoiceId: Dispatch<SetStateAction<string | null>>;
  /** Wide boards: mid-battle, the centred prompt keeps off the card being hit. */
  promptBattle: { defenderId: string; attackerId: string } | null;
  wide: boolean;
  lp: boolean;
  onSendIntent: (intent: Intent) => void;
  /** Sends and drops the hand / board selection. */
  onSendClearing: (intent: Intent) => void;
}) {
  return (
    <>
      {!spectating && mySeat != null && replaceOpen && !view.pendingChoices?.length ? (
        <ReplacePrompt
          key={replaceCardId ?? ""}
          view={view}
          intents={intents}
          handIndex={replaceHandIndex}
          mySeat={mySeat}
          onCancel={() => setReplaceCardId(null)}
          onSend={(intent) => {
            setReplaceCardId(null);
            onSendIntent(intent);
          }}
        />
      ) : handConfirm && mySeat != null && view.pendingChoices?.[0] ? (
        <HandConfirmPrompt
          key={view.pendingChoices[0].id}
          choice={view.pendingChoices[0]}
          anchor={handConfirm}
          mySeat={mySeat}
          onSend={onSendClearing}
        />
      ) : floatingPrompts &&
        !spectating &&
        mySeat != null &&
        view.pendingChoices?.[0] &&
        view.pendingChoices[0].seat === mySeat &&
        canFloat(view.pendingChoices[0]) ? (
        <FloatingPrompt
          key={view.pendingChoices[0].id}
          choice={view.pendingChoices[0]}
          mySeat={mySeat}
          onSend={onSendClearing}
        />
      ) : !spectating &&
      view.pendingChoices?.[0]?.kind === "order_effects" &&
      view.pendingChoices[0].seat === mySeat ? (
        <HideablePrompt
          name="Order effects"
          dodge={promptBattle}
          dockable={wide && !lp}
          hidden={isPromptHidden(hiddenChoiceId, view.pendingChoices[0].id)}
          onShow={() => setHiddenChoiceId(null)}
        >
          <EffectOrderPrompt
            key={view.pendingChoices[0].id}
            choice={view.pendingChoices[0]}
            onHide={() => setHiddenChoiceId(view.pendingChoices?.[0]?.id ?? null)}
            onSend={onSendClearing}
          />
        </HideablePrompt>
      ) : !spectating &&
        mySeat != null &&
        view.pendingChoices?.[0] &&
        view.pendingChoices[0].kind !== "order_effects" &&
        view.pendingChoices[0].seat === mySeat ? (
        <HideablePrompt
          name={promptSourceName(view.pendingChoices[0])}
          dodge={promptBattle}
          dockable={wide && !lp}
          hidden={isPromptHidden(hiddenChoiceId, view.pendingChoices[0].id)}
          onShow={() => setHiddenChoiceId(null)}
        >
          <ChoicePrompt
            key={view.pendingChoices[0].id}
            choice={view.pendingChoices[0]}
            mySeat={mySeat}
            view={view}
            hidden={isPromptHidden(hiddenChoiceId, view.pendingChoices[0].id)}
            onHide={() => setHiddenChoiceId(view.pendingChoices?.[0]?.id ?? null)}
            onSend={onSendClearing}
          />
        </HideablePrompt>
      ) : hotseatPass &&
        view.pendingChoices?.[0] &&
        view.pendingChoices[0].seat !== mySeat ? (
        <div className="ability-prompt ability-prompt-waiting" role="status">
          <h3>Waiting for opponent</h3>
          <p>{view.pendingChoices[0].prompt}</p>
          <p className="meta">They are resolving an effect choice.</p>
        </div>
      ) : null}
    </>
  );
}
