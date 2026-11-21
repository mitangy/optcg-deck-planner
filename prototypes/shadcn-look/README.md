# shadcn look prototype (throwaway, do not merge)

The same five screens as `../tailwind-look`, built with shadcn/ui (radix-nova
style, Tailwind v4). Two skins from one codebase: the default remaps shadcn's
CSS variables to our planner/duel palettes (bottom of `src/index.css`);
`?skin=stock` shows shadcn's stock theme.

`npm install && npx vite`, then open `#/planner/deck`, `#/planner/collection`,
`#/duel/home`, `#/duel/decks` or `#/duel/board` (add `?skin=stock` before the
hash for the stock look). Comparison page: `../tailwind-look/compare/`.
