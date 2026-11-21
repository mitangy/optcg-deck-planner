# Tailwind look prototype (throwaway, do not merge)

A visual prototype of how the planner and duel-web would look restyled with
Tailwind CSS v4, keeping Headless UI for behaviour and the apps' own One Piece
palette and fonts (no shadcn/Radix look). Static mock data only; nothing here
is used by the real apps.

- `npm install && npx vite`, then open `#/planner/deck`, `#/planner/collection`,
  `#/duel/home`, `#/duel/decks` or `#/duel/board`.
- `src/index.css` maps both apps' colour tokens into Tailwind's `@theme`.
- `src/shared/data.json` is built from `duel-web/src/assets/cardCatalog.json`,
  `cardAtlas.json` (counters) and `duel-web/src/decks/metaDecks.fixture.json`.
- `compare/` is the side-by-side page (current app vs prototype) with
  screenshots at 1440x900, 390x844 and 844x390.
