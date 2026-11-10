"use strict";
// Posts new player-facing patch notes to Discord through a webhook (#974).
//
//   node tools/ci/discord-patch-notes.cjs --before <sha> --after <sha> [--dry-run]
//   node tools/ci/discord-patch-notes.cjs --latest <N> [--dry-run]     (newest N from the working tree)
//
// The webhook URL comes from DISCORD_WEBHOOK_URL and is never printed. A "new" note is one
// whose key (noteKey) is not in the notes.ts at the --before commit, so editing the text of
// an existing note does not repost it. Notes are posted oldest first: notes.ts lists the
// newest first, so the newest ends up at the bottom of the channel, where people read.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const util = require("node:util");

const NOTES_PATH = "packages/patch-notes/src/notes.ts";
const ZERO_SHA = /^0+$/;
const MAX_EMBEDS = 10;
const MAX_MESSAGE_CHARS = 6000; // Discord: title + description + footer over all embeds of a message
const MAX_TITLE = 256;
const MAX_DESCRIPTION = 4096;

const APPS = {
  duel: { url: "https://optcgduel.app/whats-new", color: 0xe5484d, footer: "Duel app" },
  planner: { url: "https://optcg-deck-planner.app/whats-new", color: 0x3e8ef7, footer: "Deck planner" },
  both: { url: "https://optcgduel.app/whats-new", color: 0x8e4ec6, footer: "Duel app + Deck planner" },
};

function noteKey(n) {
  return `${n.date}|${n.app}|${n.pr ?? ""}|${n.title}`;
}

/** Notes in `after` that `before` does not have, oldest first (the file lists newest first). */
function newNotes(before, after) {
  const seen = new Set(before.map(noteKey));
  return after.filter((n) => !seen.has(noteKey(n))).reverse();
}

/** Cut to `max` UTF-16 units with an ellipsis, never splitting a surrogate pair. */
function truncate(s, max) {
  if (s.length <= max) return s;
  let out = s.slice(0, max - 1);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out + "…";
}

function toEmbed(n) {
  const app = APPS[n.app] || APPS.both;
  return {
    title: truncate(n.title, MAX_TITLE),
    description: truncate(n.text, MAX_DESCRIPTION),
    url: app.url,
    color: app.color,
    footer: { text: app.footer },
  };
}

const embedChars = (e) => e.title.length + e.description.length + e.footer.text.length;

/** Webhook JSON bodies, at most 10 embeds and 6000 embed characters each, in the order given. */
function buildMessages(notes) {
  const bodies = [];
  let embeds = [];
  let chars = 0;
  const flush = () => {
    if (!embeds.length) return;
    bodies.push({ username: "Patch notes", allowed_mentions: { parse: [] }, embeds });
    embeds = [];
    chars = 0;
  };
  for (const n of notes) {
    const e = toEmbed(n);
    const c = embedChars(e);
    if (embeds.length >= MAX_EMBEDS || chars + c > MAX_MESSAGE_CHARS) flush();
    embeds.push(e);
    chars += c;
  }
  flush();
  return bodies;
}

/**
 * Which notes a push to main should post. `loadBefore()` returns the notes at the before
 * commit, or null when that commit or file is not in history. A zero or unknown before
 * posts nothing: the whole backlog must never land in the channel.
 */
function notesForPush(beforeSha, afterNotes, loadBefore) {
  if (!beforeSha || ZERO_SHA.test(beforeSha)) return { notes: [], reason: "no previous commit (new branch or first push); posting nothing" };
  const before = loadBefore();
  if (!before) return { notes: [], reason: `could not read ${NOTES_PATH} at ${beforeSha}; posting nothing` };
  return { notes: newNotes(before, afterNotes), reason: "" };
}

/** Parse a notes.ts source. Node 22 strips types natively; otherwise evaluate the array literal. */
async function parseNotesSource(source, dir) {
  const file = path.join(dir, "notes.ts");
  fs.writeFileSync(file, source);
  fs.writeFileSync(path.join(dir, "types.ts"), "export type PatchApp = \"duel\" | \"planner\" | \"both\";\nexport type PatchNote = { date: string; app: PatchApp; title: string; text: string; pr?: number };\n");
  try {
    const mod = await import(require("node:url").pathToFileURL(file).href);
    if (Array.isArray(mod.PATCH_NOTES)) return mod.PATCH_NOTES;
  } catch {
    // fall through to the literal evaluation below
  }
  const body = source
    .replace(/^\s*import\s+type\s+[^;]*;/gm, "")
    .replace(/export\s+const\s+PATCH_NOTES\s*:\s*PatchNote\[\]\s*=/, "return");
  const notes = new Function(body)();
  if (!Array.isArray(notes)) throw new Error("PATCH_NOTES is not an array");
  return notes;
}

async function loadNotes(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "patch-notes-"));
  try {
    return await parseNotesSource(source, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function gitShow(sha) {
  try {
    return execFileSync("git", ["show", `${sha}:${NOTES_PATH}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function postOne(url, body, { maxRetries = 4 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) {
      throw new Error(`request failed: ${String(e && e.message).split(url).join("<webhook>")}`);
    }
    if (res.ok) return;
    const text = await res.text().catch(() => "");
    if (res.status === 429 && attempt < maxRetries) {
      let wait = 1;
      try {
        wait = Number(JSON.parse(text).retry_after) || Number(res.headers.get("retry-after")) || 1;
      } catch {
        wait = Number(res.headers.get("retry-after")) || 1;
      }
      console.log(`Rate limited; retrying in ${wait}s`);
      await sleep(Math.ceil(wait * 1000) + 100);
      continue;
    }
    throw new Error(`Discord answered ${res.status}: ${text.slice(0, 500)}`);
  }
}

function parseCliArgs(argv) {
  const { values } = util.parseArgs({
    args: argv,
    options: {
      "dry-run": { type: "boolean", default: false },
      before: { type: "string" },
      after: { type: "string" },
      latest: { type: "string" },
    },
    allowPositionals: false,
  });
  return { dryRun: values["dry-run"], before: values.before, after: values.after, latest: values.latest };
}

async function main(argv) {
  const o = parseCliArgs(argv);
  let notes;
  if (o.latest !== undefined) {
    const n = Number.parseInt(o.latest, 10);
    if (!Number.isInteger(n) || n < 1) throw new Error("--latest needs a whole number of 1 or more");
    const all = await loadNotes(fs.readFileSync(path.join(__dirname, "..", "..", NOTES_PATH), "utf8"));
    notes = all.slice(0, n).reverse();
  } else if (o.after) {
    const afterSource = gitShow(o.after);
    if (afterSource === null) throw new Error(`cannot read ${NOTES_PATH} at ${o.after}`);
    const afterNotes = await loadNotes(afterSource);
    const beforeSource = !o.before || ZERO_SHA.test(o.before) ? null : gitShow(o.before);
    const beforeNotes = beforeSource === null ? null : await loadNotes(beforeSource);
    const plan = notesForPush(o.before, afterNotes, () => beforeNotes);
    if (plan.reason) console.log(plan.reason);
    notes = plan.notes;
  } else {
    throw new Error("usage: --before <sha> --after <sha> | --latest <N>  [--dry-run]");
  }
  if (!notes.length) {
    console.log("No new patch notes to post.");
    return;
  }
  const bodies = buildMessages(notes);
  console.log(`${notes.length} new patch note(s) in ${bodies.length} message(s).`);
  if (o.dryRun) {
    console.log(JSON.stringify(bodies, null, 2));
    return;
  }
  const url = (process.env.DISCORD_WEBHOOK_URL || "").trim();
  if (!url) {
    console.log("::notice::DISCORD_PATCH_NOTES_WEBHOOK secret is not set; skipping the Discord post.");
    return;
  }
  for (const [i, body] of bodies.entries()) {
    await postOne(url, body);
    console.log(`Posted message ${i + 1}/${bodies.length}.`);
  }
}

module.exports = { noteKey, newNotes, buildMessages, notesForPush, truncate, parseNotesSource };

if (require.main === module) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`::error::${String(e && e.message).replace(process.env.DISCORD_WEBHOOK_URL || "\0", "<webhook>")}`);
    process.exit(1);
  });
}
