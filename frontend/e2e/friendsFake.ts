/**
 * Fake friends / spares / trades API for the friends specs (#703). Registered after the base planner fixture, so
 * these routes answer first and everything else falls through to the base fake. State is kept in memory and
 * follows the API contract: sender-side lines, 409 when a spare is gone, apply changes only the caller's owned counts.
 */
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";

type Card = { card_id: string; name: string; rarity: string; color: string; card_type: string; cost: number | null; product_id: number | null; market_price: number; needed: number };
const CARDS = JSON.parse(readFileSync(new URL("./fixtures/cards.json", import.meta.url), "utf8")) as Card[];
const byId = (id: string) => CARDS.find((c) => c.card_id === id)!;
const img = (p: number | null) => (p ? `https://tcgplayer-cdn.tcgplayer.com/product/${p}_200w.jpg` : "");

export const ME = { id: 1, username: "nami" };
export const KAI = { id: 2, username: "kai" };
export const ZORO = { id: 3, username: "zoro" };
export const KAI_DECK_ID = 11;
export const COPIED_DECK_ID = 1;
const NOW = Math.floor(new Date("2026-01-15T12:00:00Z").getTime() / 1000);

type Line = { side: "give" | "get"; card_id: string; product_id: number | null; qty: number };
export type FakeTrade = { id: number; from: typeof ME; to: typeof ME; status: string; message: string; lines: Line[]; applied: boolean; deltas: Record<string, number> };

export type FriendsFake = {
  trades: FakeTrade[];
  friends: (typeof ME)[];
  incomingRequests: (typeof ME)[];
  outgoingRequests: (typeof ME)[];
  sent: { path: string; body: unknown }[];
  /** Copies Kai has to spare, by card. */
  kaiSpare: Map<string, number>;
  mySpare: Map<string, number>;
  keep: Map<string, number>;
  sharing: { decks: string; collection: string; trades_open: boolean; show_values: boolean; prompted: boolean };
  kaiSharesCollection: boolean;
  username: string | null;
};

export type Seed = { trades?: FakeTrade[]; prompted?: boolean; noUsername?: boolean };

export function trade(over: Partial<FakeTrade> & Pick<FakeTrade, "id" | "lines">): FakeTrade {
  return { from: KAI, to: ME, status: "pending", message: "", applied: false, deltas: {}, ...over };
}

export async function installFriendsApi(page: Page, owned: Map<string, number>, seed: Seed = {}): Promise<FriendsFake> {
  const fake: FriendsFake = {
    trades: seed.trades ?? [],
    friends: [KAI],
    incomingRequests: [ZORO],
    outgoingRequests: [],
    sent: [],
    kaiSpare: new Map([
      ["EB01-003", 3],
      ["EB01-009", 1],
      ["EB01-002", 2],
      ["EB01-006", 1],
    ]),
    mySpare: new Map([["EB01-006", 2]]),
    keep: new Map(),
    sharing: { decks: "friends", collection: "friends", trades_open: true, show_values: false, prompted: seed.prompted ?? true },
    kaiSharesCollection: true,
    username: seed.noUsername ? null : ME.username,
  };
  const me = () => ({ id: ME.id, email: "nami@e2e.test", name: "Nami", sum_across_leaders: false, username: fake.username });
  const nameOf = (id: number) => [ME, KAI, ZORO].find((u) => u.id === id)!.username;

  const spareItem = (card_id: string, spare: number, want: number, printings: unknown[] = []) => {
    const c = byId(card_id);
    return { card_id, name: c.name, rarity: c.rarity, color: c.color, card_type: c.card_type, cost: c.cost, image_url: img(c.product_id), market_price: c.market_price, spare, want, printings };
  };
  const myWant = (id: string) => Math.max(0, byId(id).needed - (owned.get(id) ?? 0));
  const kaiSpares = () => {
    const items = [...fake.kaiSpare.entries()]
      .filter(([, n]) => n > 0)
      .map(([id, n]) => spareItem(id, n, myWant(id), id === "EB01-002" ? [{ product_id: 201, label: "Alt art", image_url: img(201), owned: 1 }] : []));
    return items.sort((a, b) => a.name.localeCompare(b.name));
  };
  const tradeOut = (t: FakeTrade, viewer: number) => {
    const price = (id: string) => byId(id).market_price;
    const value = (side: string) => Math.round(t.lines.filter((l) => l.side === side).reduce((n, l) => n + l.qty * price(l.card_id), 0) * 100) / 100;
    return {
      id: t.id,
      from_user_id: t.from.id,
      from_username: t.from.username,
      to_user_id: t.to.id,
      to_username: t.to.username,
      status: t.status,
      message: t.message,
      parent_offer_id: null,
      created_at: NOW - 3600,
      responded_at: null,
      completed_at: t.status === "completed" ? NOW : null,
      expires_at: NOW + 14 * 86400,
      lines: t.lines.map((l) => {
        const c = byId(l.card_id);
        return { ...l, name: c.name, image_url: img(c.product_id), market_price: c.market_price, printing_label: l.product_id ? "Alt art" : null };
      }),
      give_value: value("give"),
      get_value: value("get"),
      i_am_sender: t.from.id === viewer,
      my_applied: t.applied,
      other_applied: false,
    };
  };
  const mine = () => fake.trades.filter((t) => t.from.id === ME.id || t.to.id === ME.id);
  const kaiDeck = () => {
    const ids: [string, number][] = [["EB01-001", 1], ["EB01-002", 4], ["EB01-003", 4], ["EB01-009", 2]];
    const cards = ids.map(([id, needed]) => {
      const c = byId(id);
      const my_owned = owned.get(id) ?? 0;
      return { card_id: id, name: c.name, rarity: c.rarity, color: c.color, card_type: c.card_type, cost: c.cost, needed, image_url: img(c.product_id), market_price: c.market_price, my_owned, my_still_need: Math.max(0, needed - my_owned) };
    });
    const nonLeader = cards.filter((c) => c.card_type !== "Leader");
    return {
      id: KAI_DECK_ID,
      name: "Kai's Oden",
      leader_card_id: "EB01-001",
      leader_name: "Kouzuki Oden",
      leader_image_url: img(100),
      main_cards: 10,
      cards,
      my_missing_copies: nonLeader.reduce((n, c) => n + c.my_still_need, 0),
      my_missing_cost: Math.round(nonLeader.reduce((n, c) => n + c.my_still_need * (c.market_price ?? 0), 0) * 100) / 100,
    };
  };

  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, "");
    const method = req.method();
    const body = () => JSON.parse(req.postData() ?? "{}") as Record<string, any>;
    const json = (b: unknown, status = 200) => route.fulfill({ status, json: b });
    let m: RegExpMatchArray | null;

    if (path === "/auth/me" && method === "GET") return json(me());
    if (path === "/auth/me/username-suggestion") return json({ username: "nami_op" });
    if (path === "/auth/me/username" && method === "PATCH") {
      fake.username = body().username;
      return json(me());
    }
    if (path === "/me/sharing" && method === "GET") return json(fake.sharing);
    if (path === "/me/sharing" && method === "PUT") {
      fake.sharing = { ...fake.sharing, ...body(), prompted: true };
      return json(fake.sharing);
    }
    if (path === "/friends" && method === "GET")
      return json({ friends: fake.friends.map((f) => ({ user_id: f.id, username: f.username, status: "offline", room_id: null, ranked: false })), incoming: fake.incomingRequests.map((f) => ({ user_id: f.id, username: f.username })), outgoing: fake.outgoingRequests.map((f) => ({ user_id: f.id, username: f.username })), invites: [] });
    if (path === "/friends/requests" && method === "POST") {
      const name = String(body().username);
      fake.sent.push({ path, body: body() });
      if (name === "nobody") return json({ detail: "No player with that username." }, 404);
      fake.outgoingRequests.push({ id: 50, username: name });
      return json({ status: "pending" });
    }
    if ((m = path.match(/^\/friends\/requests\/(\d+)\/accept$/)) && method === "POST") {
      const id = Number(m[1]);
      const who = fake.incomingRequests.find((r) => r.id === id)!;
      fake.incomingRequests = fake.incomingRequests.filter((r) => r.id !== id);
      fake.friends.push(who);
      return json({ status: "accepted" });
    }
    if ((m = path.match(/^\/friends\/(\d+)$/)) && method === "DELETE") {
      const id = Number(m[1]);
      fake.incomingRequests = fake.incomingRequests.filter((r) => r.id !== id);
      fake.outgoingRequests = fake.outgoingRequests.filter((r) => r.id !== id);
      fake.friends = fake.friends.filter((r) => r.id !== id);
      return route.fulfill({ status: 204 });
    }

    if ((m = path.match(/^\/friends\/(\d+)\/(.*)$/)) && Number(m[1]) === KAI.id) {
      const rest = m[2]!;
      if (rest === "profile")
        return json({
          user_id: KAI.id,
          username: KAI.username,
          decks_shared: true,
          collection_shared: fake.kaiSharesCollection,
          trades_open: true,
          deck_count: 1,
          unique_cards: fake.kaiSharesCollection ? 4 : null,
          total_copies: fake.kaiSharesCollection ? 9 : null,
          total_value: null,
          spare_cards: kaiSpares().length,
        });
      if (rest === "decks")
        return json([{ id: KAI_DECK_ID, name: "Kai's Oden", leader_card_id: "EB01-001", leader_name: "Kouzuki Oden", leader_image_url: img(100), total_cards: 10, main_cards: 10 }]);
      if (rest === `decks/${KAI_DECK_ID}`) return json(kaiDeck());
      if (rest === `decks/${KAI_DECK_ID}/copy` && method === "POST") {
        fake.sent.push({ path, body: null });
        return json({ id: COPIED_DECK_ID, name: "Kai's Oden (kai)", leader_card_id: "EB01-001", leader_name: "Kouzuki Oden", prior_decks: [], cards: [], main_cards: 0, don_cards: 0 });
      }
      if (rest === "collection")
        return json({
          items: ["EB01-002", "EB01-003", "EB01-006"].map((id, i) => {
            const c = byId(id);
            return { card_id: id, name: c.name, rarity: c.rarity, color: c.color, card_type: c.card_type, cost: c.cost, owned: 3 + i, alts_owned: 0, market_price: c.market_price, image_url: img(c.product_id), value: null, spare: fake.kaiSpare.get(id) ?? 0 };
          }),
          unique_cards: 3,
          total_copies: 12,
          total_value: null,
        });
      if (rest === "spares") {
        const theirs = kaiSpares();
        const mine = [...fake.mySpare.entries()].filter(([, n]) => n > 0).map(([id, n]) => spareItem(id, n, 2));
        return json({ their_spares: theirs, you_need: theirs.filter((i) => i.want > 0), they_need: mine });
      }
    }

    if (path === "/me/spares")
      return json({ items: [...fake.mySpare.entries()].filter(([id, n]) => n > 0 || (fake.keep.get(id) ?? 0) > 0).map(([id, n]) => ({ ...spareItem(id, n, 0), keep_qty: fake.keep.get(id) ?? 0 })) });
    if ((m = path.match(/^\/me\/trade-keep\/(.+)$/)) && method === "PUT") {
      const id = decodeURIComponent(m[1]!);
      const keep = body().keep_qty as number;
      const total = (fake.mySpare.get(id) ?? 0) + (fake.keep.get(id) ?? 0);
      fake.keep.set(id, keep);
      fake.mySpare.set(id, Math.max(0, total - keep));
      return json({ card_id: id, keep_qty: keep, spare: Math.max(0, total - keep) });
    }

    if (path === "/trades/summary") {
      const t = mine();
      return json({ incoming_pending: t.filter((x) => x.status === "pending" && x.to.id === ME.id).length, active: t.filter((x) => x.status === "accepted" || (x.status === "completed" && !x.applied)).length });
    }
    if (path === "/trades" && method === "GET") {
      const t = mine();
      const active = t.filter((x) => x.status === "accepted" || (x.status === "completed" && !x.applied));
      return json({
        incoming: t.filter((x) => x.status === "pending" && x.to.id === ME.id).map((x) => tradeOut(x, ME.id)),
        outgoing: t.filter((x) => x.status === "pending" && x.from.id === ME.id).map((x) => tradeOut(x, ME.id)),
        active: active.map((x) => tradeOut(x, ME.id)),
        history: t.filter((x) => !active.includes(x) && x.status !== "pending").map((x) => tradeOut(x, ME.id)),
      });
    }
    if (path === "/trades" && method === "POST") {
      const b = body();
      fake.sent.push({ path, body: b });
      const t = trade({ id: 200 + fake.trades.length, from: ME, to: [KAI, ZORO].find((u) => u.id === b.to_user_id)!, message: b.message, lines: b.lines });
      fake.trades.push(t);
      return json(tradeOut(t, ME.id), 201);
    }
    if (method === "POST" && (m = path.match(/^\/trades\/(\d+)\/(accept|decline|cancel|complete|apply|counter)$/))) {
      const t = fake.trades.find((x) => x.id === Number(m![1]))!;
      const action = m[2]!;
      if (action === "accept") {
        t.status = "accepted";
      }
      if (action === "decline") t.status = "declined";
      if (action === "cancel") t.status = "cancelled";
      if (action === "complete") t.status = "completed";
      if (action === "counter") {
        const b = body();
        fake.sent.push({ path, body: b });
        t.status = "countered";
        fake.trades.push(trade({ id: 300, from: ME, to: KAI, message: b.message, lines: b.lines }));
      }
      if (action === "apply") {
        // Only my own half: what I give comes off my owned counts, what I get goes on.
        const iAmSender = t.from.id === ME.id;
        for (const l of t.lines) {
          const iGive = (l.side === "give") === iAmSender;
          const delta = iGive ? -l.qty : l.qty;
          const before = owned.get(l.card_id) ?? 0;
          const next = Math.max(0, before + delta);
          t.deltas[l.card_id] = next - before;
          owned.set(l.card_id, next);
        }
        t.applied = true;
      }
      return json(tradeOut(t, ME.id));
    }
    if ((m = path.match(/^\/trades\/(\d+)\/apply$/)) && method === "DELETE") {
      const t = fake.trades.find((x) => x.id === Number(m![1]))!;
      for (const [id, d] of Object.entries(t.deltas)) owned.set(id, (owned.get(id) ?? 0) - d);
      t.deltas = {};
      t.applied = false;
      return json(tradeOut(t, ME.id));
    }
    return route.fallback();
  });
  return fake;
}
