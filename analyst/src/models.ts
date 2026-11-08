/**
 * The models Log Pose runs on and what they cost: the default, the allow-list the planner's model setting picks
 * from, and the price table. The evals price their runs with `costUsd` from here too.
 */
import { CHAT_MODEL_IDS, MODELS } from "@optcg/analyst-contract";
import type { Usage } from "./types";

/** Every model id Log Pose uses lives in the contract package (the evals' judge and extractor models come from here too). */
export { MODELS };

export const CHAT_MODEL = process.env.ANALYST_CHAT_MODEL || MODELS.sonnet;
/** The models the planner may pick for Log Pose (its model setting); anything else falls back to CHAT_MODEL. */
export const CHAT_MODELS: string[] = [...CHAT_MODEL_IDS];
/** Haiku 4.5 rejects output_config.effort; every other offered model takes it. */
const NO_EFFORT_MODELS: string[] = [MODELS.haiku45];
/** The request's `output_config` for a model: the effort, unless the model does not support one. */
export const outputConfigFor = (model: string, effort: "low" | "medium" | "high") => (NO_EFFORT_MODELS.includes(model) ? {} : { output_config: { effort } });

/** Dollars per million tokens: input, output, cache reads, cache writes. */
type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };
const OPUS_PRICE: Price = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
/** Haiku 5.5 is priced by the size of one call's prompt: the first tier up to 100K tokens, the second beyond. */
const HAIKU_5_5_TIER_TOKENS = 100_000;
const HAIKU_5_5_PRICE: Price = { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 };
const HAIKU_5_5_LONG_PRICE: Price = { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 };
const PRICES: Record<string, Price> = {
  [MODELS.opus]: OPUS_PRICE,
  [MODELS.sonnet]: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  [MODELS.haiku45]: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

/** What ONE model call cost, priced by the model that served it. An unknown model is priced as Opus, the dearest, so caps never undercount. */
export function costUsd(u: Usage, model: string = CHAT_MODEL): number {
  const m = 1_000_000;
  let price = PRICES[model] ?? OPUS_PRICE;
  if (model === MODELS.haiku) {
    const prompt = u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    price = prompt > HAIKU_5_5_TIER_TOKENS ? HAIKU_5_5_LONG_PRICE : HAIKU_5_5_PRICE;
  }
  return (
    (u.input_tokens * price.input +
      u.output_tokens * price.output +
      (u.cache_read_input_tokens ?? 0) * price.cacheRead +
      (u.cache_creation_input_tokens ?? 0) * price.cacheWrite) /
    m
  );
}

/** The model a budget answer names, if it is one we offer; else the env/default CHAT_MODEL. */
export const modelOf = (budget: { model?: unknown }): string => (typeof budget.model === "string" && CHAT_MODELS.includes(budget.model) ? budget.model : CHAT_MODEL);
