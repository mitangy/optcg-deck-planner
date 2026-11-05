"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { newNotes, buildMessages, notesForPush } = require("./discord-patch-notes.cjs");

const note = (o) => ({ date: "2026-11-04", app: "duel", pr: 900, title: "T", text: "x", ...o });

test("an older note edited in place is not new (#974)", () => {
  const before = [note({ title: "Old", text: "first wording" })];
  const after = [note({ title: "Fresh", pr: 901 }), note({ title: "Old", text: "reworded later" })];
  assert.deepEqual(newNotes(before, after).map((n) => n.title), ["Fresh"]);
});

test("a second note from the same PR with a new title is new (#974)", () => {
  const before = [note({ title: "First" })];
  const after = [note({ title: "Second" }), note({ title: "First" })];
  assert.deepEqual(newNotes(before, after).map((n) => n.title), ["Second"]);
});

test("new notes come out oldest first so the newest ends up last (#974)", () => {
  const after = [note({ title: "newest" }), note({ title: "middle" }), note({ title: "oldest" })];
  assert.deepEqual(newNotes([], after).map((n) => n.title), ["oldest", "middle", "newest"]);
});

test("messages hold at most 10 embeds (#974)", () => {
  const notes = Array.from({ length: 12 }, (_, i) => note({ title: `n${i}` }));
  const bodies = buildMessages(notes);
  assert.deepEqual(bodies.map((b) => b.embeds.length), [10, 2]);
  assert.equal(bodies[1].embeds[0].title, "n10");
});

test("messages split before the embeds pass 6000 characters, counting title and footer (#974)", () => {
  // description alone: 2 x 2900 = 5800 fits; with a 100-char title and the footer it is 6016 and must not.
  const big = (i) => note({ title: `${i}`.repeat(100), text: "d".repeat(2900) });
  const bodies = buildMessages([big(1), big(2), big(3)]);
  assert.deepEqual(bodies.map((b) => b.embeds.length), [1, 1, 1]);
  const small = (i) => note({ title: `t${i}`, text: "d".repeat(2500) });
  assert.deepEqual(buildMessages([small(1), small(2), small(3)]).map((b) => b.embeds.length), [2, 1]);
});

test("every message disables mentions so note text cannot ping anyone (#974)", () => {
  const notes = Array.from({ length: 11 }, (_, i) => note({ title: `n${i}`, text: "hello @everyone <@&123>" }));
  const bodies = buildMessages(notes);
  assert.equal(bodies.length, 2);
  for (const b of bodies) assert.deepEqual(b.allowed_mentions, { parse: [] });
});

test("each app links its own What's new page and footer (#974)", () => {
  const [d, p, b] = buildMessages([note({ app: "duel" }), note({ app: "planner" }), note({ app: "both" })])[0].embeds;
  assert.equal(d.url, "https://optcgduel.app/whats-new");
  assert.equal(d.footer.text, "Duel app");
  assert.equal(p.url, "https://optcg-deck-planner.app/whats-new");
  assert.equal(p.footer.text, "Deck planner");
  assert.equal(b.url, "https://optcgduel.app/whats-new");
  assert.equal(b.footer.text, "Duel app + Deck planner");
});

test("duel, planner and both notes get three different colors (#974)", () => {
  const colors = buildMessages([note({ app: "duel" }), note({ app: "planner" }), note({ app: "both" })])[0].embeds.map((e) => e.color);
  assert.equal(new Set(colors).size, 3);
});

test("a text over Discord's 4096 limit is cut with an ellipsis (#974)", () => {
  const [e] = buildMessages([note({ text: "a".repeat(5000) })])[0].embeds;
  assert.equal(e.description.length, 4096);
  assert.ok(e.description.endsWith("…"));
});

test("cutting a long text never leaves half an emoji (#974)", () => {
  const [e] = buildMessages([note({ text: "a".repeat(4094) + "\u{1F600}b" })])[0].embeds;
  assert.ok(e.description.length <= 4096);
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(e.description), "lone high surrogate");
});

test("a push posts only the notes missing at the before commit (#974)", () => {
  const before = [note({ title: "Old" })];
  const after = [note({ title: "New" }), note({ title: "Old" })];
  const plan = notesForPush("a".repeat(40), after, () => before);
  assert.deepEqual(plan.notes.map((n) => n.title), ["New"]);
});

test("an all-zero before sha posts nothing instead of the whole backlog (#974)", () => {
  const after = [note({ title: "A" }), note({ title: "B" })];
  const plan = notesForPush("0".repeat(40), after, () => []);
  assert.deepEqual(plan.notes, []);
  assert.ok(plan.reason);
});

test("a before commit that cannot be read posts nothing (#974)", () => {
  const after = [note({ title: "A" }), note({ title: "B" })];
  assert.deepEqual(notesForPush("b".repeat(40), after, () => null).notes, []);
});
