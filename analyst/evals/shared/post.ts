/**
 * Posts one eval run to the admin page (POST /admin/evals, #667, suites #679). Every eval's `--post` goes through this.
 *
 *   import { postEvalRun } from "../post";
 *   const res = await postEvalRun({ suite: "puzzles", label: variant, model, correct: 41, total: 50, spend_usd: 3.2 });
 *   console.log(res.message);
 *
 * Needs ANALYST_API_URL and ANALYST_SERVICE_SECRET in the environment. It never throws: a failed post is a message,
 * so a paid run that finished is not lost to a network blip.
 */

export const EVAL_SUITES = ["main", "review_facts", "puzzles", "deck_advice"] as const;
export type EvalSuite = (typeof EVAL_SUITES)[number];

export type EvalRunPost = {
  /** Which eval this is. Omitted means the main Log Pose eval. */
  suite?: EvalSuite;
  run_at?: string;
  label?: string;
  model?: string;
  /** A score: correct out of total (cases, or any count). Leave both out for a run that only has a metric. */
  correct?: number;
  total?: number;
  /** The headline when a suite is not a score, e.g. "Wrong claims per review" 0.85 with lower_is_better. */
  metric_name?: string;
  metric_value?: number;
  lower_is_better?: boolean;
  groups?: Record<string, { correct: number; total: number }>;
  spend_usd?: number;
  notes?: string;
};

export type PostResult = { ok: boolean; message: string };

export async function postEvalRun(
  run: EvalRunPost,
  opts: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch } = {},
): Promise<PostResult> {
  const env = opts.env ?? process.env;
  const url = env.ANALYST_API_URL;
  const secret = env.ANALYST_SERVICE_SECRET;
  if (!url || !secret) return { ok: false, message: "--post needs ANALYST_API_URL and ANALYST_SERVICE_SECRET; not posted." };
  const suite = run.suite ?? "main";
  try {
    const res = await (opts.fetchImpl ?? fetch)(`${url.replace(/\/+$/, "")}/admin/evals`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-analyst-service": secret },
      body: JSON.stringify({ ...run, suite }),
    });
    return res.ok
      ? { ok: true, message: `posted the ${suite} run to /admin/evals` }
      : { ok: false, message: `post to /admin/evals failed: HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: `post to /admin/evals failed: ${e instanceof Error ? e.message : e}` };
  }
}
