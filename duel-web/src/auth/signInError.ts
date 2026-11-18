import { ApiError } from "../net/api";

export class MissingTicketError extends Error {
  constructor() {
    super("Missing login ticket");
    this.name = "MissingTicketError";
  }
}

export class BannedError extends Error {
  constructor() {
    super("Account banned");
    this.name = "BannedError";
  }
}

export const BANNED_MESSAGE = "This account has been banned.";

export function signInErrorMessage(e: unknown): string {
  if (e instanceof BannedError || (e instanceof ApiError && e.status === 403)) return BANNED_MESSAGE;
  if (e instanceof MissingTicketError) {
    return "This sign-in link is incomplete. Please sign in again.";
  }
  if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
    return "This sign-in link has expired or was already used. Please sign in again.";
  }
  return "We couldn't finish signing you in. Please try again in a moment.";
}
