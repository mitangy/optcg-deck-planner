import type { Seat, SeatPlayers, SeatSkin } from "../net/protocol";
import { seatLabel } from "../board/match/playerNames";
import type { ReportPlayer, ReportSource, ReportTarget } from "./reportLogic";

type Skins = readonly [SeatSkin | null, SeatSkin | null] | undefined;

function seatPlayer(players: SeatPlayers | null | undefined, seat: Seat, skins: Skins, fallback?: string): ReportPlayer {
  const skin = skins?.[seat];
  const named = players?.[seat]?.name;
  return {
    name: named ?? fallback ?? seatLabel(players, seat),
    seat,
    images: { playmat: skin?.playmat ?? null, cardBack: skin?.cardBack ?? null },
  };
}

export function matchReportTarget(o: {
  source: ReportSource;
  matchId: string | null;
  spectating: boolean;
  mySeat: Seat | null;
  players: SeatPlayers | null | undefined;
  seatSkins: Skins;
}): ReportTarget | null {
  if (!o.matchId) return null;
  if (o.spectating) {
    return { source: o.source, matchId: o.matchId, players: [seatPlayer(o.players, 0, o.seatSkins), seatPlayer(o.players, 1, o.seatSkins)] };
  }
  if (o.mySeat !== 0 && o.mySeat !== 1) return null;
  const opp: Seat = o.mySeat === 0 ? 1 : 0;
  return { source: o.source, matchId: o.matchId, players: [seatPlayer(o.players, opp, o.seatSkins, "Your opponent")] };
}

export function historyReportTarget(m: { match_id: string; your_seat: number; opponent_name: string }): ReportTarget | null {
  if ((m.your_seat !== 0 && m.your_seat !== 1) || !m.opponent_name) return null;
  const seat: Seat = m.your_seat === 0 ? 1 : 0;
  return { source: "history", matchId: m.match_id, players: [{ name: m.opponent_name, seat }] };
}
