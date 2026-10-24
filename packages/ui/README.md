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

`import { Dialog, Menu, MenuButton, MenuList, MenuItem, Popover, PopoverButton, PopoverPanel, PopoverGroup, Listbox, ListboxButton, ListboxList, ListboxOption } from "@optcg/ui/popups"`.

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

### Popover

```tsx
<Popover>
  <PopoverButton className="btn">Sort</PopoverButton>
  <PopoverPanel anchor="bottom start" role="dialog" aria-label="Sort order">
    <label><input type="checkbox" /> Price</label>
    <button type="button">Move up</button>
  </PopoverPanel>
</Popover>
```

A floating panel of anything: checkboxes, steppers, text, buttons. `PopoverPanel` is anchored and portalled like `MenuList` (opening it never moves the trigger or its neighbours; `anchor` takes a placement or `{ to, gap, padding }` and the panel flips and shifts to stay on screen). Unlike a `Menu` it stays open while you use what is inside it, and Tab walks through its controls. Escape (focus returns to the button), an outside click and tabbing out of the panel close it.

- Name the panel with `role="dialog"` (or `region`) and `aria-label`; the wrapper adds only the `ui-popover-panel` class (`ui.css`: z-index, `--ui-*` colours, `overflow: auto`, all at zero specificity). Headless UI sets `max-height` inline to the room left, so a class `max-height` does not apply; the panel just fits the screen.
- `Popover` and `PopoverButton` take a `className` function (`({ open }) => ...`) and `data-open` / `aria-expanded` on the button, so a trigger can show its open state with no extra React state. A child function gets `{ open, close }`: `<Popover>{({ close }) => ...}</Popover>`.
- Several popovers side by side (a row of chips) close each other: pressing another button is an outside click for the first. Wrap popovers in `PopoverGroup` only when they should stay open together and share Tab order.
- A panel is no longer a DOM child of its trigger's parent, so CSS selectors that reached it through an ancestor (`.toolbar .panel`, an inherited colour or font size) stop matching. Set what the panel needs on its own class.
- Headless UI focuses the button from script after a click, which Chrome counts as keyboard focus (`:focus-visible`). It sets its own `data-focus` for the keyboard only, so a host that wants no ring after a mouse click hides it with `button[data-headlessui-state]:focus-visible:not([data-focus])` (the planner, duel-web and Log Pose do).
- Not a fit: an action list (use `Menu`), a single choice (use `Listbox`), anything that must block the page behind it (use `Dialog`).

### Listbox

```tsx
<Listbox value={deckId} onChange={setDeckId}>
  <ListboxButton className="btn">{name}</ListboxButton>
  <ListboxList anchor="bottom start">
    {decks.map((d) => <ListboxOption key={d.id} value={d.id}>{d.name}</ListboxOption>)}
  </ListboxList>
</Listbox>
```

A single choice from a list. `ListboxList` is anchored and portalled like `MenuList` (it reuses the `ui-menu-items` class, `--button-width` is the trigger's width, so `width: var(--button-width)` lines the list up with it). Arrow keys, Home / End, type-ahead on each option's text, Enter / Space (pick and close), Escape (focus returns to the button) and outside click come from Headless UI. `ListboxButton` also opens on Enter (Headless UI leaves Enter to submit a form, like a native select); inside a `<form>` it keeps that. The active option shows `[data-focus]` (pointer and keys alike) and the chosen one `[data-selected]`; the list is `role="listbox"`, named by its button (Headless UI sets `aria-labelledby`, so an `aria-label` on it is ignored), and each row `role="option"`.

- Options are single-purpose: Headless UI keeps focus on the list, so a button inside an option is reached by pointer only and Tab closes the list. Put anything that must be keyboard-reachable in an option of its own (the lobby's "+ New deck" and "Manage decks" rows are options whose pick navigates), or use a `Popover` if it is a panel of controls.
