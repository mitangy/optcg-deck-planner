#!/usr/bin/env node
"use strict";

/** Live games in a /health body, or null when the server did not report a usable count. */
function liveMatchesOf(health) {
  const n = health && health.liveMatches;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Polls until the game server reports zero live matches. An unreachable server or an unknown count
 * counts as busy: a deploy must never start on a guess.
 * @returns {Promise<{idle: boolean, polls: number}>}
 */
async function waitForIdle({ getHealth, sleep, now, maxWaitMs, intervalMs, log = () => {} }) {
  const deadline = now() + maxWaitMs;
  let polls = 0;
  for (;;) {
    polls++;
    let live = null;
    try {
      live = liveMatchesOf(await getHealth());
    } catch (e) {
      log(`health check failed: ${e.message}`);
    }
    if (live === 0) return { idle: true, polls };
    log(live === null ? "live match count unavailable" : `${live} live match${live === 1 ? "" : "es"}`);
    if (now() + intervalMs > deadline) return { idle: false, polls };
    await sleep(intervalMs);
  }
}

module.exports = { liveMatchesOf, waitForIdle };

async function main() {
  const { GAME_SERVER_URL, RENDER_GAME_SERVER_DEPLOY_HOOK, MAX_WAIT_MINUTES } = process.env;
  const missing = [];
  if (!GAME_SERVER_URL) missing.push("repo variable GAME_SERVER_URL");
  if (!RENDER_GAME_SERVER_DEPLOY_HOOK) missing.push("secret RENDER_GAME_SERVER_DEPLOY_HOOK");
  if (missing.length) {
    console.error(`::error::Not configured: ${missing.join(", ")}`);
    process.exit(1);
  }
  const minutes = Number(MAX_WAIT_MINUTES || 30);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    console.error(`::error::max wait minutes must be a positive number, got "${MAX_WAIT_MINUTES}"`);
    process.exit(1);
  }
  const url = `${GAME_SERVER_URL.replace(/\/+$/, "")}/health`;
  const { idle } = await waitForIdle({
    getHealth: async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: Date.now,
    maxWaitMs: minutes * 60_000,
    intervalMs: 30_000,
    log: (m) => console.log(m),
  });
  if (!idle) {
    console.error(`::error::Games were still running after ${minutes} minutes; nothing was deployed.`);
    process.exit(1);
  }
  console.log("No live matches. Triggering the deploy.");
  const res = await fetch(RENDER_GAME_SERVER_DEPLOY_HOOK, { method: "POST" });
  if (!res.ok) {
    console.error(`::error::Deploy hook answered HTTP ${res.status}`);
    process.exit(1);
  }
  console.log("Deploy triggered.");
}

if (require.main === module) main().catch((e) => {
  console.error(`::error::${e.message}`);
  process.exit(1);
});
