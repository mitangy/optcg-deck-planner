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

On Cursor Cloud, follow **UI review / walkthrough artifacts** in `AGENTS.md` (Puppeteer + headed Chrome for recordings). Do not rely on the computer-use agent alone for lightbox/card-art demos.

## Tests (required)

Only write a test for behavior you can actually break. A test earns its place by failing when the behavior it names is broken; one that still passes under the opposite condition proves nothing and gets deleted.

1. **Prove it can fail.** For every behavior a test claims, make the smallest realistic edit to production code (or data) that does the opposite, e.g. drop a permission check, flip `>=` to `>`, sum instead of max, skip a filter. Run the suite and confirm the test fails on its own assertion, not on an unrelated crash.
2. **Record the proof.** Add that edit as a mutation in `tools/mutation-check/suites/<suite>.cjs` (see `tools/mutation-check/README.md`), in the same PR as the test. `node tools/mutation-check/run.cjs <suite> --only <id>` must report it `killed`.
3. **If nothing realistic breaks it, don't write it.** That means no tests of constants, string literals, fixtures, stylesheet text, or values true by construction (`[].reverse()` is `[]`; slicing a 7-char SHA to 7). Don't write tests whose data can't tell the right answer from the wrong one either: a leader that already sorts first, a default leader equal to the one under test, a loose regex that also matches the wrong value.
4. **Layered guards need one mutation that removes every layer.** If two checks enforce one rule (a salt and a purpose check, say), a mutation that removes only one survives. List each layer in the mutation's `edits`.
5. **Every bug fix ships a failing-first regression test** at the lowest layer that can show the bug: engine scenario (`packages/rules`) before duel-web unit before Playwright. Write the test first and watch it fail, then fix. Its mutation is the fix reverted.
6. **Name tests after the behavior and the PR number**, e.g. `Marco On K.O. fires once when he K.O.s himself (#225)`.
7. **Before a mutation run, make sure no other run is in progress.** Suites share one restore journal, so `run.cjs` refuses to start while another run is active.

## Product context

- Vite/React SPA on Vercel + FastAPI on Render + Neon Postgres
- Shopping list, decks, owned counts, TCGPlayer market + recent sales
- Public share links at `/share/:token`
