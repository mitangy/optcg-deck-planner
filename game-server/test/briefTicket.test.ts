import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "mocha";
import { getGameTokenSecret } from "../src/env.js";
import { verifyGameToken } from "../src/gameToken.js";
import { BRIEF_TICKET_TTL_SEC, mintBriefTicket } from "../src/briefTicket.js";

type Vector = {
  secret: string;
  now: number;
  claims: { mid: string; seat: 0 | 1; ranked: boolean; leader: string; opponent: string; deck: string[] };
  ticket: string;
};
const vector = JSON.parse(
  readFileSync(new URL("../../backend/tests/fixtures/brief_ticket_vector.json", import.meta.url), "utf8"),
) as Vector;

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function withSecret<T>(secret: string, fn: () => T): Promise<T> {
  const prev = process.env.GAME_TOKEN_SECRET;
  process.env.GAME_TOKEN_SECRET = secret;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.GAME_TOKEN_SECRET;
    else process.env.GAME_TOKEN_SECRET = prev;
  }
}

const claims = {
  mid: "room-1",
  seat: 0 as const,
  ranked: false,
  leader: "OP01-001",
  opponent: "ST01-001",
  deck: ["ST01-003", "ST01-006"],
};

describe("matchup brief ticket", () => {
  it("a brief ticket is not a game token and needs the brief key (#401)", () => {
    const ticket = mintBriefTicket(claims)!;
    assert.ok(ticket.startsWith("mb1."));
    const [, body, sig] = ticket.split(".");
    // As a game token (body.sig) it does not verify.
    assert.equal(verifyGameToken(`${body}.${sig}`), null);
    // Signed with the bare secret it would differ.
    const bare = b64url(createHmac("sha256", getGameTokenSecret()).update(body!).digest());
    assert.notEqual(sig, bare);
    const salted = b64url(createHmac("sha256", "match-brief:" + getGameTokenSecret()).update(body!).digest());
    assert.equal(sig, salted);
  });

  it("a ranked game gets no ticket and the ticket lasts three hours (#401)", () => {
    assert.equal(mintBriefTicket({ ...claims, ranked: true }), null);
    const t = mintBriefTicket(claims, 1000)!;
    const payload = JSON.parse(Buffer.from(t.split(".")[1]!, "base64url").toString("utf8"));
    assert.equal(payload.exp, 1000 + BRIEF_TICKET_TTL_SEC);
    assert.equal(payload.ranked, false);
  });

  it("the game server signs the shared brief ticket vector (#401)", async () => {
    const t = await withSecret(vector.secret, () => mintBriefTicket(vector.claims, vector.now));
    assert.equal(t, vector.ticket);
  });
});
