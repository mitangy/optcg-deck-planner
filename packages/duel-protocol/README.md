# @optcg/duel-protocol

The duel wire protocol (protocolVersion 5) in one place, used by `game-server/` and `duel-web/`.

- `src/constants.ts`: `PROTOCOL_VERSION`, the close code, size caps, and the `CLIENT_MESSAGE` / `SERVER_MESSAGE` name tables.
- `src/errors.ts`: `ErrorCode`, `ProtocolError`, `errorCodeOf`, and the `expectBody` / `expectEnvelope` checks the server parsers start with.
- `src/types.ts`: payload types for every message. `PlayerView`, `Intent`, `GameEvent` and `Seat` come from `@optcg/rules`.
- `src/clientMessages.ts`: parsers the **server** runs on what a client sends (join options, skin, cosmetics, chat, hand order, rematch, dice, undo). They throw `ProtocolError`.
- `src/serverMessages.ts`: parsers the **client** runs on what the room sends (welcome, view, error, match over, timer, chat, undo, rematch, dice, presence, cosmetics, skin), including the privacy checks that refuse a view leaking a hidden hand.

## Rules for this package

- No runtime import of `@optcg/rules`. duel-web's main bundle must never load the rules engine, so this package reaches it with `import type` only (it is a dev dependency for the compiler). Anything that needs the engine at runtime stays in the game server: intent validation (`parseIntent`, wrapped by `parseIntentMessage`) and room creation options (`parseCreateOptions`) live in `game-server/src/protocol.ts`.
- No app config and no UI. duel-web resolves an uploaded skin's path against the API base (`parseSkin` in `duel-web/src/net/protocol.ts`) and words intent buttons (`duel-web/src/board/prompts/intentLabel.ts`).
- A wire change bumps `PROTOCOL_VERSION` here, regenerates `packages/rules/protocol-fixtures` (`npm run export-protocol-fixtures -w @optcg/rules`) and keeps both contract tests green (`game-server/test/protocolContract.test.ts`, `duel-web/src/net/protocolContract.test.tsx`). `mobile/` still has its own copy while it is paused.
