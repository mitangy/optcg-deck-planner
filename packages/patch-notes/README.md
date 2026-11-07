# @optcg/patch-notes

The "What's new" notes shared by the planner (`frontend/`) and duel-web: the
`/whats-new` page, the link in the footer and Settings, and the once-per-update
card. Both apps list it as a dependency (npm workspace) and compile it from
source through its `exports` map, like `@optcg/site-legal`.

## Adding an entry

Put a new line at the **top** of `PATCH_NOTES` in `src/notes.ts`, in the same PR
as the change:

```ts
{ date: "2026-10-09", app: "duel", pr: 450, title: "Short name", text: "One or two plain sentences about what players can do now." },
```

- `date`: today, UTC, `YYYY-MM-DD`. Newest first; a test fails if the order or a date is wrong.
- `app`: `"duel"`, `"planner"`, or `"both"` (shown in both apps).
- `title`/`text`: written for players. Say what they can do, not how the code changed. Skip refactors, tests, CI and fixes nobody noticed.
- `pr`: optional, for maintainers (never shown).

## How the card works

Each app remembers the newest note date it has shown in `localStorage`
(`optcg.patchNotes.lastSeen.<app>`). A visit with nothing stored records the
newest date and shows nothing, so a new visitor never gets the backlog. After
that the card appears when notes are newer than the stored date, and "Got it" or
"See all" records the newest date. Notes are compared by day, so several
entries on one day are announced together.

## Bundle size

`notes.ts` is large, so it is its own lazy chunk: `loadPatchNotes()` / `usePatchNotes()`
(`src/loadNotes.ts`) `import()` it on first use, and `WhatsNewCard` and `WhatsNewFeed` wait for
it. Never `import "./notes"` statically from anything else in the package (the pre-render
entry in duel-web and tests are the only exceptions), or the notes land in both apps' entry
bundles again. `helpers.ts` and `lastSeen.ts` take the notes as an argument for the same reason.
