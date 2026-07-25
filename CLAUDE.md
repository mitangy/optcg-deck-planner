# CLAUDE.md — OPTCG Deck Planner

Guidance for agents working in this repo.

## UI polish (required)

After any frontend change that affects layout, components, or interactive UI, **always touch up the UI** before considering the work done:

1. **No layout shift on expand/toggle** — Opening dropdowns, price panels, filters, or accordions must not move the trigger control or shove neighboring cells. Prefer `position: fixed` / absolute overlays (or portals) over in-flow expansion when the content can change width.
2. **Full-width chrome stays full-width** — The top banner/header must span the viewport. Constrain only the inner content (`topbar-inner`, `app-main`), not the bar itself.
3. **Alignment check** — Verify desktop table, mobile list, and grid layouts: columns stay aligned, sticky headers don’t jump, and toolbars wrap cleanly without overlapping controls.
4. **Responsive pass** — Spot-check ~375px and ~1200px widths. Toggle List/Grid, expand a market price, open filters, and confirm nothing clips or misaligns.
5. **Interactive affordances** — Clickable prices, checkboxes, and steppers should keep a stable hit target; loading/error states must not resize the trigger.

If a change introduces misalignment, fix it in the same PR — do not leave “follow-up polish” for later.

## Product context

- Vite/React SPA on Vercel + FastAPI on Render + Neon Postgres
- Shopping list, decks, owned counts, TCGPlayer market + recent sales
- Public share links at `/share/:token`
