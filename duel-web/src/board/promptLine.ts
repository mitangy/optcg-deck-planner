import type { PendingChoiceView, Seat } from "../net/protocol";
import { confirmQuestion } from "./handPrompt";

/**
 * One short line for a pending choice, for the midline banner and the status
 * panel (the pop-up itself keeps the full server text). A confirm shows just
 * its question ("Rest 1 DON!!…?"); a pick shows what the effect asks for, with
 * the card name and its leading dash dropped: "Nico Robin — choose up to 1
 * card to K.O." becomes "Choose up to 1 card to K.O.".
 */
export function promptShortLine(choice: PendingChoiceView): string {
  if ((choice.request?.type ?? "confirm") === "confirm") return confirmQuestion(choice.prompt);
  const dash = choice.prompt.indexOf(" — ");
  const body = (dash >= 0 ? choice.prompt.slice(dash + 3) : choice.prompt).trim();
  return body.charAt(0).toUpperCase() + body.slice(1);
}

/**
 * The sub-line under "Your response". What you are answering depends on what
 * is open: your own prompt first (the effect's question), and only a block or
 * counter step with nothing open says "block or counter".
 */
export function respondSubline(o: {
  oppName: string;
  phase: string;
  mySeat: Seat;
  choice: PendingChoiceView | null | undefined;
}): string {
  if (o.choice && o.choice.seat === o.mySeat) return promptShortLine(o.choice);
  if (o.phase === "block" || o.phase === "counter") {
    return `${o.oppName} is attacking — block or counter`;
  }
  return "Your answer is needed";
}
