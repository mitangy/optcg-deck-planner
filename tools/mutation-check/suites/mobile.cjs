/** mobile mutations: the atlas assertions check exported card data, so the opposite conditions are data edits. */
const atlas = "mobile/assets/cardAtlas.json";
const fo = "mobile/src/board/floatOrder.ts";
module.exports = {
  cwd: "mobile",
  runner: "vitest",
  mutations: [
    { id: "atlas-missing-official-card", json: atlas, patch: (a) => { delete a["OP01-013"]; }, kills: ["card atlas"] },
    { id: "atlas-conditional-rush-static", json: atlas, patch: (a) => { a["ST01-004"].rush = true; }, kills: ["card atlas"] },
    { id: "atlas-printed-rush-missing", json: atlas, patch: (a) => { delete a["OP09-118"].rush; }, kills: ["card atlas"] },
    { id: "atlas-traits-missing", json: atlas, patch: (a) => { a["OP12-002"].traits = []; }, kills: ["card atlas"] },
    { id: "atlas-trigger-flag-missing", json: atlas, patch: (a) => { delete a["ST01-014"].hasTrigger; }, kills: ["card atlas"] },
    { id: "opponent-hand-allowed", file: "mobile/src/net/protocol.ts", from: "    throw new Error(\"privacy leak: opponent.hand present in view\");", to: "", kills: ["parses welcome and rejects opponent hand leaks"] },
    { id: "welcome-drops-role", file: "mobile/src/net/protocol.ts", from: "    o.role === \"spectator\" || o.role === \"player\" ? o.role : undefined;", to: "    undefined;", kills: ["parses spectator welcome with empty hands"] },
    { id: "spectator-empty-hand-rejected", file: "mobile/src/net/protocol.ts", from: "  if (view.you.hand.length > 0) {", to: "  if (view.you.hand.length >= 0) {", kills: ["parses spectator welcome with empty hands"] },
    { id: "error-code-dropped", file: "mobile/src/net/protocol.ts", from: "    code: typeof o.code === \"string\" ? o.code : \"unknown\",", to: "    code: \"unknown\",", kills: ["parses view, error, and match_over"] },
    { id: "match-over-winner-lost", file: "mobile/src/net/protocol.ts", from: "      winner: result.winner,", to: "      winner: 0,", kills: ["parses view, error, and match_over"] },
    { id: "hand-label-uses-id", file: "mobile/src/net/protocol.ts", from: "  return n && n !== defId ? n : defId;", to: "  return defId;", kills: ["labels intents with atlas names"] },
    { id: "board-name-unresolved", file: "mobile/src/net/protocol.ts", from: "  if (!view || instanceId == null) return shortId(instanceId);", to: "  return shortId(instanceId);", kills: ["labels intents with atlas names"] },
    { id: "keep-labelled-mulligan", file: "mobile/src/net/protocol.ts", from: "      return intent.doMulligan ? \"Mulligan (shuffle & redraw 5)\" : \"Keep opening hand\";", to: "      return \"Mulligan (shuffle & redraw 5)\";", kills: ["labels intents with atlas names"] },
    { id: "replace-play-unlabelled", file: "mobile/src/net/protocol.ts", from: "      return intent.trashCharacterId != null\n", to: "      return false\n", kills: ["names the Character a full-board play replaces"] },
    { id: "replace-play-names-first", file: "mobile/src/net/protocol.ts", from: "replacing ${findBoardName(view, intent.trashCharacterId)}", to: "replacing ${findBoardName(view, view?.you.characters[0]?.id)}", kills: ["names the Character a full-board play replaces"] },
    // floating-card prompts (FloatingPrompt.tsx helpers)
    { id: "float-look-ignores-row-order", file: fo, from: "  const remaining = row.filter((id) => !picked.includes(id));", to: "  const remaining = request.options.map((o) => o.id).filter((id) => !picked.includes(id));", kills: ["puts the cards back in the dragged row order, without the taken card"] },
    { id: "float-look-puts-back-taken", file: fo, from: "  const remaining = row.filter((id) => !picked.includes(id));", to: "  const remaining = [...row];", kills: ["puts the cards back in the dragged row order, without the taken card"] },
    { id: "float-look-ignores-side", file: fo, from: "topOptionIds: side === \"top\" ? [...remaining] : []", to: "topOptionIds: [...remaining]", kills: ["top-or-bottom sends every remaining card to the chosen side together"] },
    { id: "float-move-off-by-one", file: fo, from: "  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id);", to: "  rest.splice(Math.max(0, Math.min(index, rest.length)) + 1, 0, id);", kills: ["moves a card to a new slot"] },
    { id: "float-tap-no-slide", file: fo, from: "  return { order: moveId(order, id, nextTapped.length - 1), tapped: nextTapped };", to: "  return { order: [...order], tapped: nextTapped };", kills: ["tapping a card gives it the next number and slides it into that slot"] },
    { id: "float-tap-cannot-clear", file: fo, from: "  if (tapped.includes(id)) return { order: [...order], tapped: tapped.filter((x) => x !== id) };\n", to: "", kills: ["tapping a numbered card again clears its number and leaves the row"] },
    { id: "float-slot-ignores-rows", file: fo, from: "    const d = (c.x - x) ** 2 + (c.y - y) ** 2;", to: "    const d = (c.x - x) ** 2;", kills: ["drops on the nearest slot, including the next row on phones"] },
    { id: "float-slot-farthest", file: fo, from: "    if (d < bestD) {", to: "    if (d > bestD || bestD === Infinity) {", kills: ["drops on the nearest slot, including the next row on phones"] },
    { id: "float-size-no-phone-wrap", file: fo, from: "  const perRow = portrait && count > 3 ? 3 : Math.max(1, count);", to: "  const perRow = Math.max(1, count);", kills: ["wraps more than three cards into rows of three on a portrait phone"] },
    { id: "float-size-wraps-landscape", file: fo, from: "  const perRow = portrait && count > 3 ? 3 : Math.max(1, count);", to: "  const perRow = count > 3 ? 3 : Math.max(1, count);", kills: ["wraps more than three cards into rows of three on a portrait phone"] },
    { id: "float-size-ignores-height", file: fo, from: "Math.min(fitW, fitH, 170)", to: "Math.min(fitW, 170)", kills: ["shrinks cards to fit a short landscape screen"] },
    { id: "float-size-portrait-chrome-landscape", file: fo, from: "  const chrome = portrait ? 300 : 150;", to: "  const chrome = 300;", kills: ["shrinks cards to fit a short landscape screen"] },
  ],
};
