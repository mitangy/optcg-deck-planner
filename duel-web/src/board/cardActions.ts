import { lookupCard } from "../cards/atlas";
import { counterValueFor, formatCounter } from "../cards/counterValue";
import { intentLabel, type Intent, type PlayerView } from "../net/protocol";
import type { Box } from "./battleArc";
import type { DefendModel } from "./defendModel";
import { collapseReplacePlays } from "./dragIntents";
import { isGlobalIntent } from "./intentFilter";

/**
 * Splits the selection's actions: per-card ones (play, attack, activate, give
 * DON!!, counter) go on the card itself, phase-wide ones (mulligan, triggers)
 * stay in the intent bar.
 */
export function splitCardActions(shown: Intent[]): { card: Intent[]; bar: Intent[] } {
  const collapsed = collapseReplacePlays(shown);
  return {
    card: collapsed.filter((i) => !isGlobalIntent(i)),
    bar: collapsed.filter(isGlobalIntent),
  };
}

/** "leader_give_rested_don" -> "Leader give rested don"; opaque ids ("a1") -> null. */
export function humanizeAbilityId(id: unknown): string | null {
  if (typeof id !== "string" || !/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(id)) return null;
  const words = id.split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type CardActionText = {
  /** Button text, e.g. "Activate Ability", "Counter +2000". */
  label: string;
  /** Small second line: the ability or the target it applies to. */
  sub: string | null;
  /** Full text for screen readers and the tooltip. */
  title: string;
};

function targetName(view: PlayerView | undefined, intent: Intent): string | null {
  if (intent.targetId == null) return null;
  // intentLabel already resolves the name; "Activate X → Y" ends with Y.
  const full = intentLabel({ type: "activate_ability", sourceId: intent.targetId }, view);
  return full.replace(/^Activate /, "");
}

/** Wording for a button that sits on the card it acts on. */
export function cardActionText(intent: Intent, view?: PlayerView): CardActionText {
  const title = intentLabel(intent, view);
  switch (intent.type) {
    case "activate_ability": {
      const target = targetName(view, intent);
      return {
        label: "Activate Ability",
        sub: target ? `→ ${target}` : humanizeAbilityId(intent.abilityId),
        title,
      };
    }
    case "activate_leader": {
      const target = targetName(view, intent);
      return { label: "Activate Leader", sub: target ? `→ ${target}` : null, title };
    }
    case "counter_from_hand": {
      const card = typeof intent.handIndex === "number" ? view?.you.hand[intent.handIndex] : null;
      const value = card ? (card.counter ?? counterValueFor(lookupCard(card.defId))?.base ?? null) : null;
      return { label: value != null ? `Counter +${value}` : "Counter", sub: null, title };
    }
    case "counter_event": {
      const card = typeof intent.handIndex === "number" ? view?.you.hand[intent.handIndex] : null;
      const value = card ? counterValueFor(lookupCard(card.defId)) : null;
      return {
        label: value && !value.effectOnly ? `Counter ${formatCounter(value)}` : "Counter event",
        sub: card?.playCost != null ? `Event · ${card.playCost} DON!!` : "Event",
        title,
      };
    }
    case "play_card":
      return {
        label: intent.trashCharacterId != null ? "Play (replace…)" : "Play",
        sub: null,
        title,
      };
    default:
      return { label: title, sub: null, title };
  }
}

/** The Counter play for this hand slot when exactly one exists (what one-tap sends). */
export function counterIntentForHand(intents: readonly Intent[], handIndex: number): Intent | null {
  const hits = intents.filter(
    (i) =>
      (i.type === "counter_from_hand" || i.type === "counter_event") && i.handIndex === handIndex,
  );
  return hits.length === 1 ? hits[0]! : null;
}

/** The Counter play for a hand card by id (the defend tray's chips know ids, not slots). */
export function counterIntentForCard(
  intents: readonly Intent[],
  hand: readonly { id: string }[],
  cardId: string,
): Intent | null {
  const idx = hand.findIndex((c) => c.id === cardId);
  return idx < 0 ? null : counterIntentForHand(intents, idx);
}

/** The block declaration for this Blocker, if legal. */
export function blockIntentFor(intents: readonly Intent[], blockerId: string): Intent | null {
  return intents.find((i) => i.type === "declare_block" && i.blockerId === blockerId) ?? null;
}

/**
 * Text of the counter step's primary button. Once the defender is already
 * safe (nothing more is needed) it reads "Resolve" rather than a pass / take-hit.
 * `tray` is the phone tray, whose staged counters turn it into "Confirm counter".
 */
export function counterPrimaryLabel(
  model: Pick<DefendModel, "remaining" | "stagedIds"> & { stagedUnknown?: boolean },
  tray: boolean,
): string {
  if (tray && model.stagedIds.length > 0) {
    // Staged but still short: confirming spends the cards and the hit lands anyway.
    const short = model.remaining != null && model.remaining > 0 && !model.stagedUnknown;
    return short ? "Counter anyway (still lose)" : "Confirm counter";
  }
  if (model.remaining === 0) return "Resolve";
  return tray ? "Take hit" : "Pass counter";
}

export type PopoverPlacement = { left: number; top: number; above: boolean };
export type PopoverSize = { width: number; height: number };

/**
 * Where a card's popover goes: centred on the card (clamped inside the
 * viewport), tucked over the card's top edge when its whole height fits above,
 * else below the card when it fits there, else clamped so every button stays
 * on screen (it then covers part of the card). `top` is the anchor edge (the
 * popover's bottom when `above`, its top otherwise). A positive `overlap`
 * tucks it over the card's edge; a negative one leaves a gap.
 */
export function popoverPlacement(
  box: Box,
  size: PopoverSize,
  viewport: PopoverSize,
  edge = 8,
  overlap = 10,
): PopoverPlacement {
  const half = size.width / 2;
  const cx = box.left + box.width / 2;
  const left = Math.min(Math.max(cx, edge + half), Math.max(edge + half, viewport.width - edge - half));
  const aboveBottom = box.top + overlap;
  const belowTop = box.top + box.height - overlap;
  if (aboveBottom - size.height >= edge) return { left, top: aboveBottom, above: true };
  if (belowTop + size.height <= viewport.height - edge) return { left, top: belowTop, above: false };
  // Neither side has room: take the roomier one and slide it back on screen.
  const preferred = aboveBottom - edge > viewport.height - edge - belowTop ? aboveBottom - size.height : belowTop;
  const top = Math.min(Math.max(preferred, edge), Math.max(edge, viewport.height - edge - size.height));
  return { left, top, above: false };
}
