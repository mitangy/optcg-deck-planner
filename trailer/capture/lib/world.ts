/** Believable (and entirely made-up) players, matches and leaderboard rows for the faked backend. */
import { type FakeBoardEntry, type FakeFriend, type FakeMatch } from "./fakeApi";
import { CHOPPER, MIKO, NAMI, ROBIN, SANJI, USOPP, ZORO } from "./data";

export const MIKO_STATS = { rating: 1684, wins: 31, losses: 17, rank: 8, games: 48 };

export function friendsOfMiko(): FakeFriend[] {
  return [
    { uid: ZORO.uid, name: ZORO.name, status: "online" },
    { uid: ROBIN.uid, name: ROBIN.name, status: "online" },
    { uid: NAMI.uid, name: NAMI.name, status: "in_game", room_id: "k7Qp2XaB", ranked: false },
    { uid: USOPP.uid, name: USOPP.name, status: "waiting" },
    { uid: SANJI.uid, name: SANJI.name, status: "offline" },
    { uid: CHOPPER.uid, name: CHOPPER.name, status: "offline" },
  ];
}

export function friendsOfZoro(): FakeFriend[] {
  return [
    { uid: MIKO.uid, name: MIKO.name, status: "online" },
    { uid: NAMI.uid, name: NAMI.name, status: "in_game", room_id: "k7Qp2XaB", ranked: false },
    { uid: SANJI.uid, name: SANJI.name, status: "online" },
    { uid: CHOPPER.uid, name: CHOPPER.name, status: "offline" },
  ];
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

/** Leader ids are real (they must resolve to art); the games are not. */
export function matchesOfMiko(): FakeMatch[] {
  const row = (i: number, h: number, won: boolean, opp: string, oppLeader: string, mine: string, delta: number, ranked = true): FakeMatch => ({
    match_id: `m${i}`,
    created_at: hoursAgo(h),
    ranked,
    your_seat: i % 2,
    won,
    reason: won ? "leader_battle_at_zero_life" : "leader_battle_at_zero_life",
    turns: 9 + ((i * 3) % 8),
    your_leader_id: mine,
    opponent_leader_id: oppLeader,
    opponent_name: opp,
    rating_before: 1684 - delta,
    rating_after: 1684,
    has_replay: true,
    replay_ready: true,
    finished: true,
  });
  return [
    row(1, 1.5, true, "NamiNavigator", "OP01-031", "ST01-001", 14),
    row(2, 5, true, "Zoro_main", "ST02-001", "ST01-001", 12),
    row(3, 26, false, "KaidoMain", "ST04-001", "ST01-001", -11),
    row(4, 30, true, "BigMomsKitchen", "OP01-060", "ST01-001", 13),
    row(5, 52, true, "ShanksGuard", "ST02-001", "ST01-001", 12),
    row(6, 75, false, "NikaDrums", "OP01-061", "ST01-001", -12),
  ];
}

export function leaderboard(me?: { uid: number; name: string; rating: number }): FakeBoardEntry[] {
  const names = [
    ["LuffyEnjoyer", 2214, 311], ["ShanksGuard", 2101, 268], ["KaidoMain", 2046, 402], ["BigMomsKitchen", 1987, 198],
    ["NikaDrums", 1922, 255], ["OdenReborn", 1801, 143], ["MarcoPhoenix", 1745, 176], ["Zoro_main", 1655, 120],
    ["RobinReads", 1642, 133], ["CaptainKidd", 1611, 98], ["NamiNavigator", 1598, 154], ["BrookYohoho", 1570, 87],
    ["WhitebeardFan", 1544, 91], ["LawRoom", 1512, 76], ["Sanji_cooks", 1498, 66], ["UsoppSniper", 1473, 59],
    ["DoflaStrings", 1450, 82], ["ChopperDoc", 1431, 49], ["HancockHeart", 1405, 71], ["BuggyDelivery", 1388, 63],
  ] as const;
  const rows: FakeBoardEntry[] = names.map(([name, rating, games], i) => ({ user_id: 200 + i, name, username: name, rating, games_played: games }));
  if (me) {
    rows.push({ user_id: me.uid, name: me.name, username: me.name, rating: me.rating, games_played: 48 });
    rows.sort((a, b) => b.rating - a.rating);
  }
  return rows;
}
