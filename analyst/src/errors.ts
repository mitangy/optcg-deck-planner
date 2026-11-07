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
export type Refusal = "credit" | "daily" | "monthly";
const REFUSAL_MESSAGES: Record<Refusal, string> = {
  credit: "You've used this month's free Log Pose credit.",
  daily: "Log Pose has reached today's limit. It resets at midnight UTC.",
  monthly: "Log Pose is resting until the 1st.",
};
/** The 429 for a refusal. */
export const refusalError = (r: Refusal) => new ChatHttpError(429, REFUSAL_MESSAGES[r], r);
