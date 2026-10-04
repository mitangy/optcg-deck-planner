import type { Intent, PendingChoiceView, PlayerView, Seat } from "../net/protocol";
import type { Box } from "./battleArc";

/** The card an intent just played from your hand, and where it sat. */
export type HandUse = { instanceId: string; defId: string; box: Box };

/**
 * Remembers where a hand card was when an intent used it (an event, a counter
 * event, a play). Once sent, the card leaves the hand, so a Yes/No it asks for
 * next can still be shown where the player last saw it.
 */
export function handUseFromIntent(
  intent: Intent,
  hand: PlayerView["you"]["hand"],
  measure: (instanceId: string) => Box | null,
): HandUse | null {
  if (typeof intent.handIndex !== "number") return null;
  const card = hand[intent.handIndex];
  if (!card) return null;
  const box = measure(card.id);
  return box ? { instanceId: card.id, defId: card.defId, box } : null;
}

/**
 * Where to show this choice as a small Yes/No above the hand instead of the
 * centred pop-up: a confirm of yours asked by the card you just used from your
 * hand, while that card is still resolving.
 */
export function handConfirmAnchor(
  choice: PendingChoiceView | null | undefined,
  mySeat: Seat | null,
  used: HandUse | null,
  you: PlayerView["you"] | null | undefined,
): Box | null {
  if (!choice || !used || !you || mySeat == null) return null;
  if (choice.seat !== mySeat) return null;
  if (choice.kind === "life_trigger" || choice.kind === "order_effects") return null;
  if ((choice.request?.type ?? "confirm") !== "confirm") return null;
  if (choice.sourceInstanceId !== used.instanceId) return null;
  // Still mid-resolution: an event between hand and trash, not a card on the field.
  if (!you.resolving?.some((c) => c.id === used.instanceId)) return null;
  return used.box;
}

/**
 * The question part of a server confirm prompt, without the card name in
 * front or the full card text after it: "Haki — rest 1 DON!!…? [Counter] …"
 * becomes "Rest 1 DON!!…?".
 */
export function confirmQuestion(prompt: string): string {
  const dash = prompt.indexOf(" — ");
  const body = (dash >= 0 ? prompt.slice(dash + 3) : prompt).trim();
  let question: string;
  if (/^pay the cost to activate:/i.test(body)) question = "Pay the cost to use this effect?";
  else {
    const mark = body.indexOf("?");
    question = mark >= 0 ? body.slice(0, mark + 1) : body;
  }
  return question.charAt(0).toUpperCase() + question.slice(1);
}

/**
 * A hand card's resting rect: centred where it is drawn, at its unrotated size
 * (fanned cards are tilted, so their bounding box runs wider than the card).
 * On phones the counter step lists hand cards as defend-tray chips instead;
 * then it is the chip's card thumbnail.
 */
export function measureHandCard(instanceId: string): Box | null {
  if (typeof document === "undefined") return null;
  const id = CSS.escape(instanceId);
  const el =
    document.querySelector<HTMLElement>(`[data-motion-id="${id}"]`) ??
    document.querySelector<HTMLElement>(`[data-hand-card-id="${id}"] .defend-chip-thumb`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  if (!width || !height) return null;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  return { left: cx - width / 2, top: cy - height / 2, width, height };
}
