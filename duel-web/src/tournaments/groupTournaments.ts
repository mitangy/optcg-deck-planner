import type { TournamentSummary } from "./tournamentApi";

export type TournamentGroups = {
  now: TournamentSummary[];
  signingUp: TournamentSummary[];
  finished: TournamentSummary[];
};

/** Buckets by status; cancelled tournaments are not listed. Order within a bucket is kept. */
export function groupTournaments(list: readonly TournamentSummary[]): TournamentGroups {
  return {
    now: list.filter((t) => t.status === "running"),
    signingUp: list.filter((t) => t.status === "open"),
    finished: list.filter((t) => t.status === "finished"),
  };
}
