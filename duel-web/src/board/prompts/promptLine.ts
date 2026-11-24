import type { PendingChoiceView, Seat } from "../../net/protocol";
import { confirmQuestion } from "../hand/handPrompt";

export function promptShortLine(choice: PendingChoiceView): string {
  if ((choice.request?.type ?? "confirm") === "confirm") return confirmQuestion(choice.prompt);
  const dash = choice.prompt.indexOf(" — ");
  const body = (dash >= 0 ? choice.prompt.slice(dash + 3) : choice.prompt).trim();
  return body.charAt(0).toUpperCase() + body.slice(1);
}

export function respondSubline(o: {
  oppName: string;
  phase: string;
  mySeat: Seat;
  choice: PendingChoiceView | null | undefined;
}): string {
  if (o.choice && o.choice.seat === o.mySeat) return promptShortLine(o.choice);
  if (o.phase === "block" || o.phase === "counter") {
    return `${o.oppName} is attacking. Block or counter`;
  }
  return "Your answer is needed";
}
