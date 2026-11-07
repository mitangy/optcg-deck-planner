# Deck planner ↔ duel-web integration

Both apps share one FastAPI backend and one `users` table. A Google login on
either site is the same account, but each site keeps its own first-party
session cookie (see ADR-016 in `DECISIONS.md`).

## Always-on sync (#1017)

Signed-in players have one set of decks: a duel saved deck (`duel_saved_decks`)
and a planner deck (`decks`) are linked by `duel_saved_decks.planner_deck_id`
(mirrored in the row's `data.plannerDeckId`) and each side writes the other.
Code: `backend/app/planner/deck_link.py`.

- **Duel -> planner.** An accepted duel deck write (`PUT /duel/decks`, single or
  bulk) creates the planner deck, or replaces the linked one's name, leader and
  non-DON!! rows (DON!! rows are kept; alt-art wants of removed cards are
  dropped and the rest clamped). When the server changes the stored copy (adds
  the link, clears `editedLocally`) it answers with `updatedAt + 1`, so the
  client adopts it.
- **Planner -> duel.** Every planner deck mutation (create, clone, copy shared,
  rename, card add/edit/remove) rewrites the linked duel row (name, leader, main
  deck without the leader and DON!!; art maps are kept), or creates it as
  `planner-<id>`. A planner deck that is not linked yet gets its duel copy only
  once its main deck (no leader, no DON!!) has exactly 50 cards
  (`deck_link.COMPLETE_MAIN`); partial decks stay planner-only, in both
  `mirror_planner_deck` and the merge. Once linked, a deck keeps syncing even if
  edits take it below 50, so the duel copy never vanishes mid-edit. Duel ->
  planner is unchanged (incomplete duel decks still reach the planner).
- **Guest duplicates.** A brand-new duel deck (no row, or a tombstone) with no
  `plannerDeckId` that has the same leader and main-deck multiset as a live,
  linked duel row is not created again: the server stores it as a tombstone
  (`updatedAt + 1`), merges its `artPrefs` into the survivor for cards the
  survivor has no pick for, and answers `mergedInto: <survivor id>`. The client
  (`adoptIfNewer`) removes the local copy and moves the selected deck to the
  survivor. Edits to an existing deck id are never merged.
- **Deletes** go both ways (`deck_link.DELETE_PROPAGATES`).
- **One-time merge.** `reconcile_user` runs when `GET /duel/decks` or
  `GET /decks` is read and links everything not linked yet: a duel deck and a
  planner deck with the same leader and main deck are linked, otherwise the
  missing copy is created. A `plannerDeckId` whose planner deck is gone is
  re-created, not dropped. `test-` seeds are never linked.
- Limits: a side that is full (300 planner decks, 200 duel decks, 60 main
  cards) leaves the deck unlinked; the next read retries.
- **Client.** The account sync re-runs when the tab regains focus (at most once
  a minute). Alt arts picked in a linked duel deck are sent to the planner
  (`pushDeckArtToPlanner`, `PUT /owned/{id}/display`) after a sync and after an
  art pick in the editor; the pre-match refresh (`refreshLinkedDeck`, 4s
  timeout) takes the planner's shown art the other way. The Decks page has no
  planner column any more; it only says decks stay in sync.
- **Deep link.** `/decks?planner=<id>#list=<decklist>&name=<name>`: signed-in
  users load the planner deck; guests (or a failed fetch) get a copy from the
  `#list` hash.
- **Play in Duel.** Planner deck page button builds that link
  (`frontend/src/duelLink.ts`, `VITE_DUEL_URL`, default `https://optcgduel.app`).
- **Cross-app nav.** Planner top bar "Play Duel" pill; duel lobby header
  "Deck planner" icon (`VITE_PLANNER_URL`, default
  `https://optcg-deck-planner.app`).

- The deck editor's "Replace with deck list" and "Add cards" sections start collapsed.

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

Rejected: merging both apps into one SPA (see the duel-web ADR in
`DECISIONS.md`).
