"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { blockedMedia } = require("./pr-media.cjs");

test("a PNG under docs/pr-shots is blocked (#783)", () => {
  assert.deepEqual(blockedMedia(["docs/pr-shots/home.png"]), ["docs/pr-shots/home.png"]);
});

test("a webm and an mp4 recording outside app media folders are blocked (#783)", () => {
  assert.deepEqual(blockedMedia(["artifacts/run.webm", "artifacts/run.mp4"]), ["artifacts/run.webm", "artifacts/run.mp4"]);
});

test("an uppercase extension is still blocked (#783)", () => {
  assert.deepEqual(blockedMedia(["docs/SHOT.PNG"]), ["docs/SHOT.PNG"]);
});

test("card art, app assets and Playwright baselines are allowed (#783)", () => {
  assert.deepEqual(
    blockedMedia([
      "duel-web/public/cards/preview/OP01-001.png",
      "frontend/src/assets/logo.png",
      "mobile/assets/images/icon.png",
      "frontend/e2e/visual.spec.ts-snapshots/home-chromium-linux.png",
    ]),
    [],
  );
});

test("non-media files and blank lines are not returned (#783)", () => {
  assert.deepEqual(blockedMedia(["docs/x.md", "", "  ", "src/app.ts"]), []);
});
