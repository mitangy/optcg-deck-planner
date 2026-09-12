/**
 * Catalog of leader abilities wired (or planned) into the rules engine.
 *
 * Timing keys:
 * - activate_main: player spends an Activate:Main action on their turn
 * - opponent_turn_static: passive while it is the opponent's turn
 * - on_opp_attack: after an opponent declares an attack, before Block
 */
export type LeaderAbilityTiming =
  | "activate_main"
  | "opponent_turn_static"
  | "on_opp_attack";

export type LeaderAbilityEntry = {
  leaderId: string;
  name: string;
  timing: LeaderAbilityTiming;
  summary: string;
  /** Engine hook status */
  status: "implemented" | "stub";
};

export const LEADER_ABILITY_CATALOG: readonly LeaderAbilityEntry[] = [
  {
    leaderId: "ST01-001",
    name: "Monkey.D.Luffy",
    timing: "activate_main",
    summary:
      "Activate: Main [Once Per Turn] — attach 1 rested DON!! from cost area to Leader or a Character.",
    status: "implemented",
  },
  {
    leaderId: "OP17-001",
    name: "Edward.Newgate",
    timing: "on_opp_attack",
    summary:
      "On Opponent's Attack [Once Per Turn] — trash 1 hand card: give one Leader/Character +4000 power this battle.",
    status: "implemented",
  },
  {
    leaderId: "OP16-080",
    name: "Marshall.D.Teach",
    timing: "opponent_turn_static",
    summary:
      "Opponent's Turn — opponent's Characters cost +1.",
    status: "implemented",
  },
  {
    leaderId: "OP16-080",
    name: "Marshall.D.Teach",
    timing: "on_opp_attack",
    summary:
      "On Opponent's Attack [Once Per Turn] — trash 1 [Trigger] from hand: redirect attack to this Leader or a {Blackbeard Pirates} Character.",
    status: "implemented",
  },
] as const;
