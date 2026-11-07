# @optcg/analyst-client

The Log Pose chat for the planner (`frontend/`) and duel-web: an SSE client for the `analyst/` service, the session and access checks, safe markdown with citations, and the compass launcher plus the panel. Apps list it as a dependency (npm workspace) and compile it from source.

`src/index.ts` is the whole app-facing API (about 15 lines of exports). Everything else in `src/` is internal and is imported by relative path from the package's own tests.

## What the apps import

- **Mount once:** `LogPoseProvider` around the app. It asks the API whether chat is on for this user and, if so, shows the compass and the panel (not while `hidden`, for example during a match).
- **Say what the page is about**, each registers while the calling component is mounted:
  - `useLogPosePage(page)`: the page's context and starter prompts. `pageScope`, `plannerDeckScope`, `duelDeckScope`, `matchScope` build the thread scope.
  - `useLogPoseDeckEditor(editor)`: the open deck and its save function, so a proposed edit can be applied from the chat.
  - `useLogPoseGame(game)`: the live game (snapshot, legal actions, how to play the plan) for the in-game copilot.
  - `useLogPoseLayer(el)`: render the panel inside a modal so its focus trap does not lock the panel out.
  - `useLogPoseDock()` and `useLogPoseDockHost(...)`: the docked-column board layout (the player's side choice, and the host elements the panel renders into).
- **Ask from the page:** `useLogPoseAsk()` is a function that opens the panel with a question, or `null` while Log Pose cannot answer. `hintAsk` and `messageContext` build the question; `useLogPose()` gives `available` and the session for review streams.
- **Components:** `DeckEditCard` (a proposed deck edit), `CitedAnswer` (a review with source chips), `Markdown`, `FeedbackBar`, `RequestAccessView`.
- **Streams:** `streamAnalyst` (POST to the analyst and stream the answer into handlers), `fetchSavedReview`, `errorText`, `AnalystError`.
- **Helpers:** `parseProposal`, `parseDraft`, `deckListText`, `parseSource`, `placeAt`, `fitDock`, and the types (`TurnPlan`, `ChoiceAnswer`, `GameSnapshot`, `LogPoseGame`, ...).

`@optcg/analyst-client/logPose.css` carries the panel's styles. It themes through `--lp-*` custom properties (`--lp-surface`, `--lp-ink`, `--lp-accent`, ...), which each app sets on `:root`; the `-d` variants in the file are the defaults.

## The stream

`streamAnalyst` and the chat hook read the server-sent events listed in `SSE_EVENTS` from `@optcg/analyst-contract`: `thread`, `status`, `text`, `cite`, `proposal`, `deck_draft`, `plan`, `choice`, `done`, `error`. `src/sse.ts` parses the wire format; `src/client.ts` turns events into callbacks; `src/useChat.ts` holds the panel's chat state.

## Tests

```
npm test -w @optcg/analyst-client
npm run typecheck -w @optcg/analyst-client
```

The SSE parser, client, session, markdown parser and storage helpers are React-free and run in node; the few component tests run in jsdom (`// @vitest-environment jsdom` at the top of the file). Mutation proofs are in `tools/mutation-check/suites/analyst-client.cjs`.
