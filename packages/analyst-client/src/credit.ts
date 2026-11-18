import { formatMoney } from "@optcg/card-core";
import { isRefusalCode, type RefusalCode } from "@optcg/analyst-contract";
import type { DonePayload } from "./client";

export type { RefusalCode };

export type Credit = {
  creditUsd: number | null;
  spentUsd: number;
  resetsAt: string | null;
  refusal: RefusalCode | null;
  avgChatCostUsd: number | null;
  topupRequested: boolean;
};

export const LOW_CREDIT_USD = 1;
export const FALLBACK_CHAT_USD = 0.07;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseCredit(raw: unknown): Credit | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const refusal = isRefusalCode(r.refusal) ? r.refusal : null;
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

export const formatUsd = (n: number): string => formatMoney(Math.max(0, n));

export function creditLeft(c: Credit): number | null {
  return c.creditUsd === null ? null : Math.max(0, c.creditUsd - c.spentUsd);
}

export function meterText(c: Credit): string | null {
  const left = creditLeft(c);
  return left === null || c.creditUsd === null ? null : `${formatUsd(left)} of ${formatUsd(c.creditUsd)} left this month`;
}

export function meterFill(c: Credit): number {
  const left = creditLeft(c);
  if (left === null || !c.creditUsd || c.creditUsd <= 0) return 0;
  return Math.min(1, left / c.creditUsd);
}

export function questionsLeft(c: Credit): number {
  const left = creditLeft(c) ?? 0;
  const per = c.avgChatCostUsd && c.avgChatCostUsd > 0 ? c.avgChatCostUsd : FALLBACK_CHAT_USD;
  return left > 0 ? Math.max(1, Math.floor(left / per)) : 0;
}

export function lowCreditText(c: Credit): string | null {
  const left = creditLeft(c);
  if (c.refusal || left === null || left <= 0 || left >= LOW_CREDIT_USD) return null;
  const n = questionsLeft(c);
  return `About ${n} question${n === 1 ? "" : "s"} left`;
}

export function refillDay(resetsAt: string | null): string {
  const t = resetsAt ? Date.parse(resetsAt) : NaN;
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }) : "the 1st";
}

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

export function applyDone(c: Credit | null, d: DonePayload): Credit | null {
  if (!c || d.credit_spent_usd === undefined) return c;
  return { ...c, creditUsd: d.credit_usd === undefined ? c.creditUsd : d.credit_usd, spentUsd: d.credit_spent_usd, refusal: d.refusal ?? null };
}

export function withRefusal(c: Credit | null, code: RefusalCode): Credit {
  return { creditUsd: null, spentUsd: 0, resetsAt: null, avgChatCostUsd: null, topupRequested: false, ...c, refusal: code };
}

export async function requestTopup(apiBase: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl(`${apiBase}/analyst/access/topup`, { method: "POST", credentials: "include" });
  if (!res.ok) throw new Error("Couldn't send that. Try again in a moment.");
}
