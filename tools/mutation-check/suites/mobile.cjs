/** mobile mutations: the atlas assertions check exported card data, so the opposite conditions are data edits. */
const atlas = "mobile/assets/cardAtlas.json";
module.exports = {
  cwd: "mobile",
  runner: "vitest",
  mutations: [
    { id: "atlas-missing-official-card", json: atlas, patch: (a) => { delete a["OP01-013"]; }, kills: ["card atlas"] },
    { id: "atlas-conditional-rush-static", json: atlas, patch: (a) => { a["ST01-004"].rush = true; }, kills: ["card atlas"] },
    { id: "atlas-printed-rush-missing", json: atlas, patch: (a) => { delete a["OP09-118"].rush; }, kills: ["card atlas"] },
    { id: "atlas-traits-missing", json: atlas, patch: (a) => { a["OP12-002"].traits = []; }, kills: ["card atlas"] },
    { id: "atlas-trigger-flag-missing", json: atlas, patch: (a) => { delete a["ST01-014"].hasTrigger; }, kills: ["card atlas"] },
  ],
};
