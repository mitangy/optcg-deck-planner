# @optcg/ui

Shared UI code for the planner (`frontend/`) and duel-web. Both apps compile it
from source through a Vite alias (and a `tsconfig` path), like
`@optcg/patch-notes`.

`@headlessui/react` is a dependency of each app (`frontend/` and `duel-web/`), not
of this package: Vercel installs only the app's own `node_modules`. Each app lists
it in `resolve.dedupe` (vite configs and `duel-web/vitest.config.ts`) and maps it in
`tsconfig` `paths`, so imports from `packages/ui/src` resolve to the app's copy,
the same way `react` does. Do the same for any new dependency this package gets.

## cardArt

`import { ... } from "@optcg/ui"` or `"@optcg/ui/cardArt"`.

- `cardImageUrl(src, size)`: rewrite a TCGplayer CDN url to `_400w` (thumb) or `_in_1000x1000` (large).
- `cardArtChain(src, cardId, size, origin?)`: the planner's ordered urls to try (resized, original, preview).
- `previewArtPath` / `altPreviewArtPath` / `isPreviewArtPath` / `previewArtUrl`: unofficial preview art for cards TCGplayer has no picture for. Every function that builds a url takes an `origin` (default `""`, a relative `/cards/preview/...` path). The planner passes the duel app's origin because the webp files are hosted by duel-web (`duel-web/public/cards/preview/`).
- `artAfterError`, `localCardArtPath`, `isLocalCardsUrl`, `isTcgplayerCdnUrl`, `isPlaceholderArt`: duel-web's art fallback chain.

`src/cardArt/previewArt.json` (card ids) and `previewArtAlts.json` (alt-printing
product ids) are the manifests of the preview files. They are maintained by
`python3 scripts/sync_preview_art.py`; do not edit them by hand.

## popups (Headless UI)

`import { Dialog, Menu, MenuButton, MenuList, MenuItem } from "@optcg/ui/popups"`.

Behaviour comes from [Headless UI](https://headlessui.com) (the project does not use
Radix, shadcn or Tailwind); the look stays with each app's own CSS.

### Dialog

```tsx
<Dialog open={open} onClose={() => setOpen(false)} className="my-backdrop" panelClassName="my-panel" label="Shortcuts">
  ...content...
</Dialog>
```

You get a focus trap (focus moves in on open, back to the trigger on close), Escape and
outside-click close, a portal to the end of `<body>`, `aria-modal`, an `inert` page behind it and a
page scroll lock that keeps the scrollbar's width, so nothing shifts. Dialogs rendered inside another
dialog's React tree nest: Escape closes only the top one and focus stays in it.

- `className` goes on the full-screen backdrop, which is also the `role="dialog"` element; `panelClassName` on the panel. A click outside the panel closes it, so put everything clickable (a Close button, the art) inside the panel. An absolutely positioned child still positions against the backdrop when the panel has no `position`.
- `label` names the dialog; use `DialogTitle` instead when it has a visible heading.
- `role="alertdialog"` marks a notice that needs an answer. `closeOnOutsideClick={false}` makes only Escape close it (an editor where a stray click must not throw work away); for a blocking notice pass a no-op `onClose`.
- `panelRef` / `panelProps` reach the panel element (CardInspect's swipe-to-dismiss).
- `ui.css` only places the backdrop (`position: fixed; inset: 0`, flex centred, `--ui-z`, `--ui-pad`, `--ui-backdrop`). Its selectors use `:where()`, so your class wins. `panelClassName="ui-surface"` opts a bare panel into `--ui-ink`, `--ui-panel-bg`, `--ui-border`, `--ui-radius`.
- Map the `--ui-*` variables to the app's theme tokens in its CSS (see `frontend/src/styles.css` and `duel-web/src/ui.css`), like `--fb-*` and `--wn-*`.
- Render it only while needed (`{open ? <Dialog open ...> : null}`) or pass `open`; it unmounts when closed.

### Menu

```tsx
<Menu>
  <MenuButton className="btn">Actions</MenuButton>
  <MenuList anchor="bottom end">
    <MenuItem><button onClick={rename}>Rename</button></MenuItem>
  </MenuList>
</Menu>
```

`MenuList` is anchored to the button and rendered in a portal with floating positioning, so opening it never moves the trigger or its neighbours. Arrow keys, Home / End, type-ahead, Escape (focus returns to the button) and outside click come from Headless UI. Items show `[data-focus]` while active (`ui.css` styles it from `--ui-hover`).

- `anchor` on `MenuList` is a placement (`"bottom end"`, default `"bottom start"`) or `{ to, gap, padding }`. The list flips and shifts to stay inside the window, so a menu never overflows a phone; `--anchor-max-height` is the room left, so cap `max-height` with it (`ui.css` also caps at 60dvh, with zero specificity, so your class wins).
- Headless UI leaves the focus on the list and marks the active row `[data-focus]` (and a disabled one `[data-disabled]`), so style those instead of `:focus-visible` / `:hover` / `:disabled`. A `MenuItem` that wraps your own element gives it `role="menuitem"`, replacing any role you set (no `menuitemcheckbox`: say the state in the label).
- `MenuItem` is Headless UI's, plus `keepOpen`: the item does not close the menu when picked, by click, Enter or Space (a two-step Concede, a "Copied" flash). Close the menu yourself when it is done, with `close` from the `Menu` render prop: `<Menu>{({ close }) => ...}</Menu>`. Plain Headless UI closes after Enter / Space whatever the item does; `MenuList` intercepts those keys for `keepOpen` items.
- Not a fit: a panel of mixed controls (checkboxes, steppers, text) that must stay open and reachable by Tab, like the planner's Sort panel. Tab closes a Menu and its rows are single actions. That wants a Popover.
