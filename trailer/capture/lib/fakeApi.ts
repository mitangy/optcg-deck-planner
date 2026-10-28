/**
 * The FastAPI backend, faked in the browser (`context.route`) like duel-web/e2e/fixtures.ts does. Nothing listens
 * on FAKE_API, nothing goes to production, and no account is ever created: the "accounts" below are names in a
 * script. The game server is the real local one; game tokens are signed with its (local) secret.
 */
import { createHmac } from "node:crypto";
import type { BrowserContext, Route } from "playwright";
import { FAKE_ANALYST, FAKE_API, GAME_SERVER, GAME_TOKEN_SECRET, gitSha } from "./env";

export type Person = { uid: number; name: string };

export type FriendStatus = "offline" | "online" | "waiting" | "in_game" | "spectating";
export type FakeFriend = { uid: number; name: string; status: FriendStatus; room_id?: string | null; ranked?: boolean };

export type FakeMatch = {
  match_id: string;
  created_at: string;
  ranked: boolean;
  your_seat: number;
  won: boolean;
  reason: string;
  turns: number;
  your_leader_id: string;
  opponent_leader_id: string;
  opponent_name: string;
  rating_before: number;
  rating_after: number;
  has_replay: boolean;
  replay_ready?: boolean;
  finished?: boolean;
};

export type FakeBoardEntry = { user_id: number; name: string; username: string; rating: number; games_played: number };

/** State shared by every browser in one take (the "server"): friends' presence and the invites between them. */
export class World {
  invites: { toUid: number; id: number; from: Person; room_id: string; server_url: string | null; expires_at: number }[] = [];
  private nextInvite = 1;
  /** Called after an invite is stored, so a capture script can nudge the invited browser's poll. */
  onInvite: ((toUid: number) => void) | null = null;
  presence = new Map<number, { status: FriendStatus; room_id: string | null; ranked: boolean }>();

  addInvite(toUid: number, from: Person, room_id: string, server_url: string | null) {
    const inv = { toUid, id: this.nextInvite++, from, room_id, server_url, expires_at: Math.floor(Date.now() / 1000) + 600 };
    this.invites.push(inv);
    this.onInvite?.(toUid);
    return inv;
  }
}

export type FakeOptions = {
  /** Signed in as this player, or null for a guest. */
  me: (Person & { rating?: number; wins?: number; losses?: number; rank?: number | null; games?: number }) | null;
  world?: World;
  friends?: FakeFriend[];
  leaderboard?: FakeBoardEntry[];
  matches?: FakeMatch[];
  /** match id -> recording body (see e2e/data/replay-purple-red.json). */
  replays?: Record<string, unknown>;
  /** match id -> { match, log }: what the written match log page loads. */
  details?: Record<string, unknown>;
  live?: { online: number; matches: number };
  /** Settings the account already has (they win over the browser's on sign-in). */
  accountSettings?: Record<string, unknown> | null;
  /** Log Pose chat enabled for this player (the analyst service itself is faked per clip, see FAKE_ANALYST). */
  logPose?: boolean;
  /** Anything else: first match wins. Return true when handled. */
  extra?: (route: Route, path: string, method: string) => Promise<boolean> | boolean;
  log?: (line: string) => void;
};

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Same format as the real API's game token (`body.sig`, HMAC-SHA256), signed with the local game server's secret. */
export function mintGameToken(uid: number, name: string): string {
  const body = b64url(JSON.stringify({ uid, email: `${name.toLowerCase()}@example.invalid`, exp: Math.floor(Date.now() / 1000) + 6 * 3600, name }));
  return `${body}.${b64url(createHmac("sha256", GAME_TOKEN_SECRET).update(body).digest())}`;
}

export const cors = (origin: string | undefined) => ({
  "access-control-allow-origin": origin ?? "*",
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type, authorization, accept",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
});

export function friendRow(f: FakeFriend, world?: World) {
  const live = world?.presence.get(f.uid);
  const status = live?.status ?? f.status;
  const room = live ? live.room_id : (f.room_id ?? null);
  return {
    user_id: f.uid,
    username: f.name,
    status,
    room_id: status === "in_game" || status === "spectating" ? room : null,
    server_url: null,
    ranked: live?.ranked ?? f.ranked ?? false,
  };
}

export async function installFakeApi(ctx: BrowserContext, opts: FakeOptions): Promise<void> {
  const me = opts.me;
  const world = opts.world ?? new World();
  const settingsStore: { v: Record<string, unknown> | null } = { v: opts.accountSettings ?? null };
  const decksStore = new Map<string, unknown>();
  const sha = gitSha();
  const log = opts.log ?? (() => undefined);

  // The footer's "Up to date" check reads the dev server's /version.json, which only a production build emits.
  await ctx.route(/\/version\.json(\?.*)?$/, (route) =>
    route.fulfill({ json: { sha, builtAt: new Date().toISOString() }, headers: { "cache-control": "no-store" } }),
  );

  // The local game server remembers every seat an earlier take left behind; the lobby must not offer to "resume" them.
  await ctx.route(`${GAME_SERVER}/active-matches`, (route) =>
    route.fulfill({ json: { matches: [] }, headers: cors(route.request().headers()["origin"]) }),
  );

  await ctx.route(`${FAKE_API}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const headers = cors(req.headers()["origin"]);
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    const json = (body: unknown, status = 200) => route.fulfill({ status, headers, json: body as object });
    const fail = (status: number, detail: string) => json({ detail }, status);

    if (opts.extra && (await opts.extra(route, path, method))) return;

    if (path === "/health") return json({ ok: true });
    if (path === "/auth/me") {
      return me ? json({ id: me.uid, email: `${me.name.toLowerCase()}@example.invalid`, name: me.name, username: me.name, role: "user" }) : fail(401, "Not signed in");
    }
    if (path === "/auth/logout") return json({ ok: true });
    if (path === "/duel/token") {
      if (!me) return fail(401, "Not signed in");
      return json({ token: mintGameToken(me.uid, me.name), expires_at: 0, user_id: me.uid, email: `${me.name.toLowerCase()}@example.invalid`, display_name: me.name, rating: me.rating ?? 1000, games_played: me.games ?? 0 });
    }
    if (path === "/duel/guest-token") {
      const uid = 9000 + Math.floor(Math.random() * 500);
      return json({ token: mintGameToken(uid, `Guest${uid}`), expires_at: 0, user_id: uid, email: `guest${uid}@example.invalid`, rating: 1000, games_played: 0 });
    }
    if (path === "/duel/rating/me") {
      if (!me) return fail(401, "Not signed in");
      return json({
        user_id: me.uid, email: `${me.name.toLowerCase()}@example.invalid`, name: me.name, username: me.name,
        rating: me.rating ?? 1000, games_played: me.games ?? 0, wins: me.wins ?? 0, losses: me.losses ?? 0, rank: me.rank ?? null,
      });
    }
    if (path === "/duel/leaderboard") {
      const limit = Number(url.searchParams.get("limit") ?? 100);
      return json({ entries: (opts.leaderboard ?? []).slice(0, limit) });
    }
    if (path === "/duel/live") return json(opts.live ?? { online: 214, matches: 37 });
    if (path === "/duel/settings") {
      if (method === "PUT") {
        settingsStore.v = (JSON.parse(req.postData() ?? "{}") as { settings: Record<string, unknown> }).settings;
        return json({ ok: true });
      }
      return json({ settings: settingsStore.v });
    }
    if (path === "/duel/cosmetics") return json({ items: [], active: { playmat: null, cardBack: null } });
    if (path.startsWith("/duel/cosmetics/")) return json({ items: [], active: { playmat: null, cardBack: null } });
    if (path === "/duel/decks") {
      if (method === "PUT") {
        const body = JSON.parse(req.postData() ?? "{}") as { decks?: { id: string; deck: unknown; updatedAt: number }[] };
        for (const d of body.decks ?? []) decksStore.set(d.id, { id: d.id, updatedAt: d.updatedAt, deleted: false, deck: d.deck });
        return json({ decks: [...decksStore.values()] });
      }
      return json({ decks: [...decksStore.values()] });
    }
    if (path.startsWith("/duel/decks/")) {
      const id = decodeURIComponent(path.split("/").pop() ?? "");
      if (method === "PUT") {
        const body = JSON.parse(req.postData() ?? "{}") as { deck: unknown; updatedAt: number };
        const row = { id, updatedAt: body.updatedAt, deleted: false, deck: body.deck };
        decksStore.set(id, row);
        return json(row);
      }
      return json({ id, updatedAt: Date.now(), deleted: true });
    }
    if (path === "/duel/matches/me") return json({ matches: opts.matches ?? [] });
    const detail = path.match(/^\/duel\/matches\/me\/([^/]+)$/);
    if (detail) {
      const body = opts.details?.[decodeURIComponent(detail[1])];
      return body ? json(body) : fail(404, "No such match");
    }
    const replay = path.match(/^\/duel\/matches\/me\/([^/]+)\/replay$/);
    if (replay) {
      const body = opts.replays?.[decodeURIComponent(replay[1])];
      return body ? json(body) : fail(404, "No recording");
    }

    // —— Log Pose ——
    if (path === "/analyst/chat/session") {
      return opts.logPose && me
        ? json({ enabled: true, token: "chat.1.9999999999.x", expires_at: new Date(Date.now() + 6 * 3_600_000).toISOString(), chat_url: FAKE_ANALYST })
        : json({ enabled: false });
    }
    if (path.startsWith("/analyst/chat/threads") || path.startsWith("/analyst/reviews/")) return fail(404, "none");

    // —— friends ——
    if (path === "/friends" && me) {
      const rows = (opts.friends ?? []).map((f) => friendRow(f, world));
      const invites = world.invites
        .filter((i) => i.toUid === me.uid)
        .map((i) => ({ id: i.id, from_user_id: i.from.uid, from_username: i.from.name, room_id: i.room_id, server_url: i.server_url, expires_at: i.expires_at }));
      return json({ friends: rows, incoming: [], outgoing: [], invites });
    }
    const invite = path.match(/^\/friends\/(\d+)\/invite$/);
    if (invite && me && method === "POST") {
      const body = JSON.parse(req.postData() ?? "{}") as { room_id: string; server_url?: string | null };
      const inv = world.addInvite(Number(invite[1]), me, body.room_id, body.server_url ?? null);
      return json({ id: inv.id, from_user_id: me.uid, from_username: me.name, room_id: inv.room_id, server_url: inv.server_url, expires_at: inv.expires_at });
    }
    const dismiss = path.match(/^\/friends\/invites\/(\d+)$/);
    if (dismiss && method === "DELETE") {
      world.invites = world.invites.filter((i) => i.id !== Number(dismiss[1]));
      return route.fulfill({ status: 204, headers });
    }

    log(`unhandled ${method} ${path}`);
    return fail(404, "not in the trailer's fake API");
  });
}
