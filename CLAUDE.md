# CLAUDE.md — OPTCG Deck Planner

Guidance for agents working in this repo.

## UI polish (required)

After any frontend change that affects layout, components, or interactive UI, **always touch up the UI** before considering the work done:

1. **No layout shift on expand/toggle** — Opening dropdowns, price panels, filters, or accordions must not move the trigger control or shove neighboring cells. Prefer `position: fixed` / absolute overlays (or portals) over in-flow expansion when the content can change width.
2. **Full-width chrome stays full-width** — The top banner/header must span the viewport edge-to-edge (including when zoomed). Constrain only the inner content (`topbar-inner`, `app-main`), not the bar itself. Use `overflow-x: clip` on `html`/`body`/`#root` so nothing creates sideways scroll that clips content.
3. **No phantom mobile scroll** — Prefer `100dvh` over `100vh`. Do not leave large bottom padding that creates empty white scroll below the last card. Overscroll background should match the page (set background on `html` and `body`).
4. **Alignment check** — Verify desktop table, mobile list, and grid layouts: columns stay aligned, prices/controls are not cut off, sticky headers don’t jump, and toolbars wrap cleanly without overflowing the viewport (`min-width: 0` on flex children).
5. **Responsive pass** — Spot-check ~375px and ~1200px widths. Toggle List/Grid, expand a market price, open filters, and confirm nothing clips, misaligns, or scrolls into empty space.
6. **Interactive affordances** — Clickable prices, checkboxes, and steppers should keep a stable hit target; loading/error states must not resize the trigger.

If a change introduces misalignment, fix it in the same PR — do not leave “follow-up polish” for later.

## Product context

- Vite/React SPA on Vercel + FastAPI on Render + Neon Postgres
- Shopping list, decks, owned counts, TCGPlayer market + recent sales
- Public share links at `/share/:token`
