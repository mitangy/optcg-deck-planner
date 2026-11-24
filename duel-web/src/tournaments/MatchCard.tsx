import { Menu, MenuButton, MenuItem, MenuList } from "@optcg/ui/popups";
import { matchStatusLabel, offersPlay, playLabel, yourMatchState } from "./bracket";
import type { Person, TournamentMatch } from "./tournamentApi";

function Seat({ p, m, myId }: { p: Person | null; m: TournamentMatch; myId: number }) {
  const won = p !== null && m.winner_id === p.user_id;
  const text = p ? p.username : m.status === "done" && m.decided_by === "bye" ? "Bye" : "TBD";
  const me = p !== null && p.user_id === myId;
  return (
    <div className="tseat" data-won={won || undefined} data-lost={m.winner_id !== null && !won ? true : undefined} data-empty={p ? undefined : true} data-me={me || undefined}>
      <span className="tseat-name">{text}</span>
      {me ? <span className="tseat-you">You</span> : null}
      {won ? <span className="tseat-win">W</span> : null}
    </div>
  );
}

export function MatchCard({
  m,
  myId,
  nextId,
  organizer,
  onAward,
  onPlay,
  busy,
}: {
  m: TournamentMatch;
  myId: number;
  nextId: number | null;
  organizer: boolean;
  onAward: (m: TournamentMatch, p: Person) => void;
  onPlay: (m: TournamentMatch) => void;
  busy: boolean;
}) {
  const mine = m.a?.user_id === myId || m.b?.user_id === myId;
  const ready = m.status === "ready";
  const canPlay = mine && offersPlay(m, nextId === null ? null : { id: nextId });
  const players = [m.a, m.b].filter((p): p is Person => p !== null);
  return (
    <div className="tmatch" data-mine={mine || undefined} data-status={m.status}>
      <Seat p={m.a} m={m} myId={myId} />
      <Seat p={m.b} m={m} myId={myId} />
      <div className="tmatch-foot">
        <span className="tmatch-status">{matchStatusLabel(m)}</span>
        <span className="tmatch-actions">
          {canPlay ? (
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onPlay(m)}>
              {playLabel(yourMatchState(m, myId))}
            </button>
          ) : null}
          {ready && mine && !canPlay ? <span className="tmatch-later">Later</span> : null}
          {ready && organizer ? (
            <Menu>
              <MenuButton type="button" className="btn btn-ghost btn-sm" disabled={busy}>
                Award win
              </MenuButton>
              <MenuList anchor={{ to: "bottom end", gap: 4, padding: 8 }} className="match-menu friend-menu">
                {players.map((p) => (
                  <MenuItem key={p.user_id}>
                    <button type="button" className="match-menu-item" onClick={() => onAward(m, p)}>
                      {p.username} wins
                    </button>
                  </MenuItem>
                ))}
              </MenuList>
            </Menu>
          ) : null}
        </span>
      </div>
    </div>
  );
}
