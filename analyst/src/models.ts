import { CHAT_MODEL_IDS, MODELS } from "@optcg/analyst-contract";
import type { Usage } from "./types";

export { MODELS };

export const CHAT_MODEL = process.env.ANALYST_CHAT_MODEL || MODELS.sonnet;
export const CHAT_MODELS: string[] = [...CHAT_MODEL_IDS];
const NO_EFFORT_MODELS: string[] = [MODELS.haiku45];
export const outputConfigFor = (model: string, effort: "low" | "medium" | "high") => (NO_EFFORT_MODELS.includes(model) ? {} : { output_config: { effort } });

type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };
const OPUS_PRICE: Price = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
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

export const modelOf = (budget: { model?: unknown }): string => (typeof budget.model === "string" && CHAT_MODELS.includes(budget.model) ? budget.model : CHAT_MODEL);
