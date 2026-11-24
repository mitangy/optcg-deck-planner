/** duel-protocol mutations (packages/duel-protocol/src, vitest): the error codes and envelope checks shared by the game server and duel-web. The parsers' own mutations live in the game-server and duel-web suites. */
const errors = "packages/duel-protocol/src/errors.ts";
const clientMsgs = "packages/duel-protocol/src/clientMessages.ts";
const serverMsgs = "packages/duel-protocol/src/serverMessages.ts";
module.exports = {
  cwd: "packages/duel-protocol",
  runner: "vitest",
  mutations: [
    { id: "art-prefs1345-key-uncapped", file: clientMsgs, from: "if (k.length > ART_PREF_KEY_MAX || v.length > ART_PREF_VALUE_MAX) continue;", to: "if (v.length > ART_PREF_VALUE_MAX) continue;", kills: ["skips an entry whose key or value is too long to be a card id or an art id (#1345)"] },
    { id: "art-prefs1345-value-uncapped", file: clientMsgs, from: "if (k.length > ART_PREF_KEY_MAX || v.length > ART_PREF_VALUE_MAX) continue;", to: "if (k.length > ART_PREF_KEY_MAX) continue;", kills: ["skips an entry whose key or value is too long to be a card id or an art id (#1345)"] },
    { id: "art-prefs1345-cap-off-by-one", file: clientMsgs, from: "k.length > ART_PREF_KEY_MAX || v.length > ART_PREF_VALUE_MAX", to: "k.length >= ART_PREF_KEY_MAX || v.length >= ART_PREF_VALUE_MAX", kills: ["skips an entry whose key or value is too long to be a card id or an art id (#1345)"] },
    { id: "error-code-unknown-passes", file: errors, from: "return ERROR_CODES.find((c) => c === code) ?? fallback;", to: "return (code as ErrorCode | undefined) ?? fallback;", kills: ["reports the code an error carries and falls back for anything the protocol does not define"] },
    { id: "error-code-always-fallback", file: errors, from: "return ERROR_CODES.find((c) => c === code) ?? fallback;", to: "return fallback;", kills: ["reports the code an error carries and falls back for anything the protocol does not define"] },
    { id: "envelope-any-version", file: errors, from: "  if (!isProtocolVersion(o.protocolVersion)) throw bad(\"Unsupported or missing protocolVersion\");\n", to: "", kills: ["refuses a message body that is not an object, or that speaks another protocol version"] },
    { id: "envelope-null-body", file: errors, from: "  if (!raw || typeof raw !== \"object\") throw bad(`${label} body required`);\n", to: "", kills: ["refuses a message body that is not an object, or that speaks another protocol version"] },
    // Opening dice roll (#1190)
    { id: "dice-call-any-value", args: "src/dice.test.ts", file: clientMsgs, from: "    if (o.call !== \"high\" && o.call !== \"low\") throw bad(\"dice call must be high|low\");\n", to: "", kills: ["accepts each action a client may send and refuses a call without High or Low"] },
    { id: "dice-action-any", args: "src/dice.test.ts", file: clientMsgs, from: "  if (o.action === \"roll\" || o.action === \"first\" || o.action === \"second\") return { action: o.action };\n  throw bad(\"dice action must be call|roll|first|second\");", to: "  return { action: o.action as \"roll\" };", kills: ["accepts each action a client may send and refuses a call without High or Low"] },
    { id: "dice-state-roll-unbounded", args: "src/dice.test.ts", file: serverMsgs, from: "o.roll >= 1 && o.roll <= 6 ? o.roll : null;", to: "o.roll >= 1 ? o.roll : null;", kills: ["reads a dice_state and keeps a roll only when it is a die face"] },
    { id: "dice-state-any-step", args: "src/dice.test.ts", file: serverMsgs, from: "  if (!steps.includes(o.step as DiceStep)) throw new Error(\"dice_state.step invalid\");\n", to: "", kills: ["refuses a dice_state with an unknown step or no seat"] },
    { id: "dice-state-seatless", args: "src/dice.test.ts", file: serverMsgs, from: "  if (roller === null || caller === null || seat === null) throw new Error(\"dice_state seats required\");\n", to: "", kills: ["refuses a dice_state with an unknown step or no seat"] },
    { id: "dice-result-roll-unbounded", args: "src/dice.test.ts", file: serverMsgs, from: "roll < 1 || roll > 6", to: "roll < 1", kills: ["shows a welcome's dice result only when every part is right"] },
    { id: "dice-result-any-call", args: "src/dice.test.ts", file: serverMsgs, from: "winner === null || call === null) return undefined;", to: "winner === null) return undefined;", kills: ["shows a welcome's dice result only when every part is right"] },
  ]
};
