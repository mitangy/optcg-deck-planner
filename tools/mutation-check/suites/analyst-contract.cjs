/** analyst-contract mutations (packages/analyst-contract/src, vitest): the Log Pose values the analyst, the client and the API share. */
const contract = "packages/analyst-contract/src/index.ts";
module.exports = {
  cwd: "packages/analyst-contract",
  runner: "vitest",
  mutations: [
    // The TypeScript side drifts from backend-values.json (the API's copy is pinned by the backend suite).
    { id: "contract-scope-pattern-drifts", file: contract, from: "match:[A-Za-z0-9_-]{1,64}|deck:planner", to: "match:[A-Za-z0-9_-]{1,63}|deck:planner", kills: ["uses the scope pattern text the API validates with"] },
    { id: "contract-planner-scope-unbounded", file: contract, from: "deck:planner:[0-9]{1,12}", to: "deck:planner:[0-9]+", kills: ["takes the scopes of a page, a match and a deck and refuses anything else"] },
    { id: "contract-model-order-drifts", file: contract, from: "[MODELS.sonnet, MODELS.opus, MODELS.haiku, MODELS.haiku45];", to: "[MODELS.opus, MODELS.sonnet, MODELS.haiku, MODELS.haiku45];", kills: ["offers the same models, in the same order, as the API's allow-list"] },
    { id: "contract-model-dropped", file: contract, from: "[MODELS.sonnet, MODELS.opus, MODELS.haiku, MODELS.haiku45];", to: "[MODELS.sonnet, MODELS.opus, MODELS.haiku];", kills: ["offers the same models, in the same order, as the API's allow-list"] },
    { id: "contract-refusal-code-drifts", file: contract, from: 'REFUSAL_CODES = ["credit", "daily", "monthly"] as const;', to: 'REFUSAL_CODES = ["credit", "daily", "month"] as const;', kills: ["names the same refusals as the API's budget answer"] },
    { id: "contract-busy-limit-dropped", file: contract, from: 'LIMIT_CODES = [...REFUSAL_CODES, "busy"] as const;', to: "LIMIT_CODES = [...REFUSAL_CODES] as const;", kills: ["names the same limits as the API's refused usage row"] },
  ],
};
