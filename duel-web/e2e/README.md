# duel-web click-through tests

Playwright drives the real duel-web UI in Chromium against a real local game
server (Colyseus + `@optcg/rules`). Only the FastAPI backend is faked, in the
browser (`page.route`), because a practice match needs nothing from it but
`/health` and a signed guest token. No Python, Postgres or network needed.

```bash
cd duel-web
npm run e2e                              # starts game server + Vite, runs everything
npm run e2e -- rules-attack              # one spec
npm run e2e -- --project=phone-375       # one screen size
SEEDS=1,2,3 npm run e2e -- playthrough   # more random games
npx playwright show-report               # traces and screenshots of failures
```

## What runs

| Spec | What it proves | Time |
|---|---|---|
| `rules-attack.spec.ts` | A scripted rule, clicked through: no attack on either player's first turn; a Leader hit moves one Life card to hand. Reads the numbers the player sees. | ~10s |
| `playthrough.spec.ts` | A seeded practice match played to a winner by clicking only what the UI offers. Fails on a page error, a server rejection of an offered action, a turn with no way forward, or a new UI audit issue on any turn. | ~1 min per seed per size |
| `spectate.spec.ts` | A second browser spectates a practice room (unranked) by room id and sees both opening hands face up. | ~10s |
| `spectate-link.spec.ts` | `/watch/<room id>` opens straight into spectating (history replaced, `?seat=2` camera), a bad room says so in the lobby, a pre-start spectator sees waiting not an error, and the HUD / menu copy the link. | ~15s |
| `demo-audit.spec.ts` | The UI audit on every `/demo` fixture screen (prompts, full board, statuses, match over) at each size. | ~1 min |

Each runs at `desktop-1280` and `phone-375` (the rules scenario on desktop only).

## Pieces

- `fixtures.ts`: fake API, token minting, decks seeded into localStorage, and
  `startPractice({ seed })`, which clicks Lobby → Practice → Start practice and
  adds a fixed shuffle `seed` to the room-create request so a game replays.
- `audit.ts`: the UI audit, run in the page. Reports sideways scroll; text
  clipped by its box without an ellipsis; text drawn past its box or cut by a
  clipping parent; controls and text hidden under another element (checked
  by what actually paints at sample points, not by hit-testing); and controls
  cut off by the viewport. Overlap that is on purpose is exempt: cards in the
  same pile, anything under an open dialog, the attack arrow, text inside a
  scrolling list, and card-id placeholders shown when art fails to load.
- `known-issues.ts`: audit findings already known, so CI fails only on new
  ones. Delete an entry when its fix lands.
- `.board-root` carries `data-phase`, `data-turn` and `data-seat` so specs can
  wait on the game instead of on timers.

Mutation proofs live in `tools/mutation-check/suites/duel-e2e.cjs`
(`node tools/mutation-check/run.cjs duel-e2e --only <id>`).

## Adding a rules scenario

Pick decks that make the rule happen, fix the seed, click the way a player
would, and assert on what the player reads (counters, log, buttons offered).
A scenario earns its place only with a mutation in the engine that makes it
fail (see `CLAUDE.md`).
