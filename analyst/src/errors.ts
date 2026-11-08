import type { RefusalCode } from "@optcg/analyst-contract";

/** A refusal before the stream starts: the route answers with this status and JSON. */
export class ChatHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: "auth" | Refusal | "busy" | "bad_request" | "server",
  ) {
    super(message);
  }
}

/** Why the planner refuses to start (or go on with) an answer: the player's monthly credit is used up, they hit today's cap, or everyone hit the month's cap. */
export type Refusal = RefusalCode;
const REFUSAL_MESSAGES: Record<Refusal, string> = {
  credit: "You've used this month's free Log Pose credit.",
  daily: "Log Pose has reached today's limit. It resets at midnight UTC.",
  monthly: "Log Pose is resting until the 1st.",
};
/**
 * An error whose message is written for the player: when it ends a chat, review or brief, the app shows this text.
 * Any other error shows "Log Pose hit a problem" and is logged.
 */
export class UserFacingError extends Error {}

/** The 429 for a refusal. */
export const refusalError = (r: Refusal) => new ChatHttpError(429, REFUSAL_MESSAGES[r], r);
