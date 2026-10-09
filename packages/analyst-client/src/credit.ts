/** The player's monthly Log Pose credit and the limits that can stop them: what the panel's meter and notices say (#446). */
import type { DonePayload } from "./client";

export type RefusalCode = "credit" | "daily" | "monthly";

export type Credit = {
  /** This month's credit in dollars; null for an owner, who has none to run out of. */
  creditUsd: number | null;
  spentUsd: number;
  /** When the credit refills (ISO, the 1st at 00:00 UTC). */
  resetsAt: string | null;
  /** The limit that stops the player now, if any. */
  refusal: RefusalCode | null;
  /** The player's own average chat cost, once they have asked something. */
  avgChatCostUsd: number | null;
  /** They already asked owners for more. */
  topupRequested: boolean;
};

/** Under this much left the panel says how many questions are left. */
export const LOW_CREDIT_USD = 1;
/** A chat answer on the default model costs about this much; used until the player has their own average. */
export const FALLBACK_CHAT_USD = 0.07;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** GET /analyst/chat/credit; null when the body isn't one. */
export function parseCredit(raw: unknown): Credit | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const refusal = r.refusal === "credit" || r.refusal === "daily" || r.refusal === "monthly" ? r.refusal : null;
  return {
    creditUsd: num(r.credit_usd),
    spentUsd: num(r.credit_spent_usd) ?? 0,
    resetsAt: typeof r.credit_resets_at === "string" && r.credit_resets_at ? r.credit_resets_at : null,
    refusal,
    avgChatCostUsd: num(r.avg_chat_cost_usd),
    topupRequested: r.topup_requested === true,
  };
}

export async function fetchCredit(apiBase: string, fetchImpl: typeof fetch = fetch): Promise<Credit | null> {
  try {
    const res = await fetchImpl(`${apiBase}/analyst/chat/credit`, { credentials: "include" });
    return res.ok ? parseCredit(await res.json()) : null;
  } catch {
    return null;
  }
}

export const formatUsd = (n: number): string => `$${Math.max(0, n).toFixed(2)}`;

/** Dollars left this month; null for an owner. */
export function creditLeft(c: Credit): number | null {
  return c.creditUsd === null ? null : Math.max(0, c.creditUsd - c.spentUsd);
}

/** "$3.40 of $5.00 left this month" */
export function meterText(c: Credit): string | null {
  const left = creditLeft(c);
  return left === null || c.creditUsd === null ? null : `${formatUsd(left)} of ${formatUsd(c.creditUsd)} left this month`;
}

/** How full the meter is, 0 to 1. */
export function meterFill(c: Credit): number {
  const left = creditLeft(c);
  if (left === null || !c.creditUsd || c.creditUsd <= 0) return 0;
  return Math.min(1, left / c.creditUsd);
}

/** Questions left at the player's own average chat cost (the fallback until they have one), never less than one while any credit is left. */
export function questionsLeft(c: Credit): number {
  const left = creditLeft(c) ?? 0;
  const per = c.avgChatCostUsd && c.avgChatCostUsd > 0 ? c.avgChatCostUsd : FALLBACK_CHAT_USD;
  return left > 0 ? Math.max(1, Math.floor(left / per)) : 0;
}

/** "About 15 questions left" while the player is under a dollar from the end of their credit; null otherwise. */
export function lowCreditText(c: Credit): string | null {
  const left = creditLeft(c);
  if (c.refusal || left === null || left <= 0 || left >= LOW_CREDIT_USD) return null;
  const n = questionsLeft(c);
  return `About ${n} question${n === 1 ? "" : "s"} left`;
}

/** "November 1" in UTC, the day the credit refills. */
export function refillDay(resetsAt: string | null): string {
  const t = resetsAt ? Date.parse(resetsAt) : NaN;
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }) : "the 1st";
}

/** What replaces the input when a limit stops the player. */
export function limitText(c: Credit): string | null {
  if (c.refusal === "credit") {
    const credit = c.creditUsd === null ? "" : ` ${formatUsd(c.creditUsd)}`;
    return `You've used this month's free${credit} of Log Pose. It refills on ${refillDay(c.resetsAt)}. Your threads, saved reviews and briefs stay here to read.`;
  }
  if (c.refusal === "daily") {
    const left = creditLeft(c);
    return `You've hit today's Log Pose limit. It's back at midnight UTC${left === null ? "." : `, with ${formatUsd(left)} of credit left.`}`;
  }
  if (c.refusal === "monthly") return "Log Pose is resting until the 1st.";
  return null;
}

/** The credit after an answer: the done event carries the new figures. */
export function applyDone(c: Credit | null, d: DonePayload): Credit | null {
  if (!c || d.credit_spent_usd === undefined) return c;
  return { ...c, creditUsd: d.credit_usd === undefined ? c.creditUsd : d.credit_usd, spentUsd: d.credit_spent_usd, refusal: d.refusal ?? null };
}

/** The credit with a refusal an answer came back with, when the meter hasn't been loaded. */
export function withRefusal(c: Credit | null, code: RefusalCode): Credit {
  return { creditUsd: null, spentUsd: 0, resetsAt: null, avgChatCostUsd: null, topupRequested: false, ...c, refusal: code };
}

/** POST /analyst/access/topup: ask owners for more credit. */
export async function requestTopup(apiBase: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl(`${apiBase}/analyst/access/topup`, { method: "POST", credentials: "include" });
  if (!res.ok) throw new Error("Couldn't send that. Try again in a moment.");
}
