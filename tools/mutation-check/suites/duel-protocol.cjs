/** duel-protocol mutations (packages/duel-protocol/src, vitest): the error codes and envelope checks shared by the game server and duel-web. The parsers' own mutations live in the game-server and duel-web suites. */
const errors = "packages/duel-protocol/src/errors.ts";
module.exports = {
  cwd: "packages/duel-protocol",
  runner: "vitest",
  mutations: [
    { id: "error-code-unknown-passes", file: errors, from: "return ERROR_CODES.find((c) => c === code) ?? fallback;", to: "return (code as ErrorCode | undefined) ?? fallback;", kills: ["reports the code an error carries and falls back for anything the protocol does not define"] },
    { id: "error-code-always-fallback", file: errors, from: "return ERROR_CODES.find((c) => c === code) ?? fallback;", to: "return fallback;", kills: ["reports the code an error carries and falls back for anything the protocol does not define"] },
    { id: "envelope-any-version", file: errors, from: "  if (!isProtocolVersion(o.protocolVersion)) throw bad(\"Unsupported or missing protocolVersion\");\n", to: "", kills: ["refuses a message body that is not an object, or that speaks another protocol version"] },
    { id: "envelope-null-body", file: errors, from: "  if (!raw || typeof raw !== \"object\") throw bad(`${label} body required`);\n", to: "", kills: ["refuses a message body that is not an object, or that speaks another protocol version"] }
  ]
};
