/**
 * duel-web click-through mutations (duel-web/e2e, Playwright against a real
 * game server). Each run restarts both servers, so rules edits are live.
 * `args` narrows a mutation to the spec (and screen size) that claims it.
 */
const intents = "packages/rules/src/engine/intents.ts";
const procedure = "packages/rules/src/engine/procedure.ts";
const rules = "rules-attack.spec.ts > an unblocked Leader attack moves one Life card to the defender's hand [desktop-1280]";

module.exports = {
  cwd: "duel-web",
  runner: "playwright",
  mutations: [
    // rules, clicked through the UI
    { id: "e2e-first-turn-attack-allowed", args: "rules-attack --project=desktop-1280", edits: [
      { file: intents, from: "      if (p.turnsStarted < 2) return err(\"FIRST_TURN\", \"You cannot attack on your first turn\");", to: "" },
      { file: intents, from: "  if (p.turnsStarted >= 2) {\n    const opp = state.players[otherSeat(seat)];", to: "  if (p.turnsStarted >= 1) {\n    const opp = state.players[otherSeat(seat)];" },
    ], kills: [rules] },
    { id: "e2e-leader-damage-keeps-life", args: "rules-attack --project=desktop-1280", file: procedure, from: "      takeLifeToHand(sim, defSeat, false, true);\n", to: "", kills: [rules] },
    { id: "e2e-leader-damage-life-not-to-hand", args: "rules-attack --project=desktop-1280", file: procedure, from: "      takeLifeToHand(sim, defSeat, false, true);\n", to: "      { const d = state.players[defSeat]; d.life.shift(); d.zoneInstanceIds.life.shift(); d.faceUpLife.shift(); }\n", kills: [rules] },

    // random playthrough: the device must reach whoever has to answer
    { id: "e2e-hotseat-keeps-device-on-attacker", args: "playthrough --project=desktop-1280", file: "duel-web/src/board/hotseatControlSeat.ts", from: "      if (seatHasBlockOrCounterIntents(defenderView)) {\n        return defender;\n      }\n", to: "", kills: ["playthrough.spec.ts > practice match plays to the end by clicking (seed 7) [desktop-1280]"] },

    // UI audit
    // #190's deck-order fix has three layers (shrinkable column, wrapping row, clamped name); undo all of them.
    { id: "e2e-deck-order-prompt-widens", args: "demo-audit --project=phone-375", edits: [
      { file: "duel-web/src/styles.css", from: "     the list past the prompt and push the row buttons off-screen. */\n  grid-template-columns: minmax(0, 1fr);", to: "     the list past the prompt and push the row buttons off-screen. */\n  grid-template-columns: 1fr;" },
      { file: "duel-web/src/styles.css", from: ".order-list .order-row {\n  flex-wrap: wrap;\n}\n", to: "" },
      { file: "duel-web/src/styles.css", from: ".order-list .order-row .choice-order-name {\n  flex: 1 1 6rem;\n  display: -webkit-box;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n  white-space: normal;\n  overflow-wrap: anywhere;\n}", to: ".order-list .order-row .choice-order-name {\n  flex: 1 1 auto;\n}" },
    ], kills: ["demo-audit.spec.ts > /demo?prompt=satori passes the UI audit [phone-375]"] },
    { id: "e2e-readiness-chip-one-line", args: "demo-audit --project=desktop-1280", file: "duel-web/src/board.css", from: "  line-height: 1.2;\n  text-align: center;\n  color: var(--muted);", to: "  line-height: 1.2;\n  text-align: center;\n  white-space: nowrap;\n  color: var(--muted);", kills: ["demo-audit.spec.ts > /demo?prompt=rest passes the UI audit [desktop-1280]"] },
    { id: "e2e-readiness-chip-phone-full-size", args: "demo-audit --project=phone-375", file: "duel-web/src/board.css", from: "    font-size: 0.5rem;\n    padding: 0.18rem 0.3rem;\n", to: "    padding: 0.18rem 0.3rem;\n", kills: ["demo-audit.spec.ts > /demo?prompt=rest passes the UI audit [phone-375]"] },
    { id: "e2e-rested-prompt-tile-turns", args: "demo-audit --project=phone-375", file: "duel-web/src/styles.css", from: ".choice-option .card-tile.rested {\n  transform: none;\n}\n.choice-option .card-tile.rested .card-overlays {\n  inset: 0;\n  width: auto;\n  height: auto;\n  transform: none;\n}\n.choice-option .card-tile.rested .status-chips {\n  bottom: 1.55rem;\n}\n", to: "", kills: ["demo-audit.spec.ts > /demo?prompt=select passes the UI audit [phone-375]"] },
    // The Rotate hint lives in the midline strip; as a fixed toast above the hand it sat on your DON!! row and Trash.
    { id: "e2e-rotate-hint-over-field", args: "demo-audit --project=phone-375", file: "duel-web/src/board.css", from: ".arena .midline .rotate-hint {\n  position: relative;\n  height: 100%;", to: ".arena .midline .rotate-hint {\n  position: fixed;\n  bottom: calc(232px + var(--safe-b));\n  height: 54px;", kills: ["demo-audit.spec.ts > /demo?full passes the UI audit [phone-375]"] },
    // A clicked hand card keeps focus; with :focus-within the centre fan stayed up over the DON!! row.
    { id: "e2e-hand-fan-sticks-after-click", args: "demo-audit --project=desktop-1280 -g tucks", file: "duel-web/src/board.css", from: ".hand-fan.is-open,\n.hand-fan:has(:focus-visible) {", to: ".hand-fan.is-open,\n.hand-fan:focus-within {", kills: ["demo-audit.spec.ts > the centre hand fan tucks away after a click once the pointer leaves [desktop-1280]"] },
    // Tilted board: the inner box is pulled up by its extra height so the tilt folds it back into view.
    { id: "e2e-tilted-board-hangs-off-bottom", args: "demo-audit --project=desktop-1280 -g tilted", file: "duel-web/src/board.css", from: "  margin-top: calc(100cqh * (1 - var(--tilt-grow)));\n", to: "", kills: ["demo-audit.spec.ts > /demo?full with the tilted board passes the UI audit [desktop-1280]"] },
  ],
};
