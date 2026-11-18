import { lookupCard } from "../../cards/atlas";
import { counterValueFor, formatCounter } from "../../cards/counterValue";
import { intentLabel } from "../prompts/intentLabel";
import type { Intent, PlayerView } from "../../net/protocol";
import type { Box } from "../combat/battleArc";
import type { DefendModel } from "../combat/defendModel";
import { collapseReplacePlays } from "../combat/dragIntents";
import { isGlobalIntent } from "../prompts/intentFilter";

export function splitCardActions(shown: Intent[]): { card: Intent[]; bar: Intent[] } {
  const collapsed = collapseReplacePlays(shown);
  return {
    card: collapsed.filter((i) => !isGlobalIntent(i)),
    bar: collapsed.filter(isGlobalIntent),
  };
}

export function soleCardButton<T>(
  actions: readonly T[],
  donCounts: readonly number[],
): { kind: "action"; action: T } | null {
  if (actions.length === 1 && donCounts.length === 0) return { kind: "action", action: actions[0]! };
  return null;
}

export function humanizeAbilityId(id: unknown): string | null {
  if (typeof id !== "string" || !/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(id)) return null;
  const words = id.split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type CardActionText = {
  label: string;
  sub: string | null;
  title: string;
};

function targetName(view: PlayerView | undefined, intent: { targetId?: string }): string | null {
  if (intent.targetId == null) return null;
  const full = intentLabel({ type: "activate_ability", sourceId: intent.targetId, abilityId: "" }, view);
  return full.replace(/^Activate /, "");
}

export function cardActionText(anIntent: Intent, view?: PlayerView): CardActionText {
  const title = intentLabel(anIntent, view);
  const intent = anIntent as Intent | { type: "activate_leader"; targetId?: string };
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

export function counterIntentForHand(intents: readonly Intent[], handIndex: number): Intent | null {
  const hits = intents.filter(
    (i) =>
      (i.type === "counter_from_hand" || i.type === "counter_event") && i.handIndex === handIndex,
  );
  return hits.length === 1 ? hits[0]! : null;
}

export function counterIntentForCard(
  intents: readonly Intent[],
  hand: readonly { id: string }[],
  cardId: string,
): Intent | null {
  const idx = hand.findIndex((c) => c.id === cardId);
  return idx < 0 ? null : counterIntentForHand(intents, idx);
}

export function blockIntentFor(intents: readonly Intent[], blockerId: string): Intent | null {
  return intents.find((i) => i.type === "declare_block" && i.blockerId === blockerId) ?? null;
}

export function counterPrimaryLabel(
  model: Pick<DefendModel, "remaining" | "stagedIds"> & { stagedUnknown?: boolean },
  tray: boolean,
): string {
  if (tray && model.stagedIds.length > 0) {
    const short = model.remaining != null && model.remaining > 0 && !model.stagedUnknown;
    return short ? "Counter anyway (still lose)" : "Confirm counter";
  }
  if (model.remaining === 0) return "Resolve";
  return tray ? "Take hit" : "Pass counter";
}

export type PopoverPlacement = { left: number; top: number; above: boolean };
export type PopoverSize = { width: number; height: number };

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
  const preferred = aboveBottom - edge > viewport.height - edge - belowTop ? aboveBottom - size.height : belowTop;
  const top = Math.min(Math.max(preferred, edge), Math.max(edge, viewport.height - edge - size.height));
  return { left, top, above: false };
}
