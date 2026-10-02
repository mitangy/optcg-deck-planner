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
| `rules_lookup` | Searches the official Comprehensive Rules by words, or reads a numbered section (`7-1`, `10-1-4`) with everything under it, plus matching official general rules Q&A. |
| `card_rulings` | Official FAQ answers for each card, rulings on other cards that mention it, errata (before and after), and ban status, including announced bans and their start date. |
| `ban_list` | Banned cards, restricted cards and banned pairs in force today, plus announced changes. `analyze_deck` also checks a deck against it. |
| `playbook` | Strategy notes from [`playbook/`](playbook/README.md): a leader's game plan, key cards, mulligan, lines and matchups, both sides of a matchup, or notes mentioning a card. |

A personal link (below) adds three more:

| Tool | What it does |
|------|--------------|
| `list_my_decks` | Your deck planner decks, ready to pass to `analyze_deck`. |
| `list_my_matches` | Your recent duels: both leaders, result, how it ended, turns, rating change, and whether a replay was kept. |
| `review_match` | Re-runs one of your games in the duel engine and returns a turn-by-turn log from your seat, your opening hand, the result and the final board. The opponent's face-down cards stay hidden. |

The server's instructions tell Claude to take card facts and numbers from these tools, cite rules by section number, prefer official rulings over its own reading of card text, and treat matchup opinions (and draft playbook notes) as judgement.

### Official rules material

The comprehensive rules, FAQ PDFs, errata page and ban list are read live from the official site (`OFFICIAL_SITE_URL`, default `https://en.onepiece-cardgame.com`) when the server starts, kept in memory, and refreshed every 12 hours. None of that text is stored in this repo. If the site can't be reached, the last good copy is used; with no copy at all, the tools say so and Claude answers from card text with that caveat.

`npm run check-official -w @optcg/analyst` reads everything live and prints what parsed (rules version and section count, FAQ files and rulings, ban list, errata count). It exits non-zero if anything failed, which is the first thing to run if Bandai changes a PDF layout.

## Add it to Claude

1. Deploy the `optcg-analyst` service from `render.yaml` (Blueprint sync).
2. In the Render dashboard, copy the generated `ANALYST_CONNECTOR_KEY`.
3. In Claude, open Settings, then Connectors, and add a custom connector with the URL `https://<service>.onrender.com/mcp/<ANALYST_CONNECTOR_KEY>`. Choose **No sign-in**: the key in the URL is the access control. Use only letters and digits in the key (for example `openssl rand -hex 32`), since `%` and similar characters change meaning in a URL.
4. In a chat, turn the connector on and paste a deck or a share link: "Review this deck: …".

### Personal link (your games and decks)

In the duel app, open Settings and make a Log Pose link. It looks like `https://<service>.onrender.com/mcp/u/<token>`; add it as a custom connector instead of the keyed URL. Making a new link stops the old one, and you can revoke it there too. The API keeps only a hash of the token.

This needs `ANALYST_PUBLIC_URL` on `optcg-api` and the same `ANALYST_SERVICE_SECRET` on both services (env group `optcg-analyst-shared`). Full replays are only served to a request carrying both the player's token and that secret.

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
