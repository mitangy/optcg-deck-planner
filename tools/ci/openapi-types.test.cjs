"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { compareGenerated } = require("./openapi-types.cjs");

test("an identical file passes the generated-types check", () => {
  assert.deepEqual(compareGenerated("a\nb\n", "a\nb\n"), { ok: true });
});

test("a Windows checkout with CRLF line endings is not drift", () => {
  assert.deepEqual(compareGenerated("a\r\nb\r\n", "a\nb\n"), { ok: true });
});

test("a changed line fails the check and names the first differing line", () => {
  assert.deepEqual(compareGenerated("a\nb\nc\n", "a\nX\nc\n"), { ok: false, line: 2, committed: "b", fresh: "X" });
});

test("a type the backend added fails the check even when every committed line still matches", () => {
  const result = compareGenerated("a\nb", "a\nb\nc");
  assert.equal(result.ok, false);
  assert.equal(result.line, 3);
});
