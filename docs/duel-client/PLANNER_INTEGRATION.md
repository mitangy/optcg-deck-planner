# Deck planner ↔ duel-web integration

Both apps share one FastAPI backend and one `users` table. A Google login on
either site is the same account, but each site keeps its own first-party
session cookie (see ADR-016 in `DECISIONS.md`).

## Shipped (PRs #202, #203)

- **Planner decks in duel-web.** Signed-in users see "From your planner" on
  `/decks`. Tapping a deck calls `GET /decks/{id}`, converts it to decklist text
  (leader once, DON!! dropped) and runs it through `validateImportedList`. It is
  stored as a linked local copy `planner-<id>` (`SavedDeck.plannerDeckId`), so
  lobby and gameplay code are unchanged. Code: `duel-web/src/decks/planner.ts`.
- **Save to planner.** Unlinked local decks can be pushed with `POST /decks`;
  linked decks show a "From planner" badge and "Refresh from planner".
- **Pre-match refresh.** Online matches re-pull a linked deck (4s timeout). On
  any failure the local copy plays.
- **Deep link.** `/decks?planner=<id>#list=<decklist>&name=<name>`: signed-in
  users load the planner deck; guests (or a failed fetch) get a copy from the
  `#list` hash.
- **Play in Duel.** Planner deck page button builds that link
  (`frontend/src/duelLink.ts`, `VITE_DUEL_URL`, default `https://optcgduel.app`).
- **Cross-app nav.** Planner top bar "Play Duel" pill; duel lobby header
  "Deck planner" icon (`VITE_PLANNER_URL`, default
  `https://optcg-deck-planner.app`).

## Decks page: pick several, drag between lists

- "From your planner" lists only planner decks with no local copy yet
  (`plannerDecksNotLocal`). Tick decks and press "Add selected", or drag a row
  by its grip up to "Your decks". Dragging a ticked row carries every ticked
  deck. Decks load with `importPlannerDecks`: one failure never stops the rest.
- A linked copy (`planner-<id>`) under "Your decks" has a grip too; dragging it
  back down to "From your planner" deletes the local copy (the planner deck is
  untouched). Unlinked local decks cannot be dragged.
- Drag is pointer based (`duel-web/src/decks/useDeckDrag.ts`) so it works with
  touch; the page scrolls near the top and bottom edges while dragging and Esc
  cancels.
- The deck editor's "Import deck list" and "Add cards" sections start collapsed.

## Not done yet (ideas, best first)

1. **Win rates per planner deck.** Record which planner deck was played with
   each match (match ingest already exists in `backend/app/routers/duel.py`)
   and show wins/losses on the planner deck page.
2. **Owned cards in the duel deck editor.** Mark owned vs. missing cards using
   the planner's owned counts, with "Add missing to shopping list".
3. **Single sign-on.** Sign in once for both sites: a shared parent domain with
   a `Domain=` cookie, or a cross-site hand-off reusing the one-time login
   ticket (`create_login_ticket` / `POST /auth/claim`). Touches auth and DNS.
4. **Card art carries over.** Map planner printings
   (`deck_card_printings.product_id`) to duel art prefs (`p1`/`p2` via
   `productId` in `cardCatalog.json`).
5. **Shared deck links.** Planner `/share/:token` pages get a "Play this deck"
   button using the `#list` hand-off.
6. **Lean deck endpoint.** `GET /decks/{id}` computes prices and owned counts;
   a `GET /decks/{id}/list` (ids, counts, printings) would be cheaper for the
   duel app on Render cold starts.
7. **Play links on the planner Decks list.** Needs card data in the list
   response (`DeckSummary` has none today).

Known edge: pasting an import into a linked duel deck keeps the link, so the
next refresh from the planner overwrites that local edit.

Rejected: merging both apps into one SPA (see the duel-web ADR in
`DECISIONS.md`).
