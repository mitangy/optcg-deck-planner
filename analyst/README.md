# `@optcg/analyst`: Log Pose

Deck analyst tools for Claude, served over MCP. You add this server to the Claude app as a custom connector, and Claude (on your own Claude plan) uses the tools to look up cards and analyze decks. The server runs no model and needs no API key.

Design doc: https://claude.ai/artifact/DHEmpEwqp9UD1btA2BN5Rv

## Tools

| Tool | What it does |
|------|--------------|
| `search_cards` | Filter every card by text, colors, type, cost, power, counter, traits, attributes, keywords, ability timing, effect kind (K.O., bounce, search, draw…), set, or what a given leader may include (`legalFor`). |
| `get_cards` | Full printed text, stats, timings, effect kinds and the parsed ability structure, by card number or exact name. |
| `analyze_deck` | Loads a pasted list (OPTCGSim `4xOP01-006`, Limitless `4 OP01-006`) or a deck planner share link and returns legality, build hints, curve, counters, roles, opening-hand expectations and searcher odds (from `@optcg/deck-analytics`). |
| `draw_odds` | Exact odds of seeing at least N hits by each turn, going first or second, with or without a mulligan. |
| `export_deck` | Deck list text for OPTCGSim or Limitless. |

The server's instructions tell Claude to take card facts and numbers from these tools and to treat matchup opinions as its own judgement.

## Add it to Claude

1. Deploy the `optcg-analyst` service from `render.yaml` (Blueprint sync).
2. In the Render dashboard, copy the generated `ANALYST_CONNECTOR_KEY`.
3. In Claude, open Settings, then Connectors, and add a custom connector with the URL `https://<service>.onrender.com/mcp/<ANALYST_CONNECTOR_KEY>`.
4. In a chat, turn the connector on and paste a deck or a share link: "Review this deck: …".

The key in the path is the only access control, so treat the URL like a password. Rotate it by changing the env var. The tools only read public card data and public share links.

## Run locally

```bash
npm ci                              # from the repo root
npm run start -w @optcg/analyst     # http://localhost:8787/mcp (no key when ANALYST_CONNECTOR_KEY is unset)
npm run test:analyst
node tools/mutation-check/run.cjs analyst
```

`PLANNER_API_URL` (default `https://optcg-deck-planner.app/api`) is where share links are read from.

Card data comes from `packages/rules/src/cards/cardData.json`, `packages/rules/src/cards/generated/abilities.json` and `packages/deck-analytics/deckStats.json`, so new cards arrive with the daily card import and a redeploy.
