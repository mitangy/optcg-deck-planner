/** The owner-only Usage tab: what Log Pose has cost, per player and per kind and model (#446). */

export type UsagePlayer = {
  userId: number;
  name: string;
  spentUsd: number;
  /** This month's credit (null for an owner) and how much of it was used. */
  creditUsd: number | null;
  creditSpentUsd: number;
  threads: number;
  questions: number;
  refused: number;
  lastUsed: string | null;
};
export type UsageGroup = { kind: string; model: string; requests: number; costUsd: number };
export type UsageSummary = { todayUsd: number; monthUsd: number; totalUsd: number; players: UsagePlayer[]; groups: UsageGroup[] };

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** GET /analyst/usage/summary (owners only). */
export async function fetchUsageSummary(apiBase: string, fetchImpl: typeof fetch = fetch): Promise<UsageSummary> {
  const res = await fetchImpl(`${apiBase}/analyst/usage/summary`, { credentials: "include" });
  if (!res.ok) throw new Error("Could not load usage.");
  return parseUsage(await res.json());
}

export function parseUsage(raw: unknown): UsageSummary {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rows = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : []);
  return {
    todayUsd: n(r.today_usd),
    monthUsd: n(r.month_usd),
    totalUsd: n(r.total_usd),
    players: rows(r.players)
      .filter((p) => typeof p.user_id === "number")
      .map((p) => ({
        userId: p.user_id as number,
        name: typeof p.name === "string" && p.name ? p.name : "Unknown player",
        spentUsd: n(p.spent_usd),
        creditUsd: typeof p.credit_usd === "number" ? p.credit_usd : null,
        creditSpentUsd: n(p.credit_spent_usd),
        threads: n(p.threads),
        questions: n(p.questions),
        refused: n(p.refused),
        lastUsed: typeof p.last_used === "string" ? p.last_used : null,
      })),
    groups: rows(r.groups).map((g) => ({
      kind: typeof g.kind === "string" ? g.kind : "chat",
      model: typeof g.model === "string" && g.model ? g.model : "unknown",
      requests: n(g.requests),
      costUsd: n(g.cost_usd),
    })),
  };
}
