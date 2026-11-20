import { useState } from "react";
import { useMediaQuery } from "@optcg/ui/hooks";
import { defaultPhoneRound, groupByRound, roundLabel } from "./bracket";
import { MatchCard } from "./MatchCard";
import type { Person, TournamentMatch } from "./tournamentApi";

export const PHONE_QUERY = "(max-width: 640px)";

type CardProps = {
  myId: number;
  nextId: number | null;
  organizer: boolean;
  busy: boolean;
  onPlay: (m: TournamentMatch) => void;
  onAward: (m: TournamentMatch, p: Person) => void;
};

export function Bracket({ matches, rounds, next, ...card }: CardProps & { matches: readonly TournamentMatch[]; rounds: number; next: TournamentMatch | null }) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [picked, setPicked] = useState<number | null>(null);
  const grouped = groupByRound(matches);
  if (phone) {
    const fallback = defaultPhoneRound(matches, next);
    const active = grouped.some((r) => r.round === picked) ? (picked as number) : fallback;
    const current = grouped.find((r) => r.round === active);
    return (
      <div className="tphone">
        <div className="tseg" role="tablist" aria-label="Rounds">
          {grouped.map((r) => (
            <button
              key={r.round}
              type="button"
              role="tab"
              id={`tround-tab-${r.round}`}
              aria-selected={r.round === active}
              aria-controls="tround-panel"
              className="tseg-btn"
              onClick={() => setPicked(r.round)}
            >
              {roundLabel(r.round, rounds)}
            </button>
          ))}
        </div>
        <div id="tround-panel" role="tabpanel" aria-labelledby={`tround-tab-${active}`} className="tround-list-phone">
          {current?.matches.map((m) => (
            <MatchCard key={m.id} m={m} {...card} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="tbracket" tabIndex={0} role="group" aria-label="Bracket rounds" style={{ ["--rounds" as string]: rounds }}>
      {grouped.map((r) => (
        <h3 key={`h${r.round}`} className="tround-title" style={{ gridColumn: r.round, gridRow: 1 }}>
          {roundLabel(r.round, rounds)}
        </h3>
      ))}
      {grouped.flatMap((r) => {
        const span = 2 ** (r.round - 1);
        return r.matches.map((m) => (
          <div
            key={m.id}
            className="tcell"
            data-side={m.slot % 2 === 0 ? "top" : "bottom"}
            style={{ gridColumn: r.round, gridRow: `${m.slot * span + 2} / span ${span}` }}
          >
            {r.round > 1 ? <span className="tcon tcon-in" aria-hidden /> : null}
            <MatchCard m={m} {...card} />
            {r.round < rounds ? <span className="tcon tcon-out" aria-hidden /> : null}
            {r.round < rounds ? <span className="tcon tcon-join" aria-hidden /> : null}
          </div>
        ));
      })}
    </div>
  );
}
