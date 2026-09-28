/** duel-web mutations: source edits, plus a data edit for atlas-content assertions. */
module.exports = {
  cwd: "duel-web",
  runner: "vitest",
  mutations: [
    { id: "narration-uses-ids", file: "duel-web/src/board/battleLog.ts", from: "  return lookupCard(defId).name;", to: "  return defId;", kills: ["describes pending-choice ability prompts"] },
    { id: "unverified-note-missing", file: "duel-web/src/cards/abilitySupport.ts", from: "  if (support === \"unverified\") {\n    return \"Card data has not been verified for duel play yet.\";\n  }", to: "", kills: ["exposes inspect note only for unsupported/partial"] },
    { id: "jinbe-renamed-back", json: "duel-web/src/assets/cardAtlas.json", patch: (atlas) => { atlas["ST01-005"].name = "Usopp"; }, kills: ["resolves ST01-005 to TCGPlayer CDN"] },
    { id: "unknown-id-supported", file: "duel-web/src/cards/atlas.ts", from: "    effectText: \"—\",\n    abilitySupport: \"unverified\",\n    altArts: altArts.length ? altArts : undefined,\n  };\n}", to: "    effectText: \"—\",\n    abilitySupport: \"ok\",\n    altArts: altArts.length ? altArts : undefined,\n  };\n}", kills: ["distinguishes curated coverage"] },
    { id: "cosmetics-override-curated", file: "duel-web/src/cards/atlas.ts", from: "  const base = curatedHit ?? catalogHit ?? stubHit;", to: "  const base = catalogHit ?? curatedHit ?? stubHit;", kills: ["distinguishes curated coverage"] },
    { id: "private-options-allowed", file: "duel-web/src/net/protocol.ts", from: "    if (hiddenViewer && request && \"options\" in request && request.options.some((o) => o.defId && o.defId !== \"HIDDEN\" && !o.instanceId)) {", to: "    if (false) {", kills: ["rejects private choice options sent to the wrong viewer"] },
    { id: "public-targets-flagged", file: "duel-web/src/net/protocol.ts", from: "request.options.some((o) => o.defId && o.defId !== \"HIDDEN\" && !o.instanceId)) {", to: "request.options.some((o) => o.defId && o.defId !== \"HIDDEN\")) {", kills: ["rejects private choice options sent to the wrong viewer"] },
    { id: "owner-treated-as-hidden", file: "duel-web/src/net/protocol.ts", from: "const hiddenViewer = view.spectator || (choice.privateToSeat != null && choice.privateToSeat !== view.seat);", to: "const hiddenViewer = true;", kills: ["rejects private choice options sent to the wrong viewer"] },
    { id: "deck-rules-unchecked", file: "duel-web/src/decks/storage.ts", from: "  if (leaders.length === 1) errors.push(...leaderDeckRuleErrors(leaders[0], cards));", to: "", kills: ["enforces Leader deck-construction rules"] },
    { id: "deck-rules-block-all", file: "duel-web/src/decks/storage.ts", from: "      if (kind === \"max_cost\") return card.cost > Number(arg);", to: "      if (kind === \"max_cost\") return true;", kills: ["enforces Leader deck-construction rules"] },
  ],
};
