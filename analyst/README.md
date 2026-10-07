# `@optcg/analyst`: Log Pose

Deck analyst tools for Claude, served over MCP. You add this server to the Claude app as a custom connector, and Claude (on your own Claude plan) uses the tools to look up cards and analyze decks. The same tools also power the Log Pose panel inside the duel app and the deck planner, which calls the Claude API from this server (see [In-app chat](#in-app-chat)).

Design doc: https://claude.ai/artifact/DHEmpEwqp9UD1btA2BN5Rv

## Tools

| Tool | What it does |
|------|--------------|
| `search_cards` | Filter every card by text, colors, type, cost, power, counter, traits, attributes, keywords, ability timing, effect kind (K.O., bounce, search, draw…), set, or what a given leader may include (`legalFor`). |
| `get_cards` | Full printed text, stats, timings, effect kinds and the parsed ability structure, by card number or exact name. |
| `analyze_deck` | Loads a pasted list (OPTCGSim `4xOP01-006`, Limitless `4 OP01-006`) or a deck planner share link and returns legality, build hints, curve, counters, roles, opening-hand expectations and searcher odds (from `@optcg/deck-analytics`). |
| `draw_odds` | Exact odds of seeing at least N hits by each turn, going first or second, with or without a mulligan. |
| `simulate` | Goldfish games in the duel engine against a dummy that never blocks, counters or attacks: win-by-turn with 95% intervals, DON!! curve, mulligan rate, card timing and an example line. A speed check, not a win rate. Up to about 20 s, one at a time. |
| `export_deck` | Deck list text for OPTCGSim or Limitless. |
| `rules_lookup` | Searches the official Comprehensive Rules by words, or reads a numbered section (`7-1`, `10-1-4`) with everything under it, plus matching official general rules Q&A. |
| `card_rulings` | Official FAQ answers for each card, rulings on other cards that mention it, errata (before and after), and ban status, including announced bans and their start date. |
| `ban_list` | Banned cards, restricted cards and banned pairs in force today, plus announced changes. `analyze_deck` also checks a deck against it. |
| `playbook` | Strategy notes from [`playbook/`](playbook/README.md): a leader's game plan, key cards, mulligan, lines and matchups, both sides of a matchup, or notes mentioning a card. |
| `matchup_stats` | Win rates from recorded duels: a leader's overall record, going first and second, each matchup (mirrors apart), and per-card rates with and without the card. Totals only, with a Wilson interval; buckets under 5 games are held back. Needs `ANALYST_SERVICE_SECRET`. |

| `search_matches` | Searches every recorded duel from players who share their games (not just yours): by leader, opponent, a card in the deck, result, who went first, turns. Games come back anonymized: an opaque game id, sides A and B, rating bands, never names or match ids. Needs `ANALYST_SERVICE_SECRET`. |
| `replay_match` | Re-runs one of those games with every card named (both hands, Life and deck), sides labeled Player A and Player B. |

A personal link (below) adds five more:

| Tool | What it does |
|------|--------------|
| `list_my_decks` | Your deck planner decks, ready to pass to `analyze_deck`. |
| `list_my_matches` | Your recent duels: both leaders, result, how it ended, turns, rating change, and whether a replay was kept. |
| `review_match` | Re-runs one of your games in the duel engine and returns a turn-by-turn log from your seat, your opening hand, the result and the final board. The opponent's face-down cards stay hidden. |
| `draft_lesson` | Saves a lesson Claude learned from your games (with the leader, opponent, cards and match ids it came from) as a draft for you to review. |
| `my_lessons` | Your approved lessons (or drafts), optionally for one leader, so Claude can apply them in later chats. |

### Learning loop

Every finished duel is stored per seat (leader, deck, result, who went first, turns), and `matchup_stats` aggregates those rows. Players can leave their games out of everyone's stats with **Use my games in Log Pose stats and game reviews** in duel-web Settings; it is on by default. `matchup_stats` returns only totals; `search_matches` and `replay_match` return single games, anonymized, and drop a player's games (even ids found earlier) as soon as they turn sharing off.

After reviewing your games, Claude can call `draft_lesson`. Drafts appear under **Lessons from your games** in duel-web Settings, where you approve, reject or delete them. Only approved lessons come back from `my_lessons`, and only to you. The shared `playbook/` stays in the repo and changes by pull request.

The server's instructions tell Claude to take card facts and numbers from these tools, cite rules by section number, prefer official rulings over its own reading of card text, and treat matchup opinions (and draft playbook notes) as judgement.

### Official rules material

The comprehensive rules, FAQ PDFs, errata page and ban list are read live from the official site (`OFFICIAL_SITE_URL`, default `https://en.onepiece-cardgame.com`) when the server starts, kept in memory, and refreshed every 12 hours. None of that text is stored in this repo. If the site can't be reached, the last good copy is used; with no copy at all, the tools say so and Claude answers from card text with that caveat.

`npm run check-official -w @optcg/analyst` reads everything live and prints what parsed (rules version and section count, FAQ files and rulings, ban list, errata count). It exits non-zero if anything failed, which is the first thing to run if Bandai changes a PDF layout.

## In-app chat

The duel app and the deck planner show a Log Pose compass in the corner for players on `ANALYST_CHAT_EMAILS` (on `optcg-api`). It opens a chat panel, and opening a game in duel-web match history writes a post-game analysis once and keeps it.

1. The app asks `POST /analyst/chat/session` (signed-in cookie) for a 30-minute chat token, signed with `ANALYST_SERVICE_SECRET`.
2. It streams `POST /chat` or `POST /review-match` on this server with `Authorization: Bearer <token>`. Answers come back as server-sent events: `thread`, `status`, `text`, `cite`, `done`, `error`.
3. This server checks the token and the spend caps with the API, runs the Claude API (`ANALYST_CHAT_MODEL`, default `claude-opus-5-5`) with the same tools as a personal link, and saves the thread, the cost and any review through the API.

Sources: fact-bearing tool results (cards, rules and rulings, win rates, playbook, your lessons and games, deck checks, draw odds) go to the model as Claude API `search_result` blocks (`src/sources.ts`), so its sentences carry citations. A `cite` event carries the citations (`source`, `title`, `cited_text`) of the text streamed so far; the panel puts a numbered marker after that text. Source ids: `card:<id>`, `rule:<section>`, `ruling:<card>#<n>`, `stats:<leader>[~<opponent>|#<card>]`, `playbook:<leader>[~<opponent>]`, `lesson:<id>`, `match:<match_id>[#t<turn>]`, `game:<game_id>[#t<turn>]`, `deck:<hash>`, `odds:<shape>`. The stored thread keeps the model's content, citations included; reviews store their citations with their text.

Spend is capped per player per day (`ANALYST_CHAT_DAILY_USD`, default 3) and for everyone per month (`ANALYST_CHAT_MONTHLY_USD`, default 50); past a cap, `/chat` answers 429. Browsers may call it from `ANALYST_CHAT_ORIGINS` (default the two production sites), `*.vercel.app` previews and localhost.

Needs `ANTHROPIC_API_KEY` here, plus `ANALYST_PUBLIC_URL`, `ANALYST_CHAT_EMAILS` and the shared `ANALYST_SERVICE_SECRET` on `optcg-api`. Without the key, `/chat` answers 503 and the connector works as before.

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
