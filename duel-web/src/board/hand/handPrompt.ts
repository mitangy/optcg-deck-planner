import type { Intent, PendingChoiceView, PlayerView, Seat } from "../../net/protocol";
import { handIndexOf } from "../prompts/intentFields";
import type { Box } from "../combat/battleArc";

export type HandUse = { instanceId: string; defId: string; box: Box };

export function handUseFromIntent(
  intent: Intent,
  hand: PlayerView["you"]["hand"],
  measure: (instanceId: string) => Box | null,
): HandUse | null {
  const handIndex = handIndexOf(intent);
  if (handIndex === undefined) return null;
  const card = hand[handIndex];
  if (!card) return null;
  const box = measure(card.id);
  return box ? { instanceId: card.id, defId: card.defId, box } : null;
}

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
  // The centred prompt owns an unpayable cost.
  if (choice.unpayable) return null;
  if (choice.sourceInstanceId !== used.instanceId) return null;
  if (!you.resolving?.some((c) => c.id === used.instanceId)) return null;
  return used.box;
}

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
