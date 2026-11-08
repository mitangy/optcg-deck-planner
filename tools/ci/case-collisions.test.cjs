"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { findCollisions } = require("./case-collisions.cjs");

test("a component and a module that share a stem in different case collide (refactor 0.6)", () => {
  assert.deepEqual(findCollisions(["src/board/HandFan.tsx", "src/board/handFan.ts", "src/board/other.ts"]), [
    ["src/board/HandFan.tsx", "src/board/handFan.ts"],
  ]);
});

test("two paths that differ only by case collide whatever their extension (refactor 0.6)", () => {
  assert.equal(findCollisions(["docs/Guide.md", "docs/guide.md"]).length, 1);
});

test("a test, a stylesheet or a same-case sibling does not collide (refactor 0.6)", () => {
  assert.deepEqual(
    findCollisions(["src/HandFan.tsx", "src/HandFan.test.tsx", "src/handFanGeometry.ts", "src/logPose.css", "src/LogPose.tsx", "src/foo.ts", "src/foo.json"]),
    [],
  );
});
